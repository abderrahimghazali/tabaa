import { connection } from "next/server";
import { activeRules } from "@facture/core";
import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { getT } from "@/lib/locale";
import { ItemsView } from "@/components/items-view";
import { PageHeader } from "@/components/app/layout";

export default async function ItemsPage({ searchParams }: PageProps<"/articles">) {
  await connection();
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const items = await api.items();
  return (
    <div>
      <PageHeader title={t("nav.items")} subtitle={t("items.subtitle")} />
      <ItemsView items={items} vatRates={activeRules(todayIso()).vatRates} openNew={sp.new === "1"} />
    </div>
  );
}
