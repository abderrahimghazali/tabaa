import { connection } from "next/server";
import { notFound } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { PurchaseDetail } from "@/components/purchase/purchase-detail";

export default async function PurchasePage({ params }: PageProps<"/achats/[id]">) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireCompany();
  const purchase = await api.purchase(id).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e)));
  if (!purchase) notFound();
  return <PurchaseDetail purchase={purchase} today={todayIso()} />;
}
