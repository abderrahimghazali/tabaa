"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiEditLine, RiShoppingBag3Line } from "@remixicon/react";
import type { Party, PurchaseSummary } from "@facture/core";
import { Card, PageHeader } from "@/components/app/layout";
import { MobileActionBar } from "@/components/app/mobile-actions";
import { Money } from "@/components/app/money";
import { NameAvatar } from "@/components/app/name-avatar";
import { WriteOnly } from "@/components/app/write-only";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { AlertDialog } from "@/components/base/modal/modal";
import { toast } from "@/components/base/toast/toast";
import { CrumbLabel, TopbarActions } from "@/components/frame";
import { EmptyState, ListCard } from "@/components/invoice/list-kit";
import { PartyDrawer } from "@/components/party-form";
import { deleteParty } from "@/lib/actions";
import { groupDigits, ICE_GROUPS } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCanAdmin } from "@/lib/me-client";
import { cx } from "@/utils/cx";
import { PurchaseRows } from "./purchases-view";

const cents = (s: string) => Math.round(Number(s) * 100);

export function SupplierDetail({ party, purchases, total }: { party: Party; purchases: PurchaseSummary[]; total: number }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canAdmin = useCanAdmin();

  const approved = purchases.filter((p) => p.state === "APPROVED");
  const billed = approved.reduce((s, p) => s + cents(p.totalGross), 0) / 100;
  const owed = approved.reduce((s, p) => s + cents(p.amountDue), 0) / 100;
  const late = approved.filter((p) => p.overdue).reduce((s, p) => s + cents(p.amountDue), 0) / 100;

  const remove = async () => {
    const res = await deleteParty(party.id);
    if (res.ok) {
      toast.success(t("suppliers.deleted"));
      router.push("/fournisseurs");
    } else toast.error(res.error.code === "CONFLICT" ? t("suppliers.inUse") : res.error.message);
  };

  const info: [string, React.ReactNode][] = [
    ["ICE", party.ice ? <span key="i" className="ident">{groupDigits(party.ice, ICE_GROUPS)}</span> : <span key="i" className="text-text-error-primary">{t("purchases.missing")}</span>],
    ["IF", party.ifNumber ? <span key="f" className="ident">{party.ifNumber}</span> : <span key="f" className="text-text-error-primary">{t("purchases.missing")}</span>],
    [t("field.address"), `${party.address.line1}${party.address.line2 ? `, ${party.address.line2}` : ""}, ${party.address.postalCode ?? ""} ${party.address.city}`],
    [t("field.email"), party.email ?? null],
    [t("field.phone"), party.phone ? <span key="p" className="num">{party.phone}</span> : null],
    [t("suppliers.termShort"), party.paymentTermDays != null ? <span key="t" className="num">{party.paymentTermDays} {t("dash.daysUnit")}</span> : null],
  ];

  const stat = (label: string, value: number, tone?: string) => (
    <Card className="min-w-fit flex-1 p-4 max-sm:rounded-2xl max-sm:p-3">
      <div className="text-body-regular text-text-secondary max-sm:text-caption-1-medium">{label}</div>
      <Money value={value.toFixed(2)} locale={locale} className={cx("mt-1 text-title-2-medium max-sm:flex-col max-sm:items-start max-sm:gap-0 max-sm:text-[15px] max-sm:leading-5", tone ?? "text-text-primary")} />
    </Card>
  );

  const newHref = `/achats/nouvelle?supplier=${party.id}`;

  return (
    <div>
      <CrumbLabel>{party.name}</CrumbLabel>
      <TopbarActions>
        <WriteOnly>
          <Button variant="secondary" leadingIcon={RiEditLine} onClick={() => setEditing(true)}>{t("common.edit")}</Button>
          <ButtonLink href={newHref} leadingIcon={RiAddLine}>{t("purchases.new")}</ButtonLink>
        </WriteOnly>
      </TopbarActions>
      <WriteOnly>
        <MobileActionBar more={[{ key: "edit", label: t("common.edit"), icon: RiEditLine, onSelect: () => setEditing(true) }]}>
          <ButtonLink href={newHref} leadingIcon={RiAddLine}>{t("purchases.new")}</ButtonLink>
        </MobileActionBar>
      </WriteOnly>

      <PageHeader
        title={party.name}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip variant="caption" color="gray">{t(party.type === "FOREIGN" ? "partyType.FOREIGN.supplier" : `partyType.${party.type}`)}</Chip>
            {party.kind === "BOTH" && <Chip variant="caption" color="blue">{t("partyKind.BOTH")}</Chip>}
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <NameAvatar name={party.name} size="lg" />
              <div className="text-headline-medium text-text-primary">{t("customers.identity")}</div>
            </div>
            <dl className="grid gap-2.5 text-body-regular">
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid gap-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-text-secondary max-sm:text-caption-1-medium">{k}</dt>
                  <dd className="min-w-0 wrap-break-word text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="flex gap-2 overflow-x-auto sm:gap-3 wide:grid wide:grid-cols-1 wide:overflow-visible">
            {stat(t("suppliers.billed"), billed)}
            {stat(t("suppliers.owed"), owed)}
            {stat(t("dash.overdue"), late, late > 0 ? "text-text-error-primary" : undefined)}
          </div>
        </div>

        <ListCard className="pb-0">
          <h2 className="px-4 pt-2 pb-1 text-headline-semibold text-text-primary">{t("purchases.title")} <span className="num text-text-tertiary">({total})</span></h2>
          {purchases.length === 0 ? (
            <div className="mt-2 border-t border-separator-border">
              <EmptyState icon={RiShoppingBag3Line} title={t("suppliers.noPurchases")} body={t("suppliers.noPurchasesBody")} />
            </div>
          ) : (
            <PurchaseRows items={purchases} hideSupplier />
          )}
        </ListCard>
      </div>

      <PartyDrawer isOpen={editing} onOpenChange={setEditing} party={party} onDelete={canAdmin ? () => setDeleting(true) : undefined} />
      <AlertDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={t("suppliers.deleteTitle")}
        description={t("suppliers.deleteBody", { name: party.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
      />
    </div>
  );
}
