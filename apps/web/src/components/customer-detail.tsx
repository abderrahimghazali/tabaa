"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiEditLine } from "@remixicon/react";
import type { InvoiceSummary, Party } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { AlertDialog } from "@/components/base/modal/modal";
import { toast } from "@/components/base/toast/toast";
import { Card, PageHeader } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import { NameAvatar } from "@/components/app/name-avatar";
import { deleteParty } from "@/lib/actions";
import { groupDigits, ICE_GROUPS, sub } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";
import { CrumbLabel, TopbarActions } from "./frame";
import { InvoicesView } from "./invoice/invoices-view";
import { WriteOnly } from "@/components/app/write-only";
import { PartyDrawer } from "./party-form";

export function CustomerDetail({ party, invoices, today }: { party: Party; invoices: InvoiceSummary[]; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const issued = invoices.filter((i) => i.state === "ISSUED" && i.type !== "CREDIT_NOTE");
  const cents = (s: string) => Math.round(Number(s) * 100);
  const invoiced = issued.reduce((s, i) => s + cents(i.totalGross), 0) / 100;
  const open = issued.filter((i) => i.paymentStatus !== "PAID");
  const outstanding = open.reduce((s, i) => s + cents(sub(i.amountDue, i.paidAmount)), 0) / 100;
  const overdue = open.filter((i) => i.overdue).reduce((s, i) => s + cents(sub(i.amountDue, i.paidAmount)), 0) / 100;

  const remove = async () => {
    const res = await deleteParty(party.id);
    if (res.ok) {
      toast.success(t("customers.deleted"));
      router.push("/clients");
    } else toast.error(res.error.code === "CONFLICT" ? t("customers.inUse") : res.error.message);
  };

  const info: [string, React.ReactNode][] = [
    ["ICE", party.ice ? <span key="i" className="ident">{groupDigits(party.ice, ICE_GROUPS)}</span> : null],
    ["IF", party.ifNumber ? <span key="f" className="ident">{party.ifNumber}</span> : null],
    [t("field.address"), `${party.address.line1}${party.address.line2 ? `, ${party.address.line2}` : ""}, ${party.address.postalCode ?? ""} ${party.address.city}`],
    [t("field.email"), party.email ?? null],
    [t("field.phone"), party.phone ? <span key="p" className="num">{party.phone}</span> : null],
    [t("customers.termShort"), party.paymentTermDays != null ? <span key="t" className="num">{party.paymentTermDays} {t("dash.daysUnit")}</span> : null],
  ];

  const stat = (label: string, value: number, tone?: string) => (
    <Card className="p-4">
      <div className="text-body-regular text-text-secondary">{label}</div>
      <Money value={value.toFixed(2)} locale={locale} className={cx("mt-1 text-title-2-medium", tone ?? "text-text-primary")} />
    </Card>
  );

  return (
    <div>
      <CrumbLabel>{party.name}</CrumbLabel>
      <TopbarActions>
        <WriteOnly>
          <Button variant="secondary" leadingIcon={RiEditLine} onClick={() => setEditing(true)}>
            {t("common.edit")}
          </Button>
          <ButtonLink href="/factures/nouvelle" leadingIcon={RiAddLine}>
            {t("invoices.new")}
          </ButtonLink>
        </WriteOnly>
      </TopbarActions>

      <PageHeader title={party.name} badge={<Chip variant="caption" color="gray">{t(`partyType.${party.type}`)}</Chip>} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <NameAvatar name={party.name} size="lg" />
              <div className="text-headline-medium text-text-primary">{t("customers.identity")}</div>
            </div>
            <dl className="grid gap-2.5 text-body-regular">
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="min-w-0 wrap-break-word text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="grid gap-3 min-[560px]:grid-cols-3 wide:grid-cols-1">
            {stat(t("customers.invoiced"), invoiced)}
            {stat(t("customers.outstanding"), outstanding)}
            {stat(t("dash.overdue"), overdue, overdue > 0 ? "text-text-error-primary" : undefined)}
          </div>
        </div>

        <InvoicesView invoices={invoices} today={today} hideCustomer />
      </div>

      <PartyDrawer isOpen={editing} onOpenChange={setEditing} party={party} onDelete={() => setDeleting(true)} />
      <AlertDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={t("customers.deleteTitle")}
        description={t("customers.deleteBody", { name: party.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
      />
    </div>
  );
}
