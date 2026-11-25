import { connection } from "next/server";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/ids";
import { api, ApiFailure } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { CustomerDetail } from "@/components/customer-detail";

export default async function CustomerPage({ params }: PageProps<"/clients/[id]">) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireCompany();
  const [party, invoices] = await Promise.all([
    api.party(id).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e))),
    api.invoices({ customerId: id }),
  ]);
  if (!party) notFound();
  return <CustomerDetail party={party} invoices={invoices} today={todayIso()} />;
}
