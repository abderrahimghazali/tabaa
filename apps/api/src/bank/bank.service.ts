import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { BankImport, BankImportInput, BankMatchInput, BankSuggestion, BankTransaction, BankTransactionList } from '@facture/core';
import { Decimal } from 'decimal.js';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException, conflict, invalid, notFound } from '../common/errors.js';
import { money } from '../common/util.js';
import { bankImports, bankTransactions, invoices, parties, payments } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { InvoicesService } from '../invoices/invoices.service.js';

type Line = typeof bankTransactions.$inferSelect;
type Status = BankTransaction['status'];

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');
const lineHash = (date: string, amount: string, label: string, reference: string | null) =>
  createHash('sha256').update([date, new Decimal(amount).toFixed(), label, reference ?? ''].join('\u0000')).digest('hex');

// Lower case, no accents, letters and digits only: "FA-2026-00012" and "fa 2026 00012" compare equal.
const squash = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const LEGAL_FORMS = /\b(sarl|sarlau|sa|sas|snc|ste|societe)\b/gi;
const nameKey = (name: string) => squash(name.normalize('NFD').replace(/\p{M}/gu, '').replace(LEGAL_FORMS, ' '));

const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class BankService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get tx() {
    return this.t.tx;
  }

  async importLines(input: BankImportInput): Promise<BankImport> {
    const lines = input.lines.map((l, position) => {
      const label = collapse(l.label);
      const reference = l.reference?.trim() ? collapse(l.reference) : null;
      const amount = money(l.amount);
      return { position, date: l.date, label, amount, reference, hash: lineHash(l.date, amount, label, reference) };
    });
    const blank = lines.findIndex((l) => !l.label);
    if (blank >= 0) {
      throw invalid('Données invalides.', [{ path: `lines.${blank}.label`, rule: 'schema', message: 'Le libellé ne peut pas être vide.' }]);
    }
    // Duplicates are judged against what the workspace held before this file; inside the file they are kept.
    const known = new Set<string>();
    const hashes = [...new Set(lines.map((l) => l.hash))];
    for (let i = 0; i < hashes.length; i += 1000) {
      const found = await this.tx
        .select({ hash: bankTransactions.hash })
        .from(bankTransactions)
        .where(inArray(bankTransactions.hash, hashes.slice(i, i + 1000)));
      for (const f of found) known.add(f.hash);
    }
    const fresh = lines.filter((l) => !known.has(l.hash));
    const accountLabel = input.accountLabel.trim();
    const [imp] = await this.tx
      .insert(bankImports)
      .values({
        tenantId: this.t.tenantId,
        fileName: input.fileName.trim(),
        accountLabel,
        importedBy: this.t.ctx.userId ?? null,
        importedByName: this.t.ctx.userName ?? null,
        lineCount: fresh.length,
        duplicateCount: lines.length - fresh.length,
      })
      .returning();
    for (let i = 0; i < fresh.length; i += 500) {
      await this.tx
        .insert(bankTransactions)
        .values(fresh.slice(i, i + 500).map((l) => ({ ...l, tenantId: this.t.tenantId, importId: imp.id })));
    }
    await this.audit.record({
      action: 'bank.imported',
      entityType: 'bank_import',
      entityId: imp.id,
      summary: `${imp.fileName}: ${imp.lineCount} lignes, ${imp.duplicateCount} doublons`,
    });
    return this.importDto(imp, 0);
  }

  private importDto(i: typeof bankImports.$inferSelect, matchedCount: number): BankImport {
    return {
      id: i.id,
      fileName: i.fileName,
      accountLabel: i.accountLabel,
      importedAt: i.importedAt.toISOString(),
      importedByName: i.importedByName,
      lineCount: i.lineCount,
      duplicateCount: i.duplicateCount,
      matchedCount,
    };
  }

  async imports(): Promise<BankImport[]> {
    const rows = await this.tx.select().from(bankImports).orderBy(desc(bankImports.importedAt), desc(bankImports.id));
    const matched = await this.tx
      .select({ importId: bankTransactions.importId, n: count() })
      .from(bankTransactions)
      .where(eq(bankTransactions.status, 'MATCHED'))
      .groupBy(bankTransactions.importId);
    const byImport = new Map(matched.map((m) => [m.importId, m.n]));
    return rows.map((r) => this.importDto(r, byImport.get(r.id) ?? 0));
  }

  async removeImport(id: string) {
    const [imp] = await this.tx.select().from(bankImports).where(eq(bankImports.id, id));
    if (!imp) throw notFound('Import');
    // Locks the lines, so a match running at the same time either finishes first or fails.
    const lines = await this.tx.select({ status: bankTransactions.status }).from(bankTransactions).where(eq(bankTransactions.importId, id)).for('update');
    if (lines.some((l) => l.status === 'MATCHED')) {
      throw new ApiException(409, 'HAS_MATCHES', 'Des lignes de cet import sont rapprochées de factures : annulez ces rapprochements d’abord.');
    }
    await this.tx.delete(bankImports).where(eq(bankImports.id, id));
    await this.audit.record({ action: 'bank.import_deleted', entityType: 'bank_import', entityId: id, summary: `${imp.fileName}: ${imp.lineCount} lignes` });
  }

  async list(f: { status?: Status; q?: string; importId?: string; page: number; pageSize: number }): Promise<BankTransactionList> {
    const q = f.q?.trim();
    const base = and(
      f.importId ? eq(bankTransactions.importId, f.importId) : undefined,
      q
        ? or(ilike(bankTransactions.label, `%${likeEscape(q)}%`), ilike(bankTransactions.reference, `%${likeEscape(q)}%`))
        : undefined,
    );
    const grouped = await this.tx
      .select({ status: bankTransactions.status, n: count() })
      .from(bankTransactions)
      .where(base)
      .groupBy(bankTransactions.status);
    const counts = { UNMATCHED: 0, MATCHED: 0, IGNORED: 0 };
    for (const g of grouped) counts[g.status as Status] = g.n;
    const total = f.status ? counts[f.status] : counts.UNMATCHED + counts.MATCHED + counts.IGNORED;
    const rows = await this.tx
      .select({ line: bankTransactions, accountLabel: bankImports.accountLabel })
      .from(bankTransactions)
      .innerJoin(bankImports, eq(bankImports.id, bankTransactions.importId))
      .where(and(base, f.status ? eq(bankTransactions.status, f.status) : undefined))
      .orderBy(desc(bankTransactions.date), desc(bankImports.importedAt), asc(bankTransactions.position), asc(bankTransactions.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);
    return { items: await this.hydrate(rows), total, counts };
  }

  private async hydrate(rows: { line: Line; accountLabel: string }[]): Promise<BankTransaction[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.line.id);
    const paid = await this.tx
      .select({
        id: payments.id,
        bankTransactionId: payments.bankTransactionId,
        invoiceId: payments.invoiceId,
        amount: payments.amount,
        number: invoices.number,
        customerName: sql<string>`coalesce(${invoices.snapshot} #>> '{customer,name}', ${parties.name})`,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(and(inArray(payments.bankTransactionId, ids), isNull(payments.voidedAt)))
      .orderBy(asc(payments.createdAt), asc(payments.id));
    const allocations = new Map<string, BankTransaction['allocations']>();
    for (const p of paid) {
      const list = allocations.get(p.bankTransactionId!) ?? [];
      list.push({ paymentId: p.id, invoiceId: p.invoiceId, number: p.number ?? '', customerName: p.customerName, amount: p.amount });
      allocations.set(p.bankTransactionId!, list);
    }
    const open = rows.filter((r) => r.line.status === 'UNMATCHED' && new Decimal(r.line.amount).gt(0));
    const candidates = open.length ? await this.openInvoices() : [];
    return rows.map(({ line, accountLabel }) => ({
      id: line.id,
      importId: line.importId,
      accountLabel,
      date: line.date,
      label: line.label,
      amount: line.amount,
      reference: line.reference,
      status: line.status as Status,
      allocations: allocations.get(line.id) ?? [],
      suggestions: line.status === 'UNMATCHED' && new Decimal(line.amount).gt(0) ? this.suggest(line, candidates) : [],
    }));
  }

  // Issued, non-credit-note invoices with something left to pay, in one query.
  private async openInvoices() {
    const rows = await this.tx
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        amountDue: invoices.amountDue,
        paid: sql<string>`coalesce(sum(${payments.amount} + ${payments.vatWithheld} + ${payments.taxWithheld}), 0)`,
        customerName: sql<string>`coalesce(${invoices.snapshot} #>> '{customer,name}', ${parties.name})`,
      })
      .from(invoices)
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .leftJoin(payments, and(eq(payments.invoiceId, invoices.id), isNull(payments.voidedAt)))
      .where(and(eq(invoices.state, 'ISSUED'), ne(invoices.type, 'CREDIT_NOTE')))
      .groupBy(invoices.id, parties.name);
    return rows
      .map((r) => ({
        invoiceId: r.id,
        number: r.number!,
        numberKey: squash(r.number!),
        customerName: r.customerName,
        nameKey: nameKey(r.customerName),
        dueDate: r.dueDate,
        remaining: new Decimal(r.amountDue).minus(r.paid),
      }))
      .filter((r) => r.remaining.gt(0));
  }

  private suggest(line: Line, candidates: Awaited<ReturnType<BankService['openInvoices']>>): BankSuggestion[] {
    const text = squash(`${line.label} ${line.reference ?? ''}`);
    const nameText = nameKey(`${line.label} ${line.reference ?? ''}`);
    const amount = new Decimal(line.amount);
    const scored = [];
    for (const c of candidates) {
      const reasons: BankSuggestion['reasons'] = [];
      if (text.includes(c.numberKey)) reasons.push('NUMBER');
      if (c.remaining.eq(amount)) reasons.push('AMOUNT');
      if (c.nameKey.length >= 3 && nameText.includes(c.nameKey)) reasons.push('CUSTOMER');
      if (reasons.length) scored.push({ c, reasons });
    }
    const rank = (r: BankSuggestion['reasons']) => (r.includes('NUMBER') ? 4 : 0) + (r.includes('AMOUNT') ? 2 : 0) + (r.includes('CUSTOMER') ? 1 : 0);
    scored.sort((a, b) => rank(b.reasons) - rank(a.reasons) || a.c.dueDate.localeCompare(b.c.dueDate) || a.c.number.localeCompare(b.c.number));
    return scored.slice(0, 5).map(({ c, reasons }) => ({
      invoiceId: c.invoiceId,
      number: c.number,
      customerName: c.customerName,
      dueDate: c.dueDate,
      amountDue: money(c.remaining),
      reasons,
    }));
  }

  private async one(id: string): Promise<BankTransaction> {
    const [row] = await this.tx
      .select({ line: bankTransactions, accountLabel: bankImports.accountLabel })
      .from(bankTransactions)
      .innerJoin(bankImports, eq(bankImports.id, bankTransactions.importId))
      .where(eq(bankTransactions.id, id));
    if (!row) throw notFound('Ligne bancaire');
    return (await this.hydrate([row]))[0];
  }

  private async lock(id: string) {
    const [line] = await this.tx.select().from(bankTransactions).where(eq(bankTransactions.id, id)).for('update');
    if (!line) throw notFound('Ligne bancaire');
    return line;
  }

  async match(id: string, input: BankMatchInput): Promise<BankTransaction> {
    const line = await this.lock(id);
    if (line.status !== 'UNMATCHED' || new Decimal(line.amount).lte(0)) {
      throw new ApiException(409, 'NOT_MATCHABLE', 'Cette ligne ne peut pas être rapprochée.');
    }
    const total = input.allocations.reduce((s, a) => s.plus(money(a.amount)), new Decimal(0));
    if (total.gt(line.amount)) {
      throw invalid('Données invalides.', [
        { path: 'allocations', rule: 'BANK-SUM', message: `La somme des affectations dépasse le montant de la ligne (${line.amount}).` },
      ]);
    }
    // Same order for everyone, so two matches touching the same invoices cannot deadlock.
    const ordered = [...input.allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    const reference = line.reference ?? line.label.slice(0, 100);
    for (const a of ordered) {
      const amount = money(a.amount);
      try {
        await this.invoices.addPayment(a.invoiceId, { paidOn: line.date, method: input.method, amount, vatWithheld: '0', taxWithheld: '0', reference }, line.id);
      } catch (err) {
        if (err instanceof ApiException) {
          const body = err.getResponse() as { issues?: { rule: string }[]; message: string };
          if (body.issues?.some((i) => i.rule === 'PAYMENT-EXCEEDS')) throw new ApiException(409, 'OVERPAYMENT', body.message);
        }
        throw err;
      }
      await this.audit.record({ action: 'payment.recorded', entityType: 'invoice', entityId: a.invoiceId, summary: `${amount} ${input.method}` });
    }
    await this.tx.update(bankTransactions).set({ status: 'MATCHED' }).where(eq(bankTransactions.id, id));
    await this.audit.record({
      action: 'bank.matched',
      entityType: 'bank_transaction',
      entityId: id,
      summary: `${ordered.length} facture${ordered.length > 1 ? 's' : ''}, ${money(total)}`,
    });
    return this.one(id);
  }

  async unmatch(id: string): Promise<BankTransaction> {
    const line = await this.lock(id);
    if (line.status !== 'MATCHED') throw conflict('Cette ligne n’est pas rapprochée.');
    const active = await this.tx
      .select({ id: payments.id, invoiceId: payments.invoiceId })
      .from(payments)
      .where(and(eq(payments.bankTransactionId, id), isNull(payments.voidedAt)))
      .orderBy(asc(payments.invoiceId), asc(payments.id));
    for (const p of active) {
      const invoice = await this.invoices.removePayment(p.id);
      await this.audit.record({ action: 'payment.voided', entityType: 'payment', entityId: p.id, summary: invoice.number ?? undefined });
    }
    await this.tx.update(bankTransactions).set({ status: 'UNMATCHED' }).where(eq(bankTransactions.id, id));
    await this.audit.record({ action: 'bank.unmatched', entityType: 'bank_transaction', entityId: id, summary: `${active.length} paiement${active.length > 1 ? 's' : ''} annulé${active.length > 1 ? 's' : ''}` });
    return this.one(id);
  }

  async setIgnored(id: string, ignored: boolean): Promise<BankTransaction> {
    const line = await this.lock(id);
    if (line.status !== (ignored ? 'UNMATCHED' : 'IGNORED')) {
      throw conflict(ignored ? 'Seule une ligne non rapprochée peut être ignorée.' : 'Cette ligne n’est pas ignorée.');
    }
    await this.tx.update(bankTransactions).set({ status: ignored ? 'IGNORED' : 'UNMATCHED' }).where(eq(bankTransactions.id, id));
    await this.audit.record({ action: 'bank.ignored', entityType: 'bank_transaction', entityId: id, ...(!ignored && { summary: 'Ligne rétablie' }) });
    return this.one(id);
  }
}
