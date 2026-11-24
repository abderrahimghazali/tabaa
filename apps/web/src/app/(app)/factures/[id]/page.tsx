import { connection } from "next/server";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/ids";
import { api, ApiFailure } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { InvoiceDetail } from "@/components/invoice/detail";

export default async function InvoicePage({ params, searchParams }: PageProps<"/factures/[id]">) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  await requireCompany();
  const invoice = await api
    .invoice(id)
    .catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e)));
  if (!invoice) notFound();
  return <InvoiceDetail invoice={invoice} today={todayIso()} openPayment={sp.pay === "1"} />;
}
