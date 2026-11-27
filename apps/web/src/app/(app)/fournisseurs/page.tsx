import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { getT } from "@/lib/locale";
import { ClientsView } from "@/components/clients-view";
import { PageHeader } from "@/components/app/layout";

export default async function SuppliersPage({ searchParams }: PageProps<"/fournisseurs">) {
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const parties = (await api.parties()).filter((p) => p.kind !== "CUSTOMER");
  const owed: Record<string, number> = {};
  for (let page = 1; page <= 5; page++) {
    const list = await api.purchases({ state: "APPROVED", pageSize: "100", page: String(page) });
    for (const p of list.items) owed[p.supplierId] = (owed[p.supplierId] ?? 0) + Math.round(Number(p.amountDue) * 100);
    if (page * 100 >= list.total) break;
  }
  const outstanding = Object.fromEntries(parties.map((p) => [p.id, ((owed[p.id] ?? 0) / 100).toFixed(2)]));
  return (
    <div>
      <PageHeader title={t("nav.suppliers")} subtitle={t("suppliers.subtitle")} />
      <ClientsView kind="SUPPLIER" parties={parties} outstanding={outstanding} openNew={sp.new === "1"} />
    </div>
  );
}
