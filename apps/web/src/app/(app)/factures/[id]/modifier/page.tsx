import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { getMe, requireCompany } from "@/lib/data";
import { canWrite } from "@/lib/me";
import { todayIso } from "@/lib/format";
import { InvoiceEditor } from "@/components/invoice/editor";

export default async function EditInvoicePage({ params }: PageProps<"/factures/[id]/modifier">) {
  await connection();
  if (!canWrite(await getMe())) redirect("/factures");
  const { id } = await params;
  const company = await requireCompany();
  const [invoice, parties, items] = await Promise.all([
    api.invoice(id).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e))),
    api.parties(),
    api.items(),
  ]);
  if (!invoice) notFound();
  if (invoice.state !== "DRAFT") redirect(`/factures/${id}`);
  return (
    <InvoiceEditor
      company={company}
      parties={parties.filter((p) => p.kind !== "SUPPLIER" || p.id === invoice.customerId)}
      items={items}
      invoice={invoice}
      today={todayIso()}
    />
  );
}
