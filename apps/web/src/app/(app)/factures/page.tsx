import { api } from "@/lib/api";
import { requireCompany } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { getT } from "@/lib/locale";
import { TopbarActions } from "@/components/frame";
import { InvoicesView } from "@/components/invoice/invoices-view";
import { ButtonLink } from "@/components/base/buttons/button";
import { PageHeader } from "@/components/app/layout";
import { TABS, type Tab } from "@/lib/invoice-tabs";
import { WriteOnly } from "@/components/app/write-only";
import { RiAddLine } from "@remixicon/react";

export default async function InvoicesPage({ searchParams }: PageProps<"/factures">) {
  const { t } = await getT();
  await requireCompany();
  const sp = await searchParams;
  const tab: Tab = TABS.find((x) => x === sp.tab) ?? "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const invoices = await api.invoices();

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <ButtonLink href="/factures/nouvelle" leadingIcon={RiAddLine}>
            {t("invoices.new")}
          </ButtonLink>
        </WriteOnly>
      </TopbarActions>
      <PageHeader title={t("nav.invoices")} subtitle={t("invoices.subtitle")} />
      <InvoicesView invoices={invoices} today={todayIso()} initialTab={tab} initialQuery={q} />
    </div>
  );
}
