import { connection } from "next/server";
import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { getT } from "@/lib/locale";
import { PageHeader } from "@/components/app/layout";
import { PurchasesView } from "@/components/purchase/purchases-view";

const PAGE_SIZE = 25;
const STATES = ["TO_APPROVE", "APPROVED", "REJECTED"] as const;
const PAYMENTS = ["UNPAID", "PARTIAL", "PAID"] as const;
const PERIODS = ["month", "d30", "quarter", "year"] as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function range(period: string | undefined, today: string): { from?: string; to?: string } {
  if (period === "month") return { from: `${today.slice(0, 7)}-01` };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01` };
  const days = period === "d30" ? 30 : period === "quarter" ? 90 : 0;
  if (!days) return {};
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return { from: d.toISOString().slice(0, 10) };
}

export default async function PurchasesPage({ searchParams }: PageProps<"/achats">) {
  await connection();
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const state = STATES.find((s) => s === one(sp.state));
  const pay = PAYMENTS.find((s) => s === one(sp.pay));
  const overdue = one(sp.overdue) === "1";
  const supplier = one(sp.supplier);
  const period = PERIODS.find((s) => s === one(sp.period));
  const q = one(sp.q)?.slice(0, 100) ?? "";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  const { from } = range(period, todayIso());
  const [list, parties] = await Promise.all([
    api.purchases({ state, paymentStatus: pay, overdue: overdue ? "true" : undefined, supplierId: supplier, q, from, page: String(page), pageSize: String(PAGE_SIZE) }),
    api.parties(),
  ]);
  return (
    <div>
      <PageHeader title={t("purchases.title")} subtitle={t("purchases.subtitle")} />
      <PurchasesView
        list={list}
        suppliers={parties.filter((p) => p.kind !== "CUSTOMER").map((p) => ({ id: p.id, name: p.name }))}
        filters={{ state: state ?? "all", pay: pay ?? "all", overdue, supplier: supplier ?? "all", period: period ?? "all", q }}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
