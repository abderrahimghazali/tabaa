import { connection } from "next/server";
import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { resolvePeriod } from "@/lib/report-page";
import { TermsReport } from "@/components/reports/terms-report";

export default async function TermsPage({ searchParams }: PageProps<"/declarations/delais">) {
  await connection();
  await requireCompany();
  const sp = await searchParams;
  const { period, today, one } = await resolvePeriod(sp, "/declarations/delais", "quarter", ["quarter"]);
  const raw = one(sp.keyRate);
  const keyRate = raw && /^\d{1,2}(\.\d{1,2})?$/.test(raw) ? raw : "";
  return <TermsReport s={await api.paymentTermsReport(period, keyRate || undefined)} today={today} keyRate={keyRate} />;
}
