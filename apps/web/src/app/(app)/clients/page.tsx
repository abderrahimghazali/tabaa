import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { sub } from "@/lib/format";
import { getT } from "@/lib/locale";
import { ClientsView } from "@/components/clients-view";
import { PageHeader } from "@/components/app/layout";

const OUTSTANDING_LIMIT = 60;

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const parties = (await api.parties()).filter((p) => p.kind !== "SUPPLIER");
  const outstanding: Record<string, string> = {};
  if (parties.length <= OUTSTANDING_LIMIT) {
    const lists = await Promise.all(parties.map((p) => api.invoices({ customerId: p.id, state: "ISSUED" })));
    parties.forEach((p, i) => {
      const total = lists[i]!
        .filter((inv) => inv.type !== "CREDIT_NOTE" && inv.paymentStatus !== "PAID")
        .reduce((s, inv) => s + Math.round(Number(sub(inv.amountDue, inv.paidAmount)) * 100), 0);
      outstanding[p.id] = (total / 100).toFixed(2);
    });
  }
  return (
    <div>
      <PageHeader title={t("nav.customers")} subtitle={t("customers.subtitle")} />
      <ClientsView parties={parties} outstanding={outstanding} openNew={sp.new === "1"} />
    </div>
  );
}
