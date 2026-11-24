import { connection } from "next/server";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { getMe, requireCompany } from "@/lib/data";
import { canWrite } from "@/lib/me";
import { todayIso } from "@/lib/format";
import { InvoiceEditor } from "@/components/invoice/editor";

export default async function NewInvoicePage() {
  await connection();
  if (!canWrite(await getMe())) redirect("/factures");
  const company = await requireCompany();
  const [parties, items] = await Promise.all([api.parties(), api.items()]);
  return (
    <InvoiceEditor
      company={company}
      parties={parties.filter((p) => p.kind !== "SUPPLIER")}
      items={items}
      today={todayIso()}
    />
  );
}
