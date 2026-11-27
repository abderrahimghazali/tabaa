import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import { getMe, requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { canWrite } from "@/lib/me";
import { PurchaseForm } from "@/components/purchase/purchase-form";

export default async function EditPurchasePage({ params }: PageProps<"/achats/[id]/modifier">) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  if (!canWrite(await getMe())) redirect(`/achats/${id}`);
  await requireCompany();
  const [purchase, parties] = await Promise.all([
    api.purchase(id).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e))),
    api.parties(),
  ]);
  if (!purchase) notFound();
  if (purchase.state === "APPROVED") redirect(`/achats/${id}`);
  return <PurchaseForm purchase={purchase} suppliers={parties.filter((p) => p.kind !== "CUSTOMER")} today={todayIso()} />;
}
