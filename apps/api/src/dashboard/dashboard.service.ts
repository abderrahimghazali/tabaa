import { Inject, Injectable } from '@nestjs/common';
import type { Dashboard } from '@facture/core';
import { Decimal } from 'decimal.js';
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { invoices, parties, payments } from '../db/schema.js';
import { TenantDb } from '../db/tenant-db.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { dto, money, today } from '../common/util.js';

const monthKey = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 7);
};
const dayNum = (date: string) => Date.parse(date) / 86_400_000;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(TenantDb) private readonly t: TenantDb,
    @Inject(InvoicesService) private readonly invoicesService: InvoicesService,
  ) {}

  async get(): Promise<Dashboard> {
    const tx = this.t.tx;
    const now = today();
    const monthStart = `${now.slice(0, 7)}-01`;
    const [y, m] = now.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const all = await this.invoicesService.summaries();
    const issued = all.filter((s) => s.state === 'ISSUED' && s.type !== 'CREDIT_NOTE');
    const remaining = (s: (typeof all)[number]) => new Decimal(s.amountDue).minus(s.paidAmount);
    const sum = (list: typeof all, f: (s: (typeof all)[number]) => Decimal) =>
      list.reduce((acc, s) => acc.plus(f(s)), new Decimal(0));
    const receivables = issued
      .filter((s) => s.paymentStatus !== 'PAID')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const monthPayments = await tx
      .select({ amount: payments.amount, vatWithheld: payments.vatWithheld, taxWithheld: payments.taxWithheld, totalVat: invoices.totalVat, amountDue: invoices.amountDue })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart), lt(payments.paidOn, nextMonth)));

    const recent = await tx
      .select({ p: payments, number: invoices.number, snapshot: invoices.snapshot })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(isNull(payments.voidedAt))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(10);

    const [{ drafts }] = await tx
      .select({ drafts: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.state, 'DRAFT'));

    const prevMonth = monthKey(y, m - 1);
    const months = Array.from({ length: 6 }, (_, i) => monthKey(y, m - 5 + i));
    const billable = issued;
    const sumMonth = (key: string) =>
      sum(billable.filter((s) => s.issueDate.startsWith(key)), (s) => new Decimal(s.totalGross));

    const allPayments = await tx
      .select({
        invoiceId: payments.invoiceId,
        paidOn: payments.paidOn,
        amount: payments.amount,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(isNull(payments.voidedAt))
      .orderBy(payments.paidOn, payments.createdAt);
    const collectedIn = (key: string) =>
      allPayments.filter((p) => p.paidOn.startsWith(key)).reduce((a, p) => a.plus(p.amount), new Decimal(0));

    const byId = new Map(issued.map((s) => [s.id, s]));
    const lastPayment = new Map<string, string>();
    for (const p of allPayments) lastPayment.set(p.invoiceId, p.paidOn);
    const cutoff = dayNum(now) - 90;
    const days = issued
      .filter((s) => s.paymentStatus === 'PAID' && lastPayment.has(s.id) && dayNum(lastPayment.get(s.id)!) >= cutoff)
      .map((s) => dayNum(lastPayment.get(s.id)!) - dayNum(s.issueDate));
    const averageDaysToPay = days.length
      ? new Decimal(days.reduce((a, b) => a + b, 0)).div(days.length).toDecimalPlaces(1).toNumber()
      : null;

    const bucket = { notDue: new Decimal(0), d1to30: new Decimal(0), d31to60: new Decimal(0), d61to90: new Decimal(0), over90: new Decimal(0) };
    for (const s of receivables) {
      const late = dayNum(now) - dayNum(s.dueDate);
      const key = late <= 0 ? 'notDue' : late <= 30 ? 'd1to30' : late <= 60 ? 'd31to60' : late <= 90 ? 'd61to90' : 'over90';
      bucket[key] = bucket[key].plus(remaining(s));
    }

    const yearAgo = `${y - 1}-${String(m).padStart(2, '0')}-${now.slice(8)}`;
    const issuedRows = await tx
      .select({ id: invoices.id, customerId: invoices.customerId, name: parties.name })
      .from(invoices)
      .innerJoin(parties, eq(parties.id, invoices.customerId))
      .where(and(eq(invoices.state, 'ISSUED'), ne(invoices.type, 'CREDIT_NOTE')));
    const perCustomer = new Map<string, { customerId: string; name: string; invoiced: Decimal; outstanding: Decimal }>();
    for (const r of issuedRows) {
      const s = byId.get(r.id)!;
      const c = perCustomer.get(r.customerId) ?? { customerId: r.customerId, name: s.customerName, invoiced: new Decimal(0), outstanding: new Decimal(0) };
      if (s.issueDate >= yearAgo) c.invoiced = c.invoiced.plus(s.totalGross);
      c.outstanding = c.outstanding.plus(remaining(s));
      perCustomer.set(r.customerId, c);
    }
    const topCustomers = [...perCustomer.values()]
      .filter((c) => c.invoiced.gt(0))
      .sort((a, b) => b.invoiced.comparedTo(a.invoiced))
      .slice(0, 5)
      .map((c) => ({ ...c, invoiced: money(c.invoiced), outstanding: money(c.outstanding) }));

    const [{ customers }] = await tx
      .select({ customers: sql<number>`count(*)::int` })
      .from(parties)
      .where(inArray(parties.kind, ['CUSTOMER', 'BOTH']));

    return {
      invoicedLastMonth: money(sumMonth(prevMonth)),
      collectedLastMonth: money(collectedIn(prevMonth)),
      unpaidCount: receivables.length,
      overdueCount: receivables.filter((s) => s.overdue).length,
      customerCount: customers,
      averageDaysToPay,
      monthly: months.map((month) => ({ month, invoiced: money(sumMonth(month)), collected: money(collectedIn(month)) })),
      aging: Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, money(v)])) as Dashboard['aging'],
      topCustomers,
      recentInvoices: all.slice(0, 8),
      outstanding: money(sum(receivables, remaining)),
      overdue: money(sum(receivables.filter((s) => s.overdue), remaining)),
      collectedThisMonth: money(monthPayments.reduce((a, p) => a.plus(p.amount), new Decimal(0))),
      invoicedThisMonth: money(
        sum(
          issued.filter((s) => s.issueDate >= monthStart && s.issueDate < nextMonth),
          (s) => new Decimal(s.totalGross),
        ),
      ),
      vatCollectedThisMonth: money(
        monthPayments.reduce(
          (a, p) =>
            new Decimal(p.amountDue).isZero()
              ? a
              : a.plus(new Decimal(p.amount).plus(p.vatWithheld).plus(p.taxWithheld).times(p.totalVat).div(p.amountDue).toDecimalPlaces(2)),
          new Decimal(0),
        ),
      ),
      draftCount: drafts,
      receivables: receivables.slice(0, 50),
      recentPayments: recent.map(({ p, number, snapshot }) => ({
        ...(dto(p) as any),
        invoiceNumber: number ?? '',
        customerName: snapshot?.customer.name ?? '',
      })),
    };
  }
}
