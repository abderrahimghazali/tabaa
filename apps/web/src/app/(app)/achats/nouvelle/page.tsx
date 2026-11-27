import { connection } from "next/server";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { getMe, requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { canWrite } from "@/lib/me";
import { PurchaseForm } from "@/components/purchase/purchase-form";

export default async function NewPurchasePage({ searchParams }: PageProps<"/achats/nouvelle">) {
  await connection();
  if (!canWrite(await getMe())) redirect("/achats");
  await requireCompany();
  const sp = await searchParams;
  const parties = await api.parties();
  const suppliers = parties.filter((p) => p.kind !== "CUSTOMER");
  const wanted = typeof sp.supplier === "string" ? sp.supplier : undefined;
  return <PurchaseForm suppliers={suppliers} today={todayIso()} defaultSupplierId={suppliers.find((p) => p.id === wanted)?.id} />;
}
