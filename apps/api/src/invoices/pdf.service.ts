import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException, conflict, notFound } from '../common/errors.js';
import { invoicePdfs, invoices } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';

@Injectable()
export class PdfService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async issued(id: string) {
    const [inv] = await this.t.tx.select({ number: invoices.number, state: invoices.state }).from(invoices).where(eq(invoices.id, id));
    if (!inv) throw notFound('Facture');
    if (inv.state !== 'ISSUED') throw conflict('Le PDF n’existe que pour une facture émise.');
    return inv;
  }

  async store(id: string, content: Buffer) {
    // The controller checks this too; repeated here so the size and hash below never run on anything but bytes.
    if (!Buffer.isBuffer(content)) throw new ApiException(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type application/pdf requis.');
    await this.issued(id);
    // A stored file is permanent, so an empty or truncated one must never get in.
    const tail = content.subarray(Math.max(0, content.byteLength - 1024)).toString('latin1');
    const complete =
      content.byteLength >= 1024 &&
      content.subarray(0, 5).toString('latin1') === '%PDF-' &&
      tail.includes('%%EOF') &&
      /\/Type\s*\/Page\b/.test(content.toString('latin1'));
    if (!complete) {
      throw new ApiException(422, 'VALIDATION', 'Le fichier n’est pas un PDF complet.', [
        { path: 'body', rule: 'schema', message: 'Le contenu doit être un PDF complet contenant au moins une page.' },
      ]);
    }
    const sha256 = createHash('sha256').update(content).digest('hex');
    const rows = await this.t.tx
      .insert(invoicePdfs)
      .values({
        tenantId: this.t.tenantId,
        invoiceId: id,
        content,
        sha256,
        sizeBytes: content.byteLength,
        createdBy: this.t.ctx.userId ?? null,
      })
      .onConflictDoNothing({ target: invoicePdfs.invoiceId })
      .returning({ id: invoicePdfs.id });
    if (!rows.length) throw new ApiException(409, 'PDF_ALREADY_STORED', 'Un PDF est déjà enregistré pour cette facture.');
    await this.audit.record({ action: 'invoice.pdf_stored', entityType: 'invoice', entityId: id, summary: `sha256:${sha256}` });
  }

  async read(id: string) {
    const inv = await this.issued(id);
    const [pdf] = await this.t.tx.select().from(invoicePdfs).where(eq(invoicePdfs.invoiceId, id));
    if (!pdf) throw new ApiException(404, 'PDF_NOT_GENERATED', 'Le PDF n’a pas encore été généré.');
    return { number: inv.number!, content: pdf.content, sha256: pdf.sha256 };
  }
}
