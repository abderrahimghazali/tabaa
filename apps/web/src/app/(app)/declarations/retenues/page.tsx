import { connection } from "next/server";
import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { resolvePeriod } from "@/lib/report-page";
import { WithholdingsReport } from "@/components/reports/withholdings-report";

export default async function WithholdingsPage({ searchParams }: PageProps<"/declarations/retenues">) {
  await connection();
  await requireCompany();
  const sp = await searchParams;
  const { period, today } = await resolvePeriod(sp, "/declarations/retenues", "month", ["month", "quarter"]);
  return <WithholdingsReport s={await api.withholdingReport(period)} today={today} />;
}
