import { connection } from "next/server";
import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { resolvePeriod } from "@/lib/report-page";
import { VatReport } from "@/components/reports/vat-report";

export default async function VatPage({ searchParams }: PageProps<"/declarations/tva">) {
  await connection();
  await requireCompany();
  const sp = await searchParams;
  const { period, today, one } = await resolvePeriod(sp, "/declarations/tva", "regime", ["month", "quarter"]);
  const credit = one(sp.previousCredit);
  const statement = await api.vatReport(period, credit && /^\d{1,13}(\.\d{1,2})?$/.test(credit) ? credit : undefined);
  return <VatReport s={statement} today={today} />;
}
