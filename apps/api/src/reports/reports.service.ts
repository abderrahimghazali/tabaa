import { Inject, Injectable } from '@nestjs/common';
import {
  activeRules,
  endOfNextMonth,
  keyRateAt,
  lateDelay,
  legalDueDate,
  parsePeriod,
  prorate,
  type ParsedPeriod,
  type PaymentTermsStatement,
  type PurchaseCategory,
  type TaxBreakdown,
  type VatStatement,
  type WithholdingStatement,
} from '@facture/core';
import { Decimal } from 'decimal.js';
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { invalid } from '../common/errors.js';
import { money, today } from '../common/util.js';
import { companies, invoices, parties, purchasePayments, purchases, payments } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { PurchasesService } from '../purchases/purchases.service.js';

const DECIMAL = /^\d{1,13}(\.\d{1,6})?$/;
const ZERO = new Decimal(0);
const sum = <T>(list: T[], f: (t: T) => Decimal.Value) => list.reduce((s, x) => s.plus(f(x)), ZERO);
const settledOf = (p: { amount: string; vatWithheld: string; taxWithheld: string }) => new Decimal(p.amount).plus(p.vatWithheld).plus(p.taxWithheld);

type PayLike = { id: string; paidOn: string; createdAt: Date; amount: string; vatWithheld: string; taxWithheld: string };
const inOrder = <T extends PayLike>(list: T[]) =>
  [...list].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
const groupBy = <T>(list: T[], key: (t: T) => string) => {
  const map = new Map<string, T[]>();
  for (const x of list) map.set(key(x), [...(map.get(key(x)) ?? []), x]);
  return map;
};

@Injectable()
export class ReportsService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(PurchasesService) private readonly purchasesService: PurchasesService,
  ) {}

  private get tx() {
    return this.t.tx;
  }

  period(raw: string | undefined): ParsedPeriod {
    const p = raw ? parsePeriod(raw) : null;
    if (!p) {
      throw invalid('Paramètre period invalide.', [{ path: 'period', rule: 'schema', message: 'Mois (2026-11) ou trimestre (2026-Q4).' }]);
    }
    return p;
  }

  decimalParam(name: string, raw: string | undefined): string | undefined {
    if (raw === undefined || raw === '') return undefined;
    if (!DECIMAL.test(raw)) {
      throw invalid(`Paramètre ${name} invalide.`, [{ path: name, rule: 'schema', message: 'Nombre décimal supérieur ou égal à zéro.' }]);
    }
    return raw;
  }

  async vat(raw: string | undefined, previousCreditRaw: string | undefined): Promise<VatStatement> {
    const p = this.period(raw);
    const previousCredit = new Decimal(this.decimalParam('previousCredit', previousCreditRaw) ?? '0');
    const [company] = await this.tx.select({ regime: companies.vatRegime, basis: companies.vatBasis }).from(companies);
    const basis = (company?.basis ?? 'CASH') as VatStatement['basis'];
    const customerName = sql<string>`coalesce(${invoices.snapshot} #>> '{customer,name}', ${parties.name})`;
    const breakdown = sql<TaxBreakdown[]>`${invoices.snapshot} #> '{totals,breakdown}'`;

    type SaleRow = VatStatement['sales'][number];
    const sales: SaleRow[] = [];
    const push = (r: { id: string; number: string | null; name: string }, date: string, rate: string, base: Decimal, vat: Decimal) =>
      sales.push({ invoiceId: r.id, number: r.number ?? '', customerName: r.name, date, vatRate: new Decimal(rate).toFixed(), base: money(base), vat: money(vat) });

    // Credit notes: negative, at their issue date, on either basis.
    const credits = await this.tx
      .select({ id: invoices.id, number: invoices.number, issueDate: invoices.issueDate, name: customerName, breakdown })
      .from(invoices)
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(and(eq(invoices.state, 'ISSUED'), eq(invoices.type, 'CREDIT_NOTE'), sql`${invoices.issueDate} between ${p.from}::date and ${p.to}::date`));
    for (const c of credits) for (const b of c.breakdown) push(c, c.issueDate, b.rate, new Decimal(b.base).neg(), new Decimal(b.vat).neg());

    if (basis === 'ACCRUAL') {
      const issued = await this.tx
        .select({ id: invoices.id, number: invoices.number, issueDate: invoices.issueDate, name: customerName, breakdown })
        .from(invoices)
        .innerJoin(parties, eq(parties.id, invoices.customerId))
        .where(and(eq(invoices.state, 'ISSUED'), ne(invoices.type, 'CREDIT_NOTE'), sql`${invoices.issueDate} between ${p.from}::date and ${p.to}::date`));
      for (const i of issued) for (const b of i.breakdown) push(i, i.issueDate, b.rate, new Decimal(b.base), new Decimal(b.vat));
    }

    // Sales payments of the period (needed on both bases for the VAT withheld by customers).
    const periodPays = await this.tx
      .select({ p: payments, number: invoices.number, gross: invoices.totalGross, name: customerName, breakdown })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(and(isNull(payments.voidedAt), ne(invoices.type, 'CREDIT_NOTE'), sql`${payments.paidOn} between ${p.from}::date and ${p.to}::date`));
    const withheldByCustomers = sum(periodPays, (r) => r.p.vatWithheld);
    if (basis === 'CASH' && periodPays.length) {
      const invoiceIds = [...new Set(periodPays.map((r) => r.p.invoiceId))];
      const everyPay = await this.tx
        .select()
        .from(payments)
        .where(and(isNull(payments.voidedAt), inArray(payments.invoiceId, invoiceIds)));
      const byInvoice = groupBy(everyPay, (x) => x.invoiceId);
      const meta = new Map(periodPays.map((r) => [r.p.invoiceId, r]));
      for (const [invoiceId, list] of byInvoice) {
        const ordered = inOrder(list);
        const r = meta.get(invoiceId);
        if (!r) continue;
        const settled = ordered.map((x) => settledOf(x).toFixed(2));
        for (const b of r.breakdown) {
          const bases = prorate(settled, r.gross, b.base);
          const vats = prorate(settled, r.gross, b.vat);
          ordered.forEach((pay, i) => {
            if (pay.paidOn >= p.from && pay.paidOn <= p.to) {
              push({ id: invoiceId, number: r.number, name: r.name }, pay.paidOn, b.rate, new Decimal(bases[i]!), new Decimal(vats[i]!));
            }
          });
        }
      }
    }
    sales.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || new Decimal(b.vatRate).comparedTo(a.vatRate));

    const rates = new Map<string, { base: Decimal; vat: Decimal }>();
    let exemptBase = ZERO;
    for (const s of sales) {
      if (new Decimal(s.vatRate).isZero()) {
        exemptBase = exemptBase.plus(s.base);
        continue;
      }
      const cur = rates.get(s.vatRate) ?? { base: ZERO, vat: ZERO };
      rates.set(s.vatRate, { base: cur.base.plus(s.base), vat: cur.vat.plus(s.vat) });
    }
    const byRate = [...rates.entries()]
      .sort((a, b) => new Decimal(b[0]).comparedTo(a[0]))
      .map(([vatRate, v]) => ({ vatRate, base: money(v.base), vat: money(v.vat) }));
    const collectedVat = sum(byRate, (r) => r.vat);
    const collectedBase = sum(byRate, (r) => r.base).plus(exemptBase);

    // Deductible VAT: payment-based, on approved purchases with a right to deduct.
    const purchasePays = await this.tx
      .select({ pay: purchasePayments, purchase: purchases })
      .from(purchasePayments)
      .innerJoin(purchases, eq(purchases.id, purchasePayments.purchaseId))
      .where(and(isNull(purchasePayments.voidedAt), eq(purchases.state, 'APPROVED'), eq(purchases.vatDeductible, true), sql`${purchasePayments.paidOn} between ${p.from}::date and ${p.to}::date`));
    const deductions: VatStatement['deductions'] = [];
    const buckets: Record<PurchaseCategory, { base: Decimal; vat: Decimal }> = {
      SERVICES: { base: ZERO, vat: ZERO },
      GOODS: { base: ZERO, vat: ZERO },
      FIXED_ASSET: { base: ZERO, vat: ZERO },
    };
    const flagged = new Set<string>();
    if (purchasePays.length) {
      const purchaseRows = [...new Map(purchasePays.map((r) => [r.purchase.id, r.purchase])).values()];
      for (const id of await this.purchasesService.cashLimitFlagged(purchaseRows)) flagged.add(id);
      const every = await this.tx
        .select()
        .from(purchasePayments)
        .where(and(isNull(purchasePayments.voidedAt), inArray(purchasePayments.purchaseId, purchaseRows.map((r) => r.id))));
      const byPurchase = groupBy(every, (x) => x.purchaseId);
      for (const pr of purchaseRows) {
        const ordered = inOrder(byPurchase.get(pr.id) ?? []);
        const settled = ordered.map((x) => settledOf(x).toFixed(2));
        const supplier = pr.supplierSnapshot!;
        for (const line of pr.vatLines) {
          if (new Decimal(line.vatRate).isZero()) continue;
          const bases = prorate(settled, pr.totalGross, line.net);
          const vats = prorate(settled, pr.totalGross, line.vat);
          ordered.forEach((pay, i) => {
            if (pay.paidOn < p.from || pay.paidOn > p.to) return;
            const base = new Decimal(bases[i]!);
            const vat = new Decimal(vats[i]!);
            const b = buckets[pr.category as PurchaseCategory];
            b.base = b.base.plus(base);
            b.vat = b.vat.plus(vat);
            deductions.push({
              purchaseId: pr.id,
              number: pr.number,
              issueDate: pr.issueDate,
              supplierName: supplier.name,
              supplierIf: supplier.ifNumber,
              supplierIce: supplier.ice,
              description: pr.description,
              category: pr.category as PurchaseCategory,
              vatRate: new Decimal(line.vatRate).toFixed(),
              base: money(base),
              vat: money(vat),
              paidOn: pay.paidOn,
              method: pay.method as VatStatement['deductions'][number]['method'],
              reference: pay.reference,
            });
          });
        }
      }
    }
    deductions.sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.number.localeCompare(b.number) || new Decimal(b.vatRate).comparedTo(a.vatRate));
    const bucket = (c: PurchaseCategory) => ({ base: money(buckets[c].base), vat: money(buckets[c].vat) });
    const deductibleVat = buckets.SERVICES.vat.plus(buckets.GOODS.vat).plus(buckets.FIXED_ASSET.vat);

    const balance = collectedVat.minus(deductibleVat).minus(withheldByCustomers).minus(previousCredit);
    const [{ toApprove }] = await this.tx
      .select({ toApprove: sql<number>`count(*)::int` })
      .from(purchases)
      .where(and(eq(purchases.state, 'TO_APPROVE'), lte(purchases.issueDate, p.to)));

    const notices: VatStatement['notices'] = [];
    if (company?.regime === 'NOT_SUBJECT') notices.push('NOT_SUBJECT');
    if ((company?.regime === 'MONTHLY' && p.kind === 'QUARTER') || (company?.regime === 'QUARTERLY' && p.kind === 'MONTH')) notices.push('PERIOD_MISMATCH');
    if (today() <= p.to) notices.push('PERIOD_NOT_OVER');
    if (toApprove > 0) notices.push('PURCHASES_TO_APPROVE');
    if (deductions.some((d) => flagged.has(d.purchaseId))) notices.push('CASH_LIMIT');

    return {
      period: p.period,
      from: p.from,
      to: p.to,
      basis,
      filingDeadline: endOfNextMonth(p.to),
      collected: { byRate, exemptBase: money(exemptBase), totalBase: money(collectedBase), totalVat: money(collectedVat) },
      deductible: { services: bucket('SERVICES'), goods: bucket('GOODS'), fixedAssets: bucket('FIXED_ASSET'), totalVat: money(deductibleVat) },
      withheldByCustomers: money(withheldByCustomers),
      previousCredit: money(previousCredit),
      vatDue: money(Decimal.max(balance, 0)),
      creditCarriedForward: money(Decimal.max(balance.neg(), 0)),
      sales,
      deductions,
      notices,
    };
  }

  async withholdings(raw: string | undefined): Promise<WithholdingStatement> {
    const p = this.period(raw);
    const between = (col: typeof payments.paidOn | typeof purchasePayments.paidOn) => sql`${col} between ${p.from}::date and ${p.to}::date`;
    const suppliers = await this.tx
      .select({ pay: purchasePayments, purchase: purchases })
      .from(purchasePayments)
      .innerJoin(purchases, eq(purchases.id, purchasePayments.purchaseId))
      .where(and(isNull(purchasePayments.voidedAt), between(purchasePayments.paidOn), or(gt(purchasePayments.vatWithheld, '0'), gt(purchasePayments.taxWithheld, '0'))))
      .orderBy(asc(purchasePayments.paidOn), asc(purchases.number), asc(purchasePayments.id));
    const onSuppliers = suppliers.map(({ pay, purchase }) => ({
      paymentId: pay.id,
      documentId: purchase.id,
      number: purchase.number,
      partyName: purchase.supplierSnapshot?.name ?? '',
      partyIf: purchase.supplierSnapshot?.ifNumber ?? null,
      partyIce: purchase.supplierSnapshot?.ice ?? null,
      paidOn: pay.paidOn,
      totalNet: purchase.totalNet,
      totalVat: purchase.totalVat,
      vatWithheld: pay.vatWithheld,
      taxWithheld: pay.taxWithheld,
    }));
    const customers = await this.tx
      .select({
        pay: payments,
        number: invoices.number,
        totalNet: invoices.totalNet,
        totalVat: invoices.totalVat,
        name: sql<string>`coalesce(${invoices.snapshot} #>> '{customer,name}', ${parties.name})`,
        ifNumber: sql<string | null>`coalesce(${invoices.snapshot} #>> '{customer,ifNumber}', ${parties.ifNumber})`,
        ice: sql<string | null>`coalesce(${invoices.snapshot} #>> '{customer,ice}', ${parties.ice})`,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(and(isNull(payments.voidedAt), between(payments.paidOn), or(gt(payments.vatWithheld, '0'), gt(payments.taxWithheld, '0'))))
      .orderBy(asc(payments.paidOn), asc(invoices.number), asc(payments.id));
    const byCustomers = customers.map((c) => ({
      paymentId: c.pay.id,
      documentId: c.pay.invoiceId,
      number: c.number ?? '',
      partyName: c.name,
      partyIf: c.ifNumber,
      partyIce: c.ice,
      paidOn: c.pay.paidOn,
      totalNet: c.totalNet,
      totalVat: c.totalVat,
      vatWithheld: c.pay.vatWithheld,
      taxWithheld: c.pay.taxWithheld,
    }));
    return {
      period: p.period,
      from: p.from,
      to: p.to,
      onSuppliers: {
        rows: onSuppliers,
        totalVat: money(sum(onSuppliers, (r) => r.vatWithheld)),
        totalTax: money(sum(onSuppliers, (r) => r.taxWithheld)),
        remittanceDeadline: endOfNextMonth(p.to),
      },
      byCustomers: {
        rows: byCustomers,
        totalVat: money(sum(byCustomers, (r) => r.vatWithheld)),
        totalTax: money(sum(byCustomers, (r) => r.taxWithheld)),
      },
    };
  }

  async paymentTerms(raw: string | undefined, keyRateRaw: string | undefined): Promise<PaymentTermsStatement> {
    const p = this.period(raw);
    const override = this.decimalParam('keyRate', keyRateRaw);
    const rules = activeRules(p.to);
    const keyRates = override ? [{ from: p.from, rate: new Decimal(override).toFixed(2) }] : rules.keyRates;
    const increment = rules.latePaymentMonthlyIncrement;

    const rows = await this.tx
      .select({ purchase: purchases, pay: purchasePayments })
      .from(purchases)
      .leftJoin(purchasePayments, and(eq(purchasePayments.purchaseId, purchases.id), isNull(purchasePayments.voidedAt), lte(purchasePayments.paidOn, p.to)))
      .where(and(eq(purchases.state, 'APPROVED'), lte(purchases.issueDate, p.to)));
    const byPurchase = new Map<string, { purchase: typeof purchases.$inferSelect; pays: (typeof purchasePayments.$inferSelect)[] }>();
    for (const r of rows) {
      const cur = byPurchase.get(r.purchase.id) ?? { purchase: r.purchase, pays: [] };
      if (r.pay) cur.pays.push(r.pay);
      byPurchase.set(r.purchase.id, cur);
    }

    const out: PaymentTermsStatement['rows'] = [];
    const disputed: PaymentTermsStatement['disputed'] = [];
    for (const { purchase: pr, pays } of byPurchase.values()) {
      const legal = legalDueDate(pr.issueDate, pr.dueDate, activeRules(pr.issueDate).maxPaymentTermDays);
      const supplier = pr.supplierSnapshot!;
      const left = new Decimal(pr.totalGross).minus(sum(pays, (x) => settledOf(x)));
      if (pr.disputed) {
        if (left.gt(0) && legal < p.to) disputed.push({ purchaseId: pr.id, number: pr.number, supplierName: supplier.name, amountDue: money(left) });
        continue;
      }
      const base = {
        purchaseId: pr.id,
        number: pr.number,
        issueDate: pr.issueDate,
        supplierName: supplier.name,
        supplierIf: supplier.ifNumber,
        supplierIce: supplier.ice,
        totalGross: pr.totalGross,
        legalDueDate: legal,
      };
      for (const pay of inOrder(pays)) {
        if (pay.paidOn < p.from || pay.paidOn <= legal) continue;
        const late = settledOf(pay).toFixed(2);
        out.push({
          ...base,
          lateAmount: late,
          settledOn: pay.paidOn,
          ...lateDelay({ legalDue: legal, until: pay.paidOn, amount: late, keyRates, monthlyIncrement: increment }),
          status: 'PAID_LATE',
          method: pay.method as PaymentTermsStatement['rows'][number]['method'],
          reference: pay.reference,
        });
      }
      if (left.gt(0) && legal < p.to) {
        out.push({
          ...base,
          lateAmount: money(left),
          settledOn: null,
          ...lateDelay({ legalDue: legal, until: p.to, amount: money(left), keyRates, monthlyIncrement: increment }),
          status: 'UNPAID',
          method: null,
          reference: null,
        });
      }
    }
    out.sort((a, b) => a.legalDueDate.localeCompare(b.legalDueDate) || a.number.localeCompare(b.number) || (a.settledOn ?? '9').localeCompare(b.settledOn ?? '9'));
    disputed.sort((a, b) => a.number.localeCompare(b.number));
    const [{ toApprove }] = await this.tx
      .select({ toApprove: sql<number>`count(*)::int` })
      .from(purchases)
      .where(and(eq(purchases.state, 'TO_APPROVE'), lte(purchases.issueDate, p.to)));
    const notices: PaymentTermsStatement['notices'] = [];
    if (p.kind === 'MONTH') notices.push('PERIOD_NOT_QUARTER');
    if (today() <= p.to) notices.push('PERIOD_NOT_OVER');
    if (toApprove > 0) notices.push('PURCHASES_TO_APPROVE');
    if (override) notices.push('KEY_RATE_OVERRIDDEN');
    return {
      period: p.period,
      from: p.from,
      to: p.to,
      filingDeadline: endOfNextMonth(p.to),
      keyRates,
      monthlyIncrement: increment,
      rows: out,
      disputed,
      totals: {
        unpaidLate: money(sum(out.filter((r) => r.status === 'UNPAID'), (r) => r.lateAmount)),
        paidLate: money(sum(out.filter((r) => r.status === 'PAID_LATE'), (r) => r.lateAmount)),
        fine: money(sum(out, (r) => r.fine)),
        count: out.length,
      },
      notices,
    };
  }
}
