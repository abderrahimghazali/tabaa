import { Inject, Injectable } from '@nestjs/common';
import {
  activeRules,
  type DisputePurchaseInput,
  type Purchase,
  type PurchaseInput,
  type PurchaseList,
  type PurchasePayment,
  type PurchasePaymentInput,
  type PurchaseSummary,
  type PurchaseWarning,
  type RejectPurchaseInput,
} from '@facture/core';
import { Decimal } from 'decimal.js';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException, conflict, invalid, notFound, type Issue } from '../common/errors.js';
import { money, today } from '../common/util.js';
import { parties, purchasePayments, purchases } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';

type Row = typeof purchases.$inferSelect;
type Supplier = Purchase['supplier'];
type CashPayment = { purchaseId: string; paidOn: string; amount: Decimal };

const numberKey = (n: string) => n.normalize('NFC').toLowerCase().replace(/\s+/g, '');
const issue = (path: string, message: string, rule = 'schema'): Issue => ({ path, rule, message });
const realDate = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');
const WARNING_ORDER: PurchaseWarning[] = ['SUPPLIER_ICE_MISSING', 'SUPPLIER_IF_MISSING', 'TERM_TOO_LONG', 'CASH_LIMIT'];

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get tx() {
    return this.t.tx;
  }

  // Checks the amounts the supplier printed; returns them rounded, with totals.
  private checked(input: PurchaseInput) {
    const issues: Issue[] = [];
    if (!realDate(input.issueDate)) issues.push(issue('issueDate', 'Date invalide.'));
    if (!realDate(input.dueDate)) issues.push(issue('dueDate', 'Date invalide.'));
    if (!issues.length && input.dueDate < input.issueDate) {
      issues.push(issue('dueDate', 'L’échéance ne peut pas précéder la date de facture.', 'PURCHASE-DUE-DATE'));
    }
    const rates = activeRules(input.issueDate).vatRates;
    let net = new Decimal(0);
    let vat = new Decimal(0);
    const vatLines = input.vatLines.map((l, i) => {
      const at = `vatLines.${i}`;
      const n = new Decimal(money(l.net));
      const v = new Decimal(money(l.vat));
      if (n.lt(0) || v.lt(0)) issues.push(issue(`${at}.net`, 'Les montants ne peuvent pas être négatifs.', 'PURCHASE-NEGATIVE'));
      if (!rates.some((r) => new Decimal(r).eq(l.vatRate))) {
        issues.push(issue(`${at}.vatRate`, `Taux de TVA inconnu (${rates.join(', ')} %).`, 'PURCHASE-VAT-RATE'));
      } else if (v.minus(n.times(l.vatRate).div(100)).abs().gt(1)) {
        issues.push(issue(`${at}.vat`, 'La TVA s’écarte de plus de 1,00 MAD du montant attendu pour ce taux.', 'PURCHASE-VAT-AMOUNT'));
      }
      net = net.plus(n);
      vat = vat.plus(v);
      return { vatRate: new Decimal(l.vatRate).toFixed(), net: money(n), vat: money(v) };
    });
    if (!net.plus(vat).gt(0)) issues.push(issue('vatLines', 'Le total TTC doit être supérieur à zéro.', 'PURCHASE-TOTAL'));
    if (issues.length) throw invalid('Facture d’achat invalide.', issues);
    return { vatLines, totalNet: money(net), totalVat: money(vat), totalGross: money(net.plus(vat)) };
  }

  private async supplierOf(id: string) {
    const [row] = await this.tx.select().from(parties).where(eq(parties.id, id));
    if (!row || (row.kind !== 'SUPPLIER' && row.kind !== 'BOTH')) {
      throw invalid('Fournisseur invalide.', [issue('supplierId', 'Ce tiers n’est pas un fournisseur.', 'PURCHASE-SUPPLIER')]);
    }
    return row;
  }

  private duplicate() {
    return new ApiException(409, 'DUPLICATE', 'Ce fournisseur a déjà une facture portant ce numéro.');
  }

  private async lock(id: string) {
    const [row] = await this.tx.select().from(purchases).where(eq(purchases.id, id)).for('update');
    if (!row) throw notFound('Facture d’achat');
    return row;
  }

  private columns(input: PurchaseInput, c: ReturnType<PurchasesService['checked']>) {
    return {
      supplierId: input.supplierId,
      number: input.number.trim(),
      numberKey: numberKey(input.number),
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      category: input.category,
      description: input.description.trim(),
      vatLines: c.vatLines,
      vatDeductible: input.vatDeductible,
      notes: input.notes ?? null,
      totalNet: c.totalNet,
      totalVat: c.totalVat,
      totalGross: c.totalGross,
    };
  }

  // Everything a purchase needs beyond its row, for many rows at once.
  private async context(rows: Row[]) {
    const supplierIds = [...new Set(rows.map((r) => r.supplierId))];
    const live = new Map<string, Supplier>();
    const cash = new Map<string, CashPayment[]>();
    if (supplierIds.length) {
      for (const p of await this.tx.select().from(parties).where(inArray(parties.id, supplierIds))) {
        live.set(p.id, { name: p.name, ice: p.ice, ifNumber: p.ifNumber });
      }
      const rowsCash = await this.tx
        .select({ supplierId: purchases.supplierId, purchaseId: purchasePayments.purchaseId, paidOn: purchasePayments.paidOn, amount: purchasePayments.amount })
        .from(purchasePayments)
        .innerJoin(purchases, eq(purchases.id, purchasePayments.purchaseId))
        .where(and(inArray(purchases.supplierId, supplierIds), eq(purchasePayments.method, 'CASH'), isNull(purchasePayments.voidedAt)));
      for (const c of rowsCash) {
        const list = cash.get(c.supplierId) ?? [];
        list.push({ purchaseId: c.purchaseId, paidOn: c.paidOn, amount: new Decimal(c.amount) });
        cash.set(c.supplierId, list);
      }
    }
    return { live, cash };
  }

  private cashFlagged(list: CashPayment[] | undefined, purchaseId: string) {
    if (!list?.some((p) => p.purchaseId === purchaseId)) return false;
    const days = new Map<string, Decimal>();
    const months = new Map<string, Decimal>();
    for (const p of list) {
      days.set(p.paidOn, (days.get(p.paidOn) ?? new Decimal(0)).plus(p.amount));
      const m = p.paidOn.slice(0, 7);
      months.set(m, (months.get(m) ?? new Decimal(0)).plus(p.amount));
    }
    return list.some((p) => {
      if (p.purchaseId !== purchaseId) return false;
      const rules = activeRules(p.paidOn);
      return days.get(p.paidOn)!.gt(rules.cashLimitPerDay) || months.get(p.paidOn.slice(0, 7))!.gt(rules.cashLimitPerMonth);
    });
  }

  private warnings(row: Row, supplier: Supplier, cash: CashPayment[] | undefined): PurchaseWarning[] {
    const found = new Set<PurchaseWarning>();
    if (!supplier.ice) found.add('SUPPLIER_ICE_MISSING');
    if (!supplier.ifNumber) found.add('SUPPLIER_IF_MISSING');
    if (daysBetween(row.issueDate, row.dueDate) > activeRules(row.issueDate).maxPaymentTermDays) found.add('TERM_TOO_LONG');
    if (this.cashFlagged(cash, row.id)) found.add('CASH_LIMIT');
    return WARNING_ORDER.filter((w) => found.has(w));
  }

  private status(row: Row, settled: Decimal) {
    const due = new Decimal(row.totalGross).minus(settled);
    return {
      amountDue: money(due),
      paidAmount: money(settled),
      paymentStatus: (settled.lte(0) ? 'UNPAID' : due.lte(0) ? 'PAID' : 'PARTIAL') as Purchase['paymentStatus'],
      overdue: row.state === 'APPROVED' && !row.disputed && due.gt(0) && row.dueDate < today(),
    };
  }

  private async hydrate(rows: Row[]): Promise<Purchase[]> {
    if (!rows.length) return [];
    const { live, cash } = await this.context(rows);
    const pays = await this.tx
      .select()
      .from(purchasePayments)
      .where(and(inArray(purchasePayments.purchaseId, rows.map((r) => r.id)), isNull(purchasePayments.voidedAt)))
      .orderBy(asc(purchasePayments.paidOn), asc(purchasePayments.createdAt), asc(purchasePayments.id));
    const byPurchase = new Map<string, PurchasePayment[]>();
    const settledBy = new Map<string, Decimal>();
    for (const p of pays) {
      const settled = new Decimal(p.amount).plus(p.vatWithheld).plus(p.taxWithheld);
      const list = byPurchase.get(p.purchaseId) ?? [];
      list.push({
        id: p.id,
        paidOn: p.paidOn,
        method: p.method as PurchasePayment['method'],
        amount: p.amount,
        vatWithheld: p.vatWithheld,
        taxWithheld: p.taxWithheld,
        ...(p.reference && { reference: p.reference }),
        settled: money(settled),
      });
      byPurchase.set(p.purchaseId, list);
      settledBy.set(p.purchaseId, (settledBy.get(p.purchaseId) ?? new Decimal(0)).plus(settled));
    }
    return rows.map((r) => {
      const supplier = r.supplierSnapshot ?? live.get(r.supplierId)!;
      return {
        id: r.id,
        supplierId: r.supplierId,
        number: r.number,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        category: r.category as Purchase['category'],
        description: r.description,
        vatLines: r.vatLines,
        vatDeductible: r.vatDeductible,
        ...(r.notes && { notes: r.notes }),
        supplier,
        currency: 'MAD' as const,
        state: r.state as Purchase['state'],
        rejectionReason: r.rejectionReason,
        disputed: r.disputed,
        totalNet: r.totalNet,
        totalVat: r.totalVat,
        totalGross: r.totalGross,
        ...this.status(r, settledBy.get(r.id) ?? new Decimal(0)),
        payments: byPurchase.get(r.id) ?? [],
        warnings: this.warnings(r, supplier, cash.get(r.supplierId)),
        createdByName: r.createdByName,
        approvedByName: r.approvedByName,
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      };
    });
  }

  async get(id: string): Promise<Purchase> {
    const [row] = await this.tx.select().from(purchases).where(eq(purchases.id, id));
    if (!row) throw notFound('Facture d’achat');
    return (await this.hydrate([row]))[0];
  }

  // Purchases carrying the CASH_LIMIT warning, among the given rows.
  async cashLimitFlagged(rows: Row[]): Promise<string[]> {
    const { cash } = await this.context(rows);
    return rows.filter((r) => this.cashFlagged(cash.get(r.supplierId), r.id)).map((r) => r.id);
  }

  async exportAll() {
    const rows = await this.tx.select().from(purchases).orderBy(asc(purchases.issueDate), asc(purchases.id));
    return this.hydrate(rows);
  }

  async create(input: PurchaseInput): Promise<Purchase> {
    const c = this.checked(input);
    await this.supplierOf(input.supplierId);
    const [row] = await this.tx
      .insert(purchases)
      .values({
        ...this.columns(input, c),
        tenantId: this.t.tenantId,
        state: 'TO_APPROVE',
        createdBy: this.t.ctx.userId ?? null,
        createdByName: this.t.ctx.userName ?? null,
      })
      .onConflictDoNothing({ target: [purchases.tenantId, purchases.supplierId, purchases.numberKey] })
      .returning();
    if (!row) throw this.duplicate();
    await this.audit.record({ action: 'purchase.created', entityType: 'purchase', entityId: row.id, summary: `${row.number}, ${row.totalGross} MAD` });
    return this.get(row.id);
  }

  async update(id: string, input: PurchaseInput): Promise<Purchase> {
    const current = await this.lock(id);
    if (current.state === 'APPROVED') throw new ApiException(409, 'NOT_EDITABLE', 'Une facture approuvée ne peut plus être modifiée : rouvrez-la d’abord.');
    const c = this.checked(input);
    await this.supplierOf(input.supplierId);
    const cols = this.columns(input, c);
    const [clash] = await this.tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.supplierId, cols.supplierId), eq(purchases.numberKey, cols.numberKey), sql`${purchases.id} <> ${id}`));
    if (clash) throw this.duplicate();
    await this.tx.update(purchases).set({ ...cols, state: 'TO_APPROVE', rejectionReason: null }).where(eq(purchases.id, id));
    await this.audit.record({ action: 'purchase.updated', entityType: 'purchase', entityId: id, summary: `${cols.number}, ${cols.totalGross} MAD` });
    return this.get(id);
  }

  async remove(id: string) {
    const row = await this.lock(id);
    if (row.state === 'APPROVED') throw new ApiException(409, 'NOT_EDITABLE', 'Une facture approuvée ne peut pas être supprimée.');
    const history = await this.tx.$count(purchasePayments, eq(purchasePayments.purchaseId, id));
    if (history > 0) throw new ApiException(409, 'HAS_PAYMENTS', 'Cette facture a un historique de paiements et ne peut pas être supprimée.');
    await this.tx.delete(purchases).where(eq(purchases.id, id));
    await this.audit.record({ action: 'purchase.deleted', entityType: 'purchase', entityId: id, summary: row.number });
  }

  async approve(id: string): Promise<Purchase> {
    const row = await this.lock(id);
    if (row.state !== 'TO_APPROVE') throw conflict('Seule une facture à approuver peut être approuvée.');
    const [supplier] = await this.tx.select().from(parties).where(eq(parties.id, row.supplierId));
    await this.tx
      .update(purchases)
      .set({
        state: 'APPROVED',
        supplierSnapshot: { name: supplier.name, ice: supplier.ice, ifNumber: supplier.ifNumber },
        approvedAt: new Date(),
        approvedBy: this.t.ctx.userId ?? null,
        approvedByName: this.t.ctx.userName ?? null,
        retainUntil: `${Number(row.issueDate.slice(0, 4)) + activeRules(row.issueDate).retentionYears}-12-31`,
      })
      .where(eq(purchases.id, id));
    await this.audit.record({ action: 'purchase.approved', entityType: 'purchase', entityId: id, summary: row.number });
    return this.get(id);
  }

  async reject(id: string, input: RejectPurchaseInput): Promise<Purchase> {
    const row = await this.lock(id);
    if (row.state !== 'TO_APPROVE') throw conflict('Seule une facture à approuver peut être rejetée.');
    await this.tx.update(purchases).set({ state: 'REJECTED', rejectionReason: input.reason.trim() }).where(eq(purchases.id, id));
    await this.audit.record({ action: 'purchase.rejected', entityType: 'purchase', entityId: id, summary: `${row.number}: ${input.reason.trim().slice(0, 120)}` });
    return this.get(id);
  }

  async reopen(id: string): Promise<Purchase> {
    const row = await this.lock(id);
    if (row.state !== 'APPROVED') throw conflict('Seule une facture approuvée peut être rouverte.');
    const active = await this.tx.$count(purchasePayments, and(eq(purchasePayments.purchaseId, id), isNull(purchasePayments.voidedAt)));
    if (active > 0) throw new ApiException(409, 'HAS_PAYMENTS', 'Annulez d’abord les paiements de cette facture.');
    await this.tx
      .update(purchases)
      .set({
        state: 'TO_APPROVE',
        supplierSnapshot: null,
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        retainUntil: null,
        disputed: false,
        ...(row.disputed && { disputeClearedAt: new Date() }),
      })
      .where(eq(purchases.id, id));
    await this.audit.record({ action: 'purchase.reopened', entityType: 'purchase', entityId: id, summary: row.number });
    return this.get(id);
  }

  async dispute(id: string, input: DisputePurchaseInput): Promise<Purchase> {
    const row = await this.lock(id);
    if (row.state !== 'APPROVED') throw new ApiException(409, 'NOT_APPROVED', 'Seule une facture approuvée peut être contestée.');
    if (row.disputed !== input.disputed) {
      await this.tx
        .update(purchases)
        .set(input.disputed ? { disputed: true, disputedAt: new Date(), disputeClearedAt: null } : { disputed: false, disputeClearedAt: new Date() })
        .where(eq(purchases.id, id));
      await this.audit.record({ action: 'purchase.disputed', entityType: 'purchase', entityId: id, summary: `${row.number}: ${input.disputed ? 'contestée' : 'contestation levée'}` });
    }
    return this.get(id);
  }

  private async settledOf(id: string) {
    const rows = await this.tx
      .select()
      .from(purchasePayments)
      .where(and(eq(purchasePayments.purchaseId, id), isNull(purchasePayments.voidedAt)));
    return {
      settled: rows.reduce((s, p) => s.plus(p.amount).plus(p.vatWithheld).plus(p.taxWithheld), new Decimal(0)),
      vatWithheld: rows.reduce((s, p) => s.plus(p.vatWithheld), new Decimal(0)),
    };
  }

  async addPayment(id: string, input: PurchasePaymentInput): Promise<Purchase> {
    const row = await this.lock(id);
    if (row.state !== 'APPROVED') throw new ApiException(409, 'NOT_APPROVED', 'Les paiements ne s’enregistrent que sur une facture approuvée.');
    const amount = new Decimal(money(input.amount));
    const vat = new Decimal(money(input.vatWithheld));
    const tax = new Decimal(money(input.taxWithheld));
    const issues: Issue[] = [];
    if (amount.lt(0)) issues.push(issue('amount', 'Le montant ne peut pas être négatif.', 'PAYMENT-NEGATIVE'));
    if (vat.lt(0)) issues.push(issue('vatWithheld', 'La retenue ne peut pas être négative.', 'PAYMENT-NEGATIVE'));
    if (tax.lt(0)) issues.push(issue('taxWithheld', 'La retenue ne peut pas être négative.', 'PAYMENT-NEGATIVE'));
    if (!issues.length && amount.plus(vat).plus(tax).lte(0)) issues.push(issue('amount', 'Indiquez un montant ou une retenue.', 'PAYMENT-POSITIVE'));
    if (!realDate(input.paidOn)) issues.push(issue('paidOn', 'Date invalide.'));
    else if (input.paidOn < row.issueDate) issues.push(issue('paidOn', 'Le paiement ne peut pas précéder la date de la facture.', 'PAYMENT-BEFORE-ISSUE'));
    const before = await this.settledOf(id);
    if (vat.gt(new Decimal(row.totalVat).minus(before.vatWithheld))) {
      issues.push(issue('vatWithheld', 'La retenue de TVA dépasse la TVA de la facture non encore retenue.', 'PAYMENT-VAT-EXCEEDS'));
    }
    if (issues.length) throw invalid('Paiement invalide.', issues);
    const settled = amount.plus(vat).plus(tax);
    const due = new Decimal(row.totalGross).minus(before.settled);
    if (settled.gt(due)) throw new ApiException(409, 'OVERPAYMENT', `Le règlement dépasse le reste à payer (${money(due)}).`);
    await this.tx.insert(purchasePayments).values({
      tenantId: this.t.tenantId,
      purchaseId: id,
      paidOn: input.paidOn,
      method: input.method,
      amount: money(amount),
      vatWithheld: money(vat),
      taxWithheld: money(tax),
      reference: input.reference?.trim() || null,
      createdBy: this.t.ctx.userId ?? null,
    });
    const held = vat.plus(tax);
    await this.audit.record({
      action: 'purchase.payment_recorded',
      entityType: 'purchase',
      entityId: id,
      summary: `${money(amount)} ${input.method}${held.gt(0) ? `, retenues ${money(held)}` : ''}`,
    });
    return this.get(id);
  }

  async voidPayment(id: string, paymentId: string): Promise<Purchase> {
    await this.lock(id);
    const [p] = await this.tx
      .select()
      .from(purchasePayments)
      .where(and(eq(purchasePayments.id, paymentId), eq(purchasePayments.purchaseId, id), isNull(purchasePayments.voidedAt)));
    if (!p) throw notFound('Paiement');
    await this.tx
      .update(purchasePayments)
      .set({ voidedAt: new Date(), voidedBy: this.t.ctx.userId ?? null })
      .where(eq(purchasePayments.id, paymentId));
    await this.audit.record({ action: 'purchase.payment_voided', entityType: 'purchase', entityId: id, summary: `${p.amount} ${p.method}` });
    return this.get(id);
  }

  async list(f: {
    state?: Purchase['state'];
    paymentStatus?: Purchase['paymentStatus'];
    overdue?: boolean;
    supplierId?: string;
    q?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<PurchaseList> {
    const paid = this.tx
      .select({
        purchaseId: purchasePayments.purchaseId,
        settled: sql<string>`sum(${purchasePayments.amount} + ${purchasePayments.vatWithheld} + ${purchasePayments.taxWithheld})`.as('settled'),
      })
      .from(purchasePayments)
      .where(isNull(purchasePayments.voidedAt))
      .groupBy(purchasePayments.purchaseId)
      .as('paid');
    const settled = sql`coalesce(${paid.settled}, 0)`;
    const due = sql`(${purchases.totalGross} - ${settled})`;
    const day = today();
    const overdue = sql`(${purchases.state} = 'APPROVED' and not ${purchases.disputed} and ${due} > 0 and ${purchases.dueDate} < ${day}::date)`;
    const supplierName = sql`coalesce(${purchases.supplierSnapshot} ->> 'name', ${parties.name})`;
    const q = f.q?.trim();
    const where = and(
      f.state ? eq(purchases.state, f.state) : undefined,
      f.paymentStatus === 'UNPAID' ? sql`${settled} = 0` : undefined,
      f.paymentStatus === 'PARTIAL' ? sql`${settled} > 0 and ${due} > 0` : undefined,
      f.paymentStatus === 'PAID' ? sql`${settled} > 0 and ${due} <= 0` : undefined,
      f.overdue === true ? overdue : f.overdue === false ? sql`not ${overdue}` : undefined,
      f.supplierId ? eq(purchases.supplierId, f.supplierId) : undefined,
      q
        ? or(
            ilike(purchases.number, `%${likeEscape(q)}%`),
            ilike(purchases.description, `%${likeEscape(q)}%`),
            sql`${supplierName} ilike ${`%${likeEscape(q)}%`}`,
          )
        : undefined,
      f.from ? gte(purchases.issueDate, f.from) : undefined,
      f.to ? lte(purchases.issueDate, f.to) : undefined,
    );
    const [{ total }] = await this.tx
      .select({ total: sql<number>`count(*)::int` })
      .from(purchases)
      .innerJoin(parties, eq(parties.id, purchases.supplierId))
      .leftJoin(paid, eq(paid.purchaseId, purchases.id))
      .where(where);
    const rows = await this.tx
      .select({ row: purchases, supplierName, settled: sql<string>`${settled}::text` })
      .from(purchases)
      .innerJoin(parties, eq(parties.id, purchases.supplierId))
      .leftJoin(paid, eq(paid.purchaseId, purchases.id))
      .where(where)
      .orderBy(desc(purchases.issueDate), desc(purchases.createdAt), asc(purchases.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);

    const { live, cash } = await this.context(rows.map((r) => r.row));
    const items: PurchaseSummary[] = rows.map(({ row, supplierName: name, settled: s }) => {
      const status = this.status(row, new Decimal(s));
      return {
        id: row.id,
        number: row.number,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        category: row.category as PurchaseSummary['category'],
        state: row.state as PurchaseSummary['state'],
        disputed: row.disputed,
        totalGross: row.totalGross,
        amountDue: status.amountDue,
        paymentStatus: status.paymentStatus,
        overdue: status.overdue,
        supplierId: row.supplierId,
        supplierName: name as string,
        warningCount: this.warnings(row, row.supplierSnapshot ?? live.get(row.supplierId)!, cash.get(row.supplierId)).length,
      };
    });

    const [o] = await this.tx
      .select({
        toApprove: sql<number>`count(*) filter (where ${purchases.state} = 'TO_APPROVE')::int`,
        unpaid: sql<string>`coalesce(sum(${due}) filter (where ${purchases.state} = 'APPROVED' and ${due} > 0), 0)::text`,
        overdueTotal: sql<string>`coalesce(sum(${due}) filter (where ${overdue}), 0)::text`,
        overdueCount: sql<number>`count(*) filter (where ${overdue})::int`,
        soon: sql<string>`coalesce(sum(${due}) filter (where ${purchases.state} = 'APPROVED' and not ${purchases.disputed} and ${due} > 0 and ${purchases.dueDate} between ${day}::date and ${addDays(day, 7)}::date), 0)::text`,
      })
      .from(purchases)
      .leftJoin(paid, eq(paid.purchaseId, purchases.id));
    return {
      items,
      total,
      overview: {
        toApprove: o.toApprove,
        unpaidTotal: money(o.unpaid),
        overdueTotal: money(o.overdueTotal),
        overdueCount: o.overdueCount,
        dueWithin7Days: money(o.soon),
      },
    };
  }
}
