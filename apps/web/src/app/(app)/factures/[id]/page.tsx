import { connection } from "next/server";
import { notFound } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { InvoiceDetail } from "@/components/invoice/detail";

export default async function InvoicePage({ params, searchParams }: PageProps<"/factures/[id]">) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const company = await requireCompany();
  const invoice = await api
    .invoice(id)
    .catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e)));
  if (!invoice) notFound();
  return <InvoiceDetail invoice={invoice} company={company} today={todayIso()} openPayment={sp.pay === "1"} />;
}
