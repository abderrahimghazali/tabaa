import { Inject, Injectable } from '@nestjs/common';
import {
  activeRules,
  amountInWords,
  buildUbl,
  computeInvoice,
  defaultDueDate,
  isOverdue,
  paymentStatusOf,
  validateForIssue,
  type Company,
  type Invoice,
  type InvoiceDelivery,
  type InvoiceInput,
  type InvoiceSummary,
  type Party,
  type Payment,
  type PaymentInput,
} from '@facture/core';
import { Decimal } from 'decimal.js';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { companies, invoiceDeliveries, invoices, numberingSequences, parties, payments } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { conflict, invalid, notFound } from '../common/errors.js';
import { dto, money, today } from '../common/util.js';

type Row = typeof invoices.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

const sumOf = (rows: { amount: string }[]) => rows.reduce((s, p) => s.plus(p.amount), new Decimal(0));

@Injectable()
export class InvoicesService {
  constructor(@Inject(TenantDb) private readonly t: TenantDb) {}

  private get tx() {
    return this.t.tx;
  }

  private async company() {
    const [row] = await this.tx.select().from(companies);
    if (!row) throw conflict('Veuillez d’abord renseigner les informations de votre société.');
    return row;
  }

  private async party(id: string) {
    const [row] = await this.tx.select().from(parties).where(eq(parties.id, id));
    if (!row) throw notFound('Client');
    return row;
  }

  private async lock(id: string) {
    const [row] = await this.tx.select().from(invoices).where(eq(invoices.id, id)).for('update');
    if (!row) throw notFound('Facture');
    return row;
  }

  private inputOf(row: Row): InvoiceInput {
    return {
      type: row.type as InvoiceInput['type'],
      customerId: row.customerId,
      issueDate: row.issueDate,
      ...(row.deliveryDate && { deliveryDate: row.deliveryDate }),
      dueDate: row.dueDate,
      currency: row.currency,
      language: row.language as InvoiceInput['language'],
      paymentMethod: row.paymentMethod as InvoiceInput['paymentMethod'],
      ...(row.reference && { reference: row.reference }),
      ...(row.notes && { notes: row.notes }),
      ...(row.originalInvoiceId && { originalInvoiceId: row.originalInvoiceId }),
      lines: row.lines,
    };
  }

  private totalsOf(input: Pick<InvoiceInput, 'lines' | 'paymentMethod' | 'issueDate'>) {
    return computeInvoice(input.lines, {
      paymentMethod: input.paymentMethod,
      rules: activeRules(input.issueDate),
    });
  }

  private columns(company: typeof companies.$inferSelect, customer: typeof parties.$inferSelect, input: InvoiceInput) {
    const totals = this.totalsOf(input);
    return {
      companyId: company.id,
      customerId: input.customerId,
      type: input.type,
      issueDate: input.issueDate,
      deliveryDate: input.deliveryDate ?? null,
      dueDate:
        input.dueDate ??
        defaultDueDate({
          issueDate: input.issueDate,
          deliveryDate: input.deliveryDate,
          termDays: customer.paymentTermDays ?? company.defaultPaymentTermDays,
          rules: activeRules(input.issueDate),
        }),
      currency: input.currency,
      language: input.language ?? company.invoiceLanguage,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      originalInvoiceId: input.originalInvoiceId ?? null,
      totalNet: totals.totalNet,
      totalVat: totals.totalVat,
      totalGross: totals.totalGross,
      stampDuty: totals.stampDuty,
      amountDue: totals.amountDue,
      lines: input.lines,
    };
  }

  private status(row: Row, paid: Decimal) {
    const remaining = new Decimal(row.amountDue).minus(paid);
    const issued = row.state === 'ISSUED';
    return {
      paymentStatus: paymentStatusOf(row.amountDue, money(paid)),
      overdue: issued && row.type !== 'CREDIT_NOTE' && isOverdue(row.dueDate, today(), money(remaining)),
    };
  }

  private paymentDto(p: PaymentRow) {
    return dto(p) as Payment;
  }

  private build(row: Row, party: typeof parties.$inferSelect, pays: PaymentRow[], liveSeller: Company | null, deliveries: InvoiceDelivery[]): Invoice {
    const issued = row.state === 'ISSUED';
    const input = this.inputOf(row);
    const totals = issued ? row.snapshot!.totals : this.totalsOf(input);
    const paid = sumOf(pays);
    return {
      ...input,
      dueDate: row.dueDate,
      language: row.language as Invoice['language'],
      id: row.id,
      number: row.number,
      state: row.state as Invoice['state'],
      totals,
      amountInWords: {
        fr: amountInWords(totals.amountDue, 'fr'),
        ar: amountInWords(totals.amountDue, 'ar'),
      },
      paidAmount: money(paid),
      ...this.status(row, paid),
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      seller: issued ? row.snapshot!.seller : liveSeller,
      customer: issued ? row.snapshot!.customer : (dto(party) as Party),
      payments: pays.map((p) => this.paymentDto(p)),
      deliveries,
    };
  }

  async get(id: string): Promise<Invoice> {
    const [row] = await this.tx.select().from(invoices).where(eq(invoices.id, id));
    if (!row) throw notFound('Facture');
    const party = await this.party(row.customerId);
    const pays = await this.tx
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, id), isNull(payments.voidedAt)))
      .orderBy(asc(payments.paidOn), asc(payments.createdAt));
    const [companyRow] = row.state === 'DRAFT' ? await this.tx.select().from(companies) : [];
    const sent = await this.tx
      .select()
      .from(invoiceDeliveries)
      .where(eq(invoiceDeliveries.invoiceId, id))
      .orderBy(desc(invoiceDeliveries.sentAt));
    const deliveries: InvoiceDelivery[] = sent.map((d) => ({
      id: d.id,
      kind: d.kind as InvoiceDelivery['kind'],
      to: d.to,
      cc: d.cc,
      subject: d.subject,
      sentAt: d.sentAt.toISOString(),
      sentByName: d.sentByName,
    }));
    return this.build(row, party, pays, companyRow ? (dto(companyRow) as Company) : null, deliveries);
  }

  async summaries(filter: { state?: string; status?: string; q?: string; customerId?: string } = {}, limit?: number) {
    const rows = await this.tx
      .select({ inv: invoices, customerName: parties.name })
      .from(invoices)
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(
        and(
          filter.state === 'DRAFT' || filter.state === 'ISSUED' ? eq(invoices.state, filter.state) : undefined,
          filter.customerId ? eq(invoices.customerId, filter.customerId) : undefined,
          filter.q
            ? or(ilike(invoices.number, `%${filter.q}%`), ilike(parties.name, `%${filter.q}%`))
            : undefined,
        ),
      )
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
      .limit(limit ?? 1_000_000);
    const sums = await this.tx
      .select({ invoiceId: payments.invoiceId, paid: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(isNull(payments.voidedAt))
      .groupBy(payments.invoiceId);
    const paidBy = new Map(sums.map((s) => [s.invoiceId, new Decimal(s.paid)]));
    const sent = await this.tx
      .select({ invoiceId: invoiceDeliveries.invoiceId, last: sql<Date>`max(${invoiceDeliveries.sentAt})` })
      .from(invoiceDeliveries)
      .groupBy(invoiceDeliveries.invoiceId);
    const lastSent = new Map(sent.map((d) => [d.invoiceId, new Date(d.last).toISOString()]));
    const out: InvoiceSummary[] = rows.map(({ inv, customerName }) => {
      const paid = paidBy.get(inv.id) ?? new Decimal(0);
      return {
        id: inv.id,
        number: inv.number,
        type: inv.type as InvoiceSummary['type'],
        state: inv.state as InvoiceSummary['state'],
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        paidAmount: money(paid),
        ...this.status(inv, paid),
        customerName: inv.snapshot?.customer.name ?? customerName,
        totalGross: inv.totalGross,
        amountDue: inv.amountDue,
        lastSentAt: lastSent.get(inv.id) ?? null,
      };
    });
    const { status } = filter;
    if (!status) return out;
    return out.filter((s) => (status === 'OVERDUE' ? s.overdue : s.state === 'ISSUED' && s.paymentStatus === status));
  }

  async create(input: InvoiceInput): Promise<Invoice> {
    const company = await this.company();
    const customer = await this.party(input.customerId);
    const [row] = await this.tx
      .insert(invoices)
      .values({
        ...this.columns(company, customer, input),
        tenantId: this.t.tenantId,
        state: 'DRAFT',
      })
      .returning();
    return this.get(row.id);
  }

  async update(id: string, input: InvoiceInput): Promise<Invoice> {
    const current = await this.lock(id);
    if (current.state !== 'DRAFT') throw conflict('Une facture émise ne peut plus être modifiée.');
    const company = await this.company();
    const customer = await this.party(input.customerId);
    await this.tx.update(invoices).set(this.columns(company, customer, input)).where(eq(invoices.id, id));
    return this.get(id);
  }

  async remove(id: string) {
    const current = await this.lock(id);
    if (current.state !== 'DRAFT') throw conflict('Une facture émise ne peut pas être supprimée.');
    await this.tx.delete(invoices).where(eq(invoices.id, id));
  }

  async issue(id: string): Promise<Invoice> {
    const row = await this.lock(id);
    if (row.state !== 'DRAFT') throw conflict('Cette facture est déjà émise.');
    const company = await this.company();
    const customer = await this.party(row.customerId);
    const input = this.inputOf(row);
    const totals = this.totalsOf(input);
    const issues = validateForIssue({
      company: dto(company) as Company,
      customer: dto(customer) as Party,
      invoice: input,
      totals,
      rules: activeRules(row.issueDate),
    });
    if (issues.some((i) => i.severity === 'error')) {
      throw invalid(
        'La facture ne peut pas être émise.',
        issues.map(({ path, rule, message }) => ({ path, rule, message })),
      );
    }
    const series = row.type === 'CREDIT_NOTE' ? 'AV' : 'FA';
    const year = Number(row.issueDate.slice(0, 4));
    const [seq] = await this.tx
      .insert(numberingSequences)
      .values({ tenantId: this.t.tenantId, companyId: company.id, series, year, lastValue: 1 })
      .onConflictDoUpdate({
        target: [
          numberingSequences.tenantId,
          numberingSequences.companyId,
          numberingSequences.series,
          numberingSequences.year,
        ],
        set: { lastValue: sql`${numberingSequences.lastValue} + 1` },
      })
      .returning({ lastValue: numberingSequences.lastValue });
    await this.tx
      .update(invoices)
      .set({
        state: 'ISSUED',
        number: `${series}-${year}-${String(seq.lastValue).padStart(5, '0')}`,
        issuedAt: new Date(),
        retainUntil: `${year + activeRules(row.issueDate).retentionYears}-12-31`,
        snapshot: { customer: dto(customer) as Party, totals, seller: dto(company) as Company },
        totalNet: totals.totalNet,
        totalVat: totals.totalVat,
        totalGross: totals.totalGross,
        stampDuty: totals.stampDuty,
        amountDue: totals.amountDue,
      })
      .where(eq(invoices.id, id));
    return this.get(id);
  }

  async creditNote(id: string): Promise<Invoice> {
    const original = await this.get(id);
    if (original.state !== 'ISSUED') throw conflict('Seule une facture émise peut donner lieu à un avoir.');
    if (original.type === 'CREDIT_NOTE') throw conflict('Un avoir ne peut pas être annulé par un autre avoir.');
    return this.create({
      type: 'CREDIT_NOTE',
      customerId: original.customer.id,
      issueDate: today(),
      currency: original.currency,
      language: original.language,
      paymentMethod: original.paymentMethod,
      originalInvoiceId: original.id,
      lines: original.lines,
    });
  }

  async ubl(id: string): Promise<string> {
    const invoice = await this.get(id);
    if (invoice.state !== 'ISSUED') throw conflict('Seule une facture émise peut être exportée en UBL.');
    let originalNumber: string | undefined;
    if (invoice.originalInvoiceId) {
      const [orig] = await this.tx
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.originalInvoiceId));
      originalNumber = orig?.number ?? undefined;
    }
    return buildUbl({ company: invoice.seller!, invoice, originalNumber });
  }

  async addPayment(id: string, input: PaymentInput): Promise<Invoice> {
    const row = await this.lock(id);
    if (row.state !== 'ISSUED' || row.type === 'CREDIT_NOTE') {
      throw conflict('Un paiement ne peut être enregistré que sur une facture émise.');
    }
    const existing = await this.tx.select().from(payments).where(and(eq(payments.invoiceId, id), isNull(payments.voidedAt)));
    const remaining = new Decimal(row.amountDue).minus(sumOf(existing));
    const amount = new Decimal(input.amount);
    if (amount.lte(0)) {
      throw invalid('Montant invalide.', [
        { path: 'amount', rule: 'PAYMENT-POSITIVE', message: 'Le montant doit être supérieur à zéro.' },
      ]);
    }
    if (amount.gt(remaining)) {
      throw invalid('Montant invalide.', [
        {
          path: 'amount',
          rule: 'PAYMENT-EXCEEDS',
          message: `Le montant dépasse le reste à payer (${money(remaining)}).`,
        },
      ]);
    }
    await this.tx.insert(payments).values({
      tenantId: this.t.tenantId,
      invoiceId: id,
      paidOn: input.paidOn,
      method: input.method,
      amount: money(amount),
      reference: input.reference ?? null,
    });
    return this.get(id);
  }

  async removePayment(paymentId: string): Promise<Invoice> {
    const [p] = await this.tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), isNull(payments.voidedAt)));
    if (!p) throw notFound('Paiement');
    await this.lock(p.invoiceId);
    await this.tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedBy: this.t.ctx.userId ?? null })
      .where(eq(payments.id, paymentId));
    return this.get(p.invoiceId);
  }
}
