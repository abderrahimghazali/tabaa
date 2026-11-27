"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiAddLine, RiAlertLine, RiCheckLine, RiCloseCircleLine, RiDeleteBinLine, RiEditLine, RiFlagLine, RiHistoryLine } from "@remixicon/react";
import { activeRules, PaymentMethod, type ApiError, type Purchase, type PurchasePayment } from "@facture/core";
import { Card, PageHeader } from "@/components/app/layout";
import { MobileActionBar, type MoreItem } from "@/components/app/mobile-actions";
import { Money } from "@/components/app/money";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Divider } from "@/components/base/divider/divider";
import { AlertDialog, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { ProgressBar } from "@/components/base/progress/progress";
import { Select, SelectItem } from "@/components/base/select/select";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { toast } from "@/components/base/toast/toast";
import { Notice } from "@/components/auth/fields";
import { CrumbLabel, TopbarActions } from "@/components/frame";
import { DateField, DecimalField } from "@/components/invoice/fields";
import { IssueList } from "@/components/ui/issue-list";
import { WithholdingSection } from "@/components/app/withholding-section";
import {
  approvePurchase,
  deletePurchase,
  disputePurchase,
  payPurchase,
  rejectPurchase,
  reopenPurchase,
  voidPurchasePayment,
} from "@/lib/actions";
import { fmtDate, fmtNumber, groupDigits, ICE_GROUPS } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCan } from "@/lib/me-client";
import { fromCents, purchaseError, toCents } from "@/lib/purchase";
import { issuesAt } from "@/lib/result";
import { useStamp } from "@/lib/use-stamp";
import { cx } from "@/utils/cx";
import { DisputeChip, PurchaseStatusChip } from "./purchase-status";

type Confirm = "delete" | "reopen" | { void: string } | null;
const DOT = { neutral: "bg-foreground-icon-tertiary", accent: "bg-accent-500", ok: "bg-green-500", warn: "bg-orange-500" } as const;

export function PurchaseDetail({ purchase: p, today }: { purchase: Purchase; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const stamp = useStamp();
  const canWrite = useCan("write");
  const canAdmin = useCan("admin");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const editable = p.state !== "APPROVED";
  const approved = p.state === "APPROVED";
  const due = Number(p.amountDue);
  const canPay = approved && due > 0 && canWrite;
  const paidPct = Math.min(100, (Number(p.paidAmount) / Math.max(1, Number(p.totalGross))) * 100);
  const rules = activeRules(p.issueDate);
  const term = Math.round((Date.parse(p.dueDate) - Date.parse(p.issueDate)) / 86_400_000);

  async function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: ApiError }>, ok: string) {
    setError(null);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast.success(ok);
      router.refresh();
      return true;
    }
    setError(res.error);
    toast.error(purchaseError(res.error, t));
    return false;
  }

  const approve = () => run(() => approvePurchase(p.id), t("purchases.toast.approved"));
  const toggleDispute = () => run(() => disputePurchase(p.id, !p.disputed), t(p.disputed ? "purchases.toast.disputeOff" : "purchases.toast.disputeOn"));

  const confirmAction = async (c: Exclude<Confirm, null>) => {
    if (c === "delete") {
      setBusy(true);
      const res = await deletePurchase(p.id);
      setBusy(false);
      if (res.ok) {
        toast.success(t("purchases.toast.deleted"));
        router.push("/achats");
      } else {
        toast.error(res.error.code === "HAS_PAYMENTS" ? t("purchases.err.HAS_HISTORY") : purchaseError(res.error, t));
        throw new Error(res.error.code);
      }
      return;
    }
    const ok =
      c === "reopen"
        ? await run(() => reopenPurchase(p.id), t("purchases.toast.reopened"))
        : await run(() => voidPurchasePayment(p.id, c.void), t("purchases.toast.voided"));
    if (!ok) throw new Error("failed");
  };

  const confirmText = confirm
    ? confirm === "delete"
      ? { title: t("purchases.confirm.deleteTitle"), body: t("purchases.confirm.deleteBody", { number: p.number }), label: t("common.delete"), danger: true }
      : confirm === "reopen"
        ? { title: t("purchases.confirm.reopenTitle"), body: t("purchases.confirm.reopenBody"), label: t("purchases.reopen"), danger: false }
        : { title: t("purchases.confirm.voidTitle"), body: t("purchases.confirm.voidBody"), label: t("purchases.pay.void"), danger: true }
    : null;

  const editHref = `/achats/${p.id}/modifier`;
  const canReopen = approved && canAdmin && p.payments.length === 0;

  const more: MoreItem[] = [];
  if (approved && canWrite) more.push({ key: "dispute", label: t(p.disputed ? "purchases.disputeOff" : "purchases.disputeOn"), icon: RiFlagLine, onSelect: () => void toggleDispute() });
  if (canReopen) more.push({ key: "reopen", label: t("purchases.reopen"), icon: RiHistoryLine, onSelect: () => setConfirm("reopen") });
  if (editable && canWrite) more.push({ key: "edit", label: t("common.edit"), icon: RiEditLine, onSelect: () => router.push(editHref) });
  if (editable && canAdmin) more.push({ key: "delete", label: t("common.delete"), icon: RiDeleteBinLine, onSelect: () => setConfirm("delete") });
  if (p.state === "TO_APPROVE" && canAdmin) more.push({ key: "reject", label: t("purchases.reject"), icon: RiCloseCircleLine, onSelect: () => setRejectOpen(true) });

  let primary: React.ReactNode = null;
  if (p.state === "TO_APPROVE" && canAdmin)
    primary = <Button leadingIcon={RiCheckLine} onClick={() => void approve()} disabled={busy}>{t("purchases.approve")}</Button>;
  else if (p.state === "TO_APPROVE" && canWrite)
    primary = <ButtonLink href={editHref} leadingIcon={RiEditLine}>{t("common.edit")}</ButtonLink>;
  else if (p.state === "REJECTED" && canWrite)
    primary = <ButtonLink href={editHref} leadingIcon={RiEditLine}>{t("common.edit")}</ButtonLink>;
  else if (canPay) primary = <Button leadingIcon={RiAddLine} onClick={() => setPayOpen(true)}>{t("purchases.pay.record")}</Button>;
  const mobileMore = primary && more.some((m) => m.key === "edit") && (p.state === "REJECTED" || (p.state === "TO_APPROVE" && !canAdmin)) ? more.filter((m) => m.key !== "edit") : more;

  const events: { key: string; tone: keyof typeof DOT; title: string; meta: string }[] = [
    { key: "created", tone: "neutral", title: t("purchases.act.created"), meta: p.createdByName ?? fmtDate(p.issueDate) },
    ...(p.state === "REJECTED" ? [{ key: "rejected", tone: "warn" as const, title: t("purchases.act.rejected"), meta: p.rejectionReason ?? "" }] : []),
    ...(p.approvedAt ? [{ key: "approved", tone: "accent" as const, title: t("purchases.act.approved"), meta: `${stamp(p.approvedAt)}${p.approvedByName ? ` · ${p.approvedByName}` : ""}` }] : []),
    ...p.payments.map((pay) => ({
      key: pay.id,
      tone: "ok" as const,
      title: t("purchases.act.payment", { method: t(`pm.${pay.method}`) }),
      meta: `${fmtDate(pay.paidOn)} · ${fmtNumber(pay.settled)}`,
    })),
  ];

  const warnings = p.warnings.map((w) => {
    const vars = { n: term, max: rules.maxPaymentTermDays, day: fmtNumber(rules.cashLimitPerDay).replace(",00", ""), month: fmtNumber(rules.cashLimitPerMonth).replace(",00", "") };
    return { code: w, title: t(`purchases.warn.${w}.title`), body: t(`purchases.warn.${w}.body`, vars), fix: w.startsWith("SUPPLIER_") };
  });

  const info: [string, React.ReactNode][] = [
    [t("purchases.form.supplier"), <Link key="s" href={`/fournisseurs/${p.supplierId}`} className="text-text-primary underline-offset-2 hover:underline">{p.supplier.name}</Link>],
    ["ICE", p.supplier.ice ? <span key="i" className="ident">{groupDigits(p.supplier.ice, ICE_GROUPS)}</span> : <span key="i" className="text-text-error-primary">{t("purchases.missing")}</span>],
    ["IF", p.supplier.ifNumber ? <span key="f" className="ident">{p.supplier.ifNumber}</span> : <span key="f" className="text-text-error-primary">{t("purchases.missing")}</span>],
    [t("purchases.form.number"), <span key="n" className="ident">{p.number}</span>],
    [t("purchases.form.issueDate"), <span key="d" className="num">{fmtDate(p.issueDate)}</span>],
    [t("purchases.form.dueDate"), <span key="u" className="num">{fmtDate(p.dueDate)} <span className="text-text-secondary">({t("purchases.form.term", { n: term })})</span></span>],
    [t("purchases.form.category"), t(`pcat.${p.category}`)],
    [t("purchases.form.description"), p.description],
    [t("purchases.form.deductible"), t(p.vatDeductible ? "purchases.deductibleYes" : "purchases.deductibleNo")],
    ...(p.notes ? ([[t("editor.notes"), <span key="no" className="whitespace-pre-wrap">{p.notes}</span>]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div>
      <CrumbLabel>{p.number}</CrumbLabel>
      <TopbarActions>
        {p.state === "TO_APPROVE" && canWrite && (
          <ButtonLink variant="secondary" href={editHref} leadingIcon={RiEditLine}>{t("common.edit")}</ButtonLink>
        )}
        {p.state === "TO_APPROVE" && canAdmin && (
          <Button variant="secondary" leadingIcon={RiCloseCircleLine} onClick={() => setRejectOpen(true)} disabled={busy}>{t("purchases.reject")}</Button>
        )}
        {approved && canWrite && (
          <Button variant="secondary" leadingIcon={RiFlagLine} onClick={() => void toggleDispute()} disabled={busy}>{t(p.disputed ? "purchases.disputeOff" : "purchases.disputeOn")}</Button>
        )}
        {canReopen && <Button variant="secondary" leadingIcon={RiHistoryLine} onClick={() => setConfirm("reopen")} disabled={busy}>{t("purchases.reopen")}</Button>}
        {editable && canAdmin && <Button variant="secondary" iconOnly leadingIcon={RiDeleteBinLine} aria-label={t("common.delete")} onClick={() => setConfirm("delete")} disabled={busy} />}
        {p.state === "TO_APPROVE" && canAdmin && <Button leadingIcon={RiCheckLine} onClick={() => void approve()} disabled={busy}>{t("purchases.approve")}</Button>}
        {p.state === "REJECTED" && canWrite && <ButtonLink href={editHref} leadingIcon={RiEditLine}>{t("common.edit")}</ButtonLink>}
        {canPay && <Button leadingIcon={RiAddLine} onClick={() => setPayOpen(true)}>{t("purchases.pay.record")}</Button>}
      </TopbarActions>

      {(primary || mobileMore.length > 0) && <MobileActionBar more={mobileMore}>{primary}</MobileActionBar>}

      <PageHeader
        title={<span className="ident">{p.number}</span>}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <PurchaseStatusChip p={p} t={t} />
            {p.disputed && <DisputeChip t={t} />}
          </span>
        }
        subtitle={<Link href={`/fournisseurs/${p.supplierId}`} className="rounded text-text-secondary hover:text-text-primary hover:underline">{p.supplier.name}</Link>}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 wide:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-2 self-start rounded-3xl bg-background-secondary-default p-2">
          {error && <IssueList error={{ ...error, message: purchaseError(error, t) }} />}

          <Card className="p-5">
            <div className="text-body-regular text-text-secondary">{t("detail.gross")}</div>
            <Money value={p.totalGross} locale={locale} className="mt-1 text-title-1-semibold text-text-primary" />
            {approved && (
              <>
                <ProgressBar className="mt-5" aria-label={t("detail.progress")} value={paidPct} minValue={0} maxValue={100} formatOptions={{ style: "percent", maximumFractionDigits: 0 }} />
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-body-regular text-text-secondary"><span className="size-2 rounded-full bg-accent-500" />{t("purchases.paid")}</div>
                    <Money value={p.paidAmount} locale={locale} className="text-headline-semibold text-text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-body-regular text-text-secondary"><span className="size-2 rounded-full bg-border-button-default" />{t("col.remaining")}</div>
                    <Money value={p.amountDue} locale={locale} className={cx("text-headline-semibold", p.overdue ? "text-text-error-primary" : "text-text-primary")} />
                  </div>
                </div>
              </>
            )}
            <Divider className="my-4" />
            <table className="w-full text-body-regular">
              <caption className="sr-only">{t("purchases.byRate")}</caption>
              <thead>
                <tr className="text-caption-1-medium text-text-secondary">
                  <th scope="col" className="pb-1.5 text-start font-medium">{t("purchases.form.rate")}</th>
                  <th scope="col" className="pb-1.5 text-end font-medium">{t("purchases.form.net")}</th>
                  <th scope="col" className="pb-1.5 text-end font-medium">{t("purchases.form.vat")}</th>
                </tr>
              </thead>
              <tbody>
                {p.vatLines.map((l, i) => (
                  <tr key={i}>
                    <td className="num py-1 text-text-secondary rtl:text-right">{l.vatRate} %</td>
                    <td className="num py-1 text-end text-text-primary">{fmtNumber(l.net)}</td>
                    <td className="num py-1 text-end text-text-primary">{fmtNumber(l.vat)}</td>
                  </tr>
                ))}
                <tr className="border-t border-separator-border text-body-medium">
                  <td className="py-1.5 text-text-primary">{t("purchases.total")}</td>
                  <td className="num py-1.5 text-end">{fmtNumber(p.totalNet)}</td>
                  <td className="num py-1.5 text-end">{fmtNumber(p.totalVat)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-headline-semibold text-text-primary">{t("purchases.controls")}</h2>
            {warnings.length === 0 && p.vatDeductible ? (
              <p className="flex items-center gap-2 text-body-regular text-text-secondary"><RiCheckLine className="size-5 shrink-0 text-accent-600" aria-hidden />{t("purchases.controlsOk")}</p>
            ) : (
              <ul className="grid gap-3">
                {warnings.map((w) => (
                  <li key={w.code} className="flex gap-3 rounded-2xl bg-status-orange-background p-3 text-status-orange-text">
                    <RiAlertLine className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-body-medium">{w.title}</div>
                      <p className="text-body-regular">{w.body}</p>
                      {w.fix && canWrite && (
                        <Link href={`/fournisseurs/${p.supplierId}`} className="mt-1 inline-block text-body-medium underline underline-offset-2">{t("purchases.editSupplier")}</Link>
                      )}
                    </div>
                  </li>
                ))}
                {!p.vatDeductible && (
                  <li className="flex gap-3 rounded-2xl bg-background-secondary-default p-3">
                    <RiAlertLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    <p className="text-body-regular text-text-primary">{t("purchases.form.deductibleOff")}</p>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-headline-semibold text-text-primary">{t("purchases.approval")}</h2>
            {p.state === "TO_APPROVE" && (
              <div className="grid gap-3">
                <p className="text-body-regular text-text-secondary">{t(canAdmin ? "purchases.approvalWait" : "purchases.approvalWaitMember")}</p>
                {canAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <Button leadingIcon={RiCheckLine} onClick={() => void approve()} disabled={busy}>{t("purchases.approve")}</Button>
                    <Button variant="secondary" onClick={() => setRejectOpen(true)} disabled={busy}>{t("purchases.reject")}</Button>
                  </div>
                )}
              </div>
            )}
            {p.state === "REJECTED" && (
              <div className="grid gap-2">
                <p className="text-body-medium text-text-primary">{t("purchases.rejectedBecause")}</p>
                <p className="rounded-2xl bg-status-rose-background px-3 py-2.5 text-body-regular text-status-rose-text">{p.rejectionReason}</p>
                {canWrite && <div><ButtonLink variant="secondary" href={editHref} leadingIcon={RiEditLine}>{t("common.edit")}</ButtonLink></div>}
              </div>
            )}
            {approved && (
              <div className="grid gap-2">
                <p className="text-body-regular text-text-primary">
                  {p.approvedByName ? t("purchases.approvedBy", { name: p.approvedByName, date: p.approvedAt ? stamp(p.approvedAt) : "" }) : t("purchases.approvedAt", { date: p.approvedAt ? stamp(p.approvedAt) : "" })}
                </p>
                {p.disputed && <p className="text-body-regular text-text-secondary">{t("purchases.disputeNote")}</p>}
                {canAdmin && !canReopen && p.payments.length > 0 && <p className="text-caption-1-regular text-text-tertiary">{t("purchases.reopenBlocked")}</p>}
              </div>
            )}
          </Card>

          {approved && (
            <Card>
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
                <h2 className="text-headline-semibold text-text-primary">{t("purchases.payments")}</h2>
                {canPay && <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={() => setPayOpen(true)}>{t("payment.add")}</Button>}
              </div>
              {p.payments.length === 0 ? (
                <p className="px-5 pt-1 pb-5 text-body-regular text-text-secondary">{t("purchases.noPayments")}</p>
              ) : (
                <ul className="px-2 pb-2">
                  {p.payments.map((pay) => (
                    <PaymentItem key={pay.id} pay={pay} canVoid={canAdmin} onVoid={() => setConfirm({ void: pay.id })} locale={locale} busy={busy} />
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-4 text-headline-semibold text-text-primary">{t("activity.title")}</h2>
            <ol className="relative grid gap-4">
              <span className="absolute inset-y-1 start-[5px] w-px bg-border-button-default" aria-hidden="true" />
              {events.map((e) => (
                <li key={e.key} className="relative flex gap-3 ps-0.5">
                  <span className={cx("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-background-primary-default", DOT[e.tone])} />
                  <div className="min-w-0">
                    <div className="break-words text-body-medium text-text-primary">{e.title}</div>
                    <div className="num break-words text-caption-1-regular text-text-secondary">{e.meta}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 self-start">
          <Card className="p-5">
            <h2 className="mb-4 text-headline-semibold text-text-primary">{t("purchases.invoiceInfo")}</h2>
            <dl className="grid gap-3 text-body-regular">
              {info.map(([k, v]) => (
                <div key={k} className="grid gap-0.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-text-secondary max-sm:text-caption-1-medium">{k}</dt>
                  <dd className="min-w-0 break-words text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {confirmText && confirm && (
        <AlertDialog
          isOpen
          onOpenChange={(o) => !o && setConfirm(null)}
          variant={confirmText.danger ? "danger" : "default"}
          icon={confirmText.danger ? undefined : false}
          title={confirmText.title}
          description={confirmText.body}
          confirmLabel={confirmText.label}
          cancelLabel={t("common.cancel")}
          pendingLabel={t("auth.pending")}
          onConfirm={() => confirmAction(confirm)}
        />
      )}

      {payOpen && <PaymentDialog purchase={p} today={today} onClose={() => setPayOpen(false)} />}
      {rejectOpen && <RejectDialog purchase={p} onClose={() => setRejectOpen(false)} />}
    </div>
  );
}

function PaymentItem({ pay, canVoid, onVoid, locale, busy }: { pay: PurchasePayment; canVoid: boolean; onVoid: () => void; locale: "fr" | "ar"; busy: boolean }) {
  const { t } = useI18n();
  const held = toCents(pay.vatWithheld) + toCents(pay.taxWithheld);
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-background-primary-hover">
      <div className="min-w-0">
        <Money value={pay.amount} locale={locale} className="text-body-medium text-text-primary" />
        <div className="text-caption-1-regular text-text-secondary">
          <span className="num">{fmtDate(pay.paidOn)}</span> · {t(`pm.${pay.method}`)}
          {pay.reference && <> · <span className="ident">{pay.reference}</span></>}
        </div>
        {held > 0 && (
          <div className="num text-caption-1-regular text-text-secondary">
            {t("purchases.pay.withheldLine", { total: fmtNumber(fromCents(held)), vat: fmtNumber(pay.vatWithheld), tax: fmtNumber(pay.taxWithheld) })}
          </div>
        )}
      </div>
      {canVoid && <IconButton icon={RiCloseCircleLine} size="small" aria-label={t("purchases.pay.void")} onClick={onVoid} disabled={busy} />}
    </li>
  );
}

function RejectDialog({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!reason.trim()) return setError(t("purchases.rejectNeedReason"));
    setPending(true);
    const res = await rejectPurchase(purchase.id, reason.trim());
    setPending(false);
    if (res.ok) {
      toast.success(t("purchases.toast.rejected"));
      router.refresh();
      onClose();
    } else setError(purchaseError(res.error, t));
  };
  return (
    <Modal isOpen onOpenChange={(o) => !o && !pending && onClose()} size="md" aria-label={t("purchases.reject")}>
      <ModalHeader title={t("purchases.rejectTitle", { number: purchase.number })} description={t("purchases.rejectHint")} closeLabel={t("common.close")} />
      <ModalBody>
        <form id="reject-form" onSubmit={submit} noValidate className="grid gap-3 pt-1">
          {error && <Notice tone="error">{error}</Notice>}
          <Textarea label={t("purchases.rejectReason")} value={reason} onChange={(v) => { setReason(v); setError(null); }} rows={4} maxLength={500} autoFocus isRequired />
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
        <Button variant="danger" type="submit" form="reject-form" disabled={pending} aria-busy={pending}>{t("purchases.reject")}</Button>
      </ModalFooter>
    </Modal>
  );
}

function PaymentDialog({ purchase: p, today, onClose }: { purchase: Purchase; today: string; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const due = toCents(p.amountDue);
  const vatLeft = Math.max(0, toCents(p.totalVat) - p.payments.reduce((s, x) => s + toCents(x.vatWithheld), 0));
  const [paidOn, setPaidOn] = useState(today < p.issueDate ? p.issueDate : today);
  const [method, setMethod] = useState<(typeof PaymentMethod.options)[number]>("TRANSFER");
  const [amount, setAmount] = useState(fromCents(due));
  const [amountTouched, setAmountTouched] = useState(false);
  const [vat, setVat] = useState("");
  const [tax, setTax] = useState("");
  const [reference, setReference] = useState("");
  const [showWh, setShowWh] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const held = toCents(vat) + toCents(tax);
  const settled = toCents(amount) + held;
  const err = (path: string) => issuesAt(error, path);

  const changeWhAuto = (field: "vat" | "tax", v: string) => {
    const nextVat = field === "vat" ? v : vat;
    const nextTax = field === "tax" ? v : tax;
    if (field === "vat") setVat(v);
    else setTax(v);
    setAmount(fromCents(Math.max(0, due - toCents(nextVat) - toCents(nextTax))));
    setShowWh(true);
  };

  const problems: string[] = [];
  if (settled <= 0) problems.push(t("purchases.pay.needAmount"));
  if (settled > due) problems.push(t("purchases.pay.over", { amount: fmtNumber(fromCents(due)) }));
  if (toCents(vat) > vatLeft) problems.push(t("purchases.pay.vatOver", { amount: fmtNumber(fromCents(vatLeft)) }));
  if (paidOn < p.issueDate) problems.push(t("purchases.pay.beforeIssue"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || problems.length) return;
    setPending(true);
    setError(null);
    const res = await payPurchase(p.id, {
      paidOn,
      method,
      amount: Number(amount || "0").toFixed(2),
      vatWithheld: Number(vat || "0").toFixed(2),
      taxWithheld: Number(tax || "0").toFixed(2),
      reference: reference.trim() || undefined,
    });
    setPending(false);
    if (res.ok) {
      toast.success(t("purchases.toast.paid"));
      router.refresh();
      onClose();
    } else setError(res.error);
  };

  return (
    <Modal isOpen onOpenChange={(o) => !o && !pending && onClose()} size="lg" aria-label={t("purchases.pay.record")}>
      <ModalHeader title={t("purchases.pay.record")} description={t("purchases.pay.hint", { number: p.number, amount: fmtNumber(p.amountDue) })} closeLabel={t("common.close")} />
      <ModalBody>
        <form id="purchase-pay-form" onSubmit={submit} noValidate className="grid gap-4 pt-1">
          {error && <IssueList error={{ ...error, message: purchaseError(error, t) }} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField label={t("purchases.pay.date")} value={paidOn} onChange={setPaidOn} error={err("paidOn")} />
            <Select label={t("editor.paymentMethod")} selectedKey={method} onSelectionChange={(k) => k && setMethod(String(k) as typeof method)}>
              {PaymentMethod.options.map((m) => (
                <SelectItem key={m} id={m}>{t(`pm.${m}`)}</SelectItem>
              ))}
            </Select>
          </div>
          <DecimalField
            label={t("purchases.pay.amount")}
            hint={t("purchases.pay.amountHint")}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setAmountTouched(true);
            }}
            digits={[2, 2]}
            hideSteppers
            error={err("amount")}
          />
          <Input label={t("payment.reference")} value={reference} onChange={setReference} inputDir="ltr" maxLength={100} hint={t("payment.referenceHint")} />

          <WithholdingSection
            side="purchase"
            open={showWh}
            onToggle={() => setShowWh((o) => !o)}
            totalNet={p.totalNet}
            totalVat={p.totalVat}
            vatLeft={vatLeft}
            vat={vat}
            tax={tax}
            onChange={(field, v) => (amountTouched ? (field === "vat" ? setVat(v) : setTax(v)) : changeWhAuto(field, v))}
            errors={{ vat: err("vatWithheld"), tax: err("taxWithheld") }}
          />

          <div role="status" className={cx("rounded-2xl px-4 py-3 text-body-regular", problems.length ? "bg-status-rose-background text-status-rose-text" : "bg-background-secondary-default text-text-primary")}>
            {problems.length ? (
              problems.map((m) => <p key={m}>{m}</p>)
            ) : settled === due ? (
              <p className="num">{t("purchases.pay.settles", { due: fmtNumber(fromCents(due)), paid: fmtNumber(amount || "0"), held: fmtNumber(fromCents(held)) })}</p>
            ) : (
              <p className="num">{t("purchases.pay.partialLine", { settled: fmtNumber(fromCents(settled)), rest: fmtNumber(fromCents(due - settled)) })}</p>
            )}
          </div>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
        <Button type="submit" form="purchase-pay-form" disabled={pending || problems.length > 0} aria-busy={pending}>{t("purchases.pay.save")}</Button>
      </ModalFooter>
    </Modal>
  );
}
