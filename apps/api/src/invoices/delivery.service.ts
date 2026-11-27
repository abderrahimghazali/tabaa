import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DeliveryKind, Invoice, SendInvoiceInput, SendInvoicePreview } from '@facture/core';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException, conflict, invalid } from '../common/errors.js';
import { invoiceDeliveries, invoicePdfs } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { env } from '../env.js';
import { MailService } from '../mail/mail.service.js';
import { defaultDelivery, messageHtml, remainingOf } from './delivery-mail.js';
import { InvoicesService } from './invoices.service.js';

const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 200;
const LINE_BREAKS = /[\r\n\u0085\u2028\u2029\0]/;
const platformAddress = (/<([^>]+)>/.exec(env.mailFrom)?.[1] ?? env.mailFrom).trim();

const normalize = (list: string[]) => [...new Set(list.map((a) => a.trim().toLowerCase()))];

// The display name goes into a header: keep it to plain characters.
const displayName = (company: string) =>
  `${company.replace(/[\u0000-\u001f\u007f<>"\\,;:@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Tabaa'} via Tabaa`;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger('Delivery');

  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async sendable(id: string, kind: DeliveryKind): Promise<Invoice> {
    const invoice = await this.invoices.get(id);
    if (invoice.state !== 'ISSUED') throw conflict('Seule une facture émise peut être envoyée.');
    if (kind === 'REMINDER' && (invoice.type === 'CREDIT_NOTE' || remainingOf(invoice).lte(0))) {
      throw conflict('Aucun montant restant à régler : un rappel n’a pas lieu d’être.');
    }
    return invoice;
  }

  async preview(id: string, kind: DeliveryKind): Promise<SendInvoicePreview> {
    const invoice = await this.sendable(id, kind);
    const { subject, message } = defaultDelivery(invoice, kind);
    return { to: invoice.customer.email ? [invoice.customer.email.trim().toLowerCase()] : [], subject, message };
  }

  async send(id: string, input: SendInvoiceInput): Promise<Invoice> {
    const to = normalize(input.to);
    const cc = normalize(input.cc).filter((a) => !to.includes(a));
    const subject = input.subject.trim();
    if (LINE_BREAKS.test(input.subject) || [...input.to, ...input.cc].some((a) => LINE_BREAKS.test(a))) {
      throw invalid('Données invalides.', [
        { path: LINE_BREAKS.test(input.subject) ? 'subject' : 'to', rule: 'schema', message: 'Les retours à la ligne ne sont pas autorisés ici.' },
      ]);
    }
    const bad = [...to, ...cc].find((a) => !z.email().safeParse(a).success);
    if (bad) throw invalid('Données invalides.', [{ path: 'to', rule: 'schema', message: 'Adresse e-mail invalide.' }]);

    const invoice = await this.sendable(id, input.kind);
    const tx = this.t.tx;
    // One send at a time per workspace, so the limits below cannot be raced past.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`send:${this.t.tenantId}`}))`);
    const [{ hour, day }] = (
      await tx.execute<{ hour: number; day: number }>(sql`
        select count(*) filter (where sent_at > now() - interval '1 hour')::int as hour, count(*)::int as day
        from invoice_deliveries where sent_at > now() - interval '1 day'`)
    ).rows;
    if (hour >= HOURLY_LIMIT || day >= DAILY_LIMIT) {
      throw new ApiException(429, 'SEND_LIMIT', 'Limite d’envois atteinte pour cet espace de travail, réessayez plus tard.');
    }

    const [pdf] = await tx.select({ content: invoicePdfs.content }).from(invoicePdfs).where(eq(invoicePdfs.invoiceId, id));
    if (!pdf) throw new ApiException(409, 'PDF_NOT_GENERATED', 'Le PDF de cette facture n’a pas encore été généré.');
    const number = invoice.number!;
    const attachments = [{ filename: `${number}.pdf`, content: pdf.content, contentType: 'application/pdf' }];
    if (input.attachUbl) {
      attachments.push({ filename: `${number}.xml`, content: Buffer.from(await this.invoices.ubl(id)), contentType: 'application/xml' });
    }

    const message = input.message.trim() ? input.message : defaultDelivery(invoice, input.kind).message;
    const replyTo = invoice.seller?.email && z.email().safeParse(invoice.seller.email).success ? invoice.seller.email : undefined;
    try {
      await this.mail.send({
        from: { name: displayName(invoice.seller!.name), address: platformAddress },
        ...(replyTo && { replyTo }),
        to,
        ...(cc.length && { cc }),
        subject,
        text: message,
        html: messageHtml(message),
        attachments,
        retry: { attempts: 2, backoff: { delay: '300ms', jitter: 'none' } },
      });
    } catch (err) {
      const who = createHash('sha256').update(`${this.t.tenantId}:${id}`).digest('hex').slice(0, 12);
      this.logger.warn(`Invoice mail ${who} failed: ${err instanceof Error ? err.name : 'error'}`);
      throw new ApiException(502, 'MAIL_FAILED', 'Le serveur de messagerie n’a pas accepté l’envoi. Réessayez dans un instant.');
    }

    await tx.insert(invoiceDeliveries).values({
      tenantId: this.t.tenantId,
      invoiceId: id,
      kind: input.kind,
      to,
      cc,
      subject,
      message,
      attachUbl: input.attachUbl,
      sentBy: this.t.ctx.userId ?? null,
      sentByName: this.t.ctx.userName ?? null,
    });
    const count = to.length + cc.length;
    await this.audit.record({
      action: input.kind === 'REMINDER' ? 'invoice.reminder_sent' : 'invoice.sent',
      entityType: 'invoice',
      entityId: id,
      summary: `${count} destinataire${count > 1 ? 's' : ''}`,
    });
    return this.invoices.get(id);
  }
}
