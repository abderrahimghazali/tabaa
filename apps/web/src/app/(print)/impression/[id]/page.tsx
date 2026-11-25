import { connection } from "next/server";
import { notFound } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { isUuid } from "@/lib/ids";
import { verifyRenderToken } from "@/lib/render-token";
import { PrintSheet, type SheetModel } from "@/components/invoice/invoice-sheet";

export const metadata = { robots: { index: false, follow: false } };

export default async function PrintPage({ params, searchParams }: PageProps<"/impression/[id]">) {
  await connection();
  const { id } = await params;
  const { token } = await searchParams;
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!secret || !isUuid(id) || !verifyRenderToken(secret, id, typeof token === "string" ? token : undefined)) notFound();
  const invoice = await api
    .invoice(id)
    .catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e)));
  if (!invoice) notFound();

  const model: SheetModel = {
    company: invoice.seller,
    customer: invoice.customer,
    number: invoice.number,
    type: invoice.type,
    status: invoice.state === "DRAFT" ? "draft" : invoice.type === "CREDIT_NOTE" ? "credit" : "issued",
    issueDate: invoice.issueDate,
    deliveryDate: invoice.deliveryDate,
    dueDate: invoice.dueDate,
    paymentMethod: invoice.paymentMethod,
    reference: invoice.reference,
    notes: invoice.notes,
    language: invoice.language,
    currency: invoice.currency,
    totals: invoice.totals,
    words: invoice.amountInWords,
  };
  return <PrintSheet model={model} />;
}
