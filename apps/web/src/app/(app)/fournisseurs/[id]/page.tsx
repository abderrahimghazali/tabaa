import { connection } from "next/server";
import { notFound } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { isUuid } from "@/lib/ids";
import { SupplierDetail } from "@/components/purchase/supplier-detail";

export default async function SupplierPage({ params }: PageProps<"/fournisseurs/[id]">) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireCompany();
  const [party, list] = await Promise.all([
    api.party(id).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e))),
    api.purchases({ supplierId: id, pageSize: "100" }),
  ]);
  if (!party || party.kind === "CUSTOMER") notFound();
  return <SupplierDetail party={party} purchases={list.items} total={list.total} />;
}
