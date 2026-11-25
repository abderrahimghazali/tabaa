"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiAddLine, RiCloseCircleLine, RiDeleteBinLine, RiDownload2Line, RiEditLine, RiFilePdf2Line, RiPrinterLine } from "@remixicon/react";
import { PaymentMethod, type ApiError, type Invoice } from "@facture/core";
import { Card, PageHeader } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Divider } from "@/components/base/divider/divider";
import { Input } from "@/components/base/input/input";
import { AlertDialog, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { ProgressBar } from "@/components/base/progress/progress";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { CrumbLabel, TopbarActions } from "@/components/frame";
import { IssueList } from "@/components/ui/issue-list";
import { addPayment, createCreditNote, deleteInvoice, issueInvoice, removePayment } from "@/lib/actions";
import { fmtDate, fmtNumber, sub } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCanAdmin, useCanWrite } from "@/lib/me-client";
import { issuesAt } from "@/lib/result";
import { statusOf } from "@/lib/status";
import { cx } from "@/utils/cx";
import { DateField, DecimalField } from "./fields";
import { openPdf, PrintPortal } from "./pdf-download";
import { InvoiceSheet, type SheetModel } from "./invoice-sheet";
import { StatusChip, dueInfo } from "./status";

type Confirm = "issue" | "delete" | "credit" | { payment: string } | null;

type Event = { key: string; tone: "neutral" | "accent" | "ok" | "warn"; title: string; meta: string; href?: string };

const DOT = { neutral: "bg-foreground-icon-tertiary", accent: "bg-accent-500", ok: "bg-green-500", warn: "bg-orange-500" } as const;

export function InvoiceDetail({
  invoice,
  today,
  openPayment,
}: {
  invoice: Invoice;
  today: string;
  openPayment?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [payOpen, setPayOpen] = useState(!!openPayment);
  const [error, setError] = useState<ApiError | null>(null);

  const status = statusOf(invoice);
  const isDraft = invoice.state === "DRAFT";
  const isCredit = invoice.type === "CREDIT_NOTE";
  const remaining = sub(invoice.totals.amountDue, invoice.paidAmount);
  const canWrite = useCanWrite();
  const canAdmin = useCanAdmin();
  const open = !isDraft && !isCredit && Number(remaining) > 0;
  const canPay = open && canWrite;
  const paidPct = Math.min(100, (Number(invoice.paidAmount) / Math.max(1, Number(invoice.totals.amountDue))) * 100);
  const due = dueInfo(invoice.dueDate, today, t, locale);

  const model: SheetModel = {
    // The seller block, footer, RIB and cachet come from the company frozen at issuance, never the live company.
    company: invoice.seller,
    customer: invoice.customer,
    number: invoice.number,
    type: invoice.type,
    status,
    issueDate: invoice.issueDate,
    deliveryDate: invoice.deliveryDate,
    dueDate: invoice.dueDate,
    paymentMethod: invoice.paymentMethod,
    reference: invoice.reference,
    notes: invoice.notes,
    language: invoice.language,
    currency: invoice.currency,
    totals: invoice.totals,
    words: invoice.amountInWords,
  };

  const events: Event[] = [
    { key: "created", tone: "neutral", title: t(isCredit ? "activity.createdCredit" : "activity.created"), meta: fmtDate(invoice.issueDate) },
    ...(invoice.originalInvoiceId
      ? [{ key: "orig", tone: "warn" as const, title: t("activity.fromInvoice"), meta: t("detail.viewOriginal"), href: `/factures/${invoice.originalInvoiceId}` }]
      : []),
    ...(invoice.number
      ? [{ key: "issued", tone: "accent" as const, title: t("activity.issued", { number: invoice.number }), meta: fmtDate((invoice.issuedAt ?? invoice.issueDate).slice(0, 10)) }]
      : []),
    ...invoice.payments.map((p) => ({
      key: p.id,
      tone: "ok" as const,
      title: t("activity.payment", { method: t(`pm.${p.method}`) }),
      meta: `${fmtDate(p.paidOn)} · ${fmtNumber(p.amount)}`,
    })),
  ];

  async function run<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: ApiError }>,
    onOk: (data: T) => void,
    failToast?: string,
  ) {
    setError(null);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) start(() => onOk(res.data));
    else {
      setError(res.error);
      toast.error(failToast ?? res.error.message);
    }
  }

  const confirmAction = (c: Exclude<Confirm, null>) => {
    if (c === "issue") return run(() => issueInvoice(invoice.id), () => toast.success(t("invoice.issuedToast")), t("editor.cannotIssue"));
    if (c === "delete")
      return run(
        () => deleteInvoice(invoice.id),
        () => {
          toast.success(t("invoice.deletedToast"));
          router.push("/factures");
        },
      );
    if (c === "credit")
      return run(
        () => createCreditNote(invoice.id),
        (cn) => {
          toast.success(t("invoice.creditCreatedToast"));
          router.push(`/factures/${cn.id}/modifier`);
        },
      );
    return run(() => removePayment(c.payment), () => toast.success(t("payment.voidedToast")));
  };

  const confirmText = {
    issue: { title: t("invoice.issueConfirmTitle"), body: t("invoice.issueConfirmBody"), label: t("invoice.issue"), danger: false },
    delete: { title: t("invoice.deleteConfirmTitle"), body: t("invoice.deleteConfirmBody"), label: t("invoice.delete"), danger: true },
    credit: { title: t("invoice.creditConfirmTitle"), body: t("invoice.creditConfirmBody"), label: t("invoice.credit"), danger: false },
    payment: { title: t("payment.voidConfirmTitle"), body: t("payment.voidConfirmBody"), label: t("payment.void"), danger: true },
  };
  const ct = confirm ? confirmText[typeof confirm === "string" ? confirm : "payment"] : null;

  return (
    <div>
      <CrumbLabel>{invoice.number ?? t("invoices.draftTitle")}</CrumbLabel>
      <TopbarActions>
        {isDraft ? (
          <>
            <Button variant="secondary" leadingIcon={RiFilePdf2Line} onClick={() => openPdf(invoice.id)} className="max-[560px]:hidden">
              {t("invoice.pdf")}
            </Button>
            <Button variant="secondary" iconOnly leadingIcon={RiFilePdf2Line} onClick={() => openPdf(invoice.id)} aria-label={t("invoice.pdf")} className="min-[561px]:hidden" />
            {canWrite && (
              <>
            <ButtonLink variant="secondary" href={`/factures/${invoice.id}/modifier`} leadingIcon={RiEditLine} className="max-[560px]:hidden">
              {t("common.edit")}
            </ButtonLink>
            <ButtonLink variant="secondary" iconOnly href={`/factures/${invoice.id}/modifier`} leadingIcon={RiEditLine} aria-label={t("common.edit")} className="min-[561px]:hidden" />
            <Button onClick={() => setConfirm("issue")} disabled={busy}>
              {t("invoice.issue")}
            </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" leadingIcon={RiFilePdf2Line} onClick={() => openPdf(invoice.id)} className="max-[560px]:hidden">
              {t("invoice.pdf")}
            </Button>
            <Button variant="secondary" iconOnly leadingIcon={RiFilePdf2Line} onClick={() => openPdf(invoice.id)} aria-label={t("invoice.pdf")} className="min-[561px]:hidden" />
            <ButtonLink variant="secondary" href={`/factures/${invoice.id}/ubl`} download leadingIcon={RiDownload2Line} className="max-[560px]:hidden">
              {t("invoice.ubl")}
            </ButtonLink>
            <ButtonLink variant="secondary" iconOnly href={`/factures/${invoice.id}/ubl`} download leadingIcon={RiDownload2Line} aria-label={t("invoice.ubl")} className="min-[561px]:hidden" />
            <Button variant="secondary" leadingIcon={RiPrinterLine} onClick={() => window.print()} className="max-[560px]:hidden">
              {t("invoice.print")}
            </Button>
            <Button variant="secondary" iconOnly leadingIcon={RiPrinterLine} onClick={() => window.print()} aria-label={t("invoice.print")} className="min-[561px]:hidden" />
            {canPay && (
              <Button leadingIcon={RiAddLine} onClick={() => setPayOpen(true)} aria-label={t("payment.record")}>
                <span className="max-[560px]:sr-only">{t("payment.record")}</span>
              </Button>
            )}
          </>
        )}
      </TopbarActions>

      <PageHeader
        title={invoice.number ? <span className="ident">{invoice.number}</span> : t("invoices.draftTitle")}
        badge={<StatusChip inv={invoice} t={t} />}
        subtitle={
          <Link href={`/clients/${invoice.customerId}`} className="rounded text-text-secondary hover:text-text-primary hover:underline">
            {invoice.customer.name}
          </Link>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 wide:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-2 self-start rounded-3xl bg-background-secondary-default p-2">
          <IssueList error={error} />

          <Card className="p-5">
            <div className="text-body-regular text-text-secondary">{isCredit ? t("detail.creditAmount") : t("detail.gross")}</div>
            <Money value={invoice.totals.amountDue} locale={locale} currency={invoice.currency} className="mt-1 text-title-1-semibold text-text-primary" />
            {Number(invoice.totals.stampDuty) > 0 && (
              <div className="mt-1 text-caption-1-regular text-text-secondary">
                {t("detail.withStamp")} <Money value={invoice.totals.stampDuty} locale={locale} bare className="text-text-primary" />
              </div>
            )}
            {!isDraft && !isCredit && (
              <>
                <ProgressBar className="mt-5" aria-label={t("detail.progress")} value={paidPct} minValue={0} maxValue={100} formatOptions={{ style: "percent", maximumFractionDigits: 0 }} />
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-body-regular text-text-secondary">
                      <span className="size-2 rounded-full bg-accent-500" />
                      {t("detail.collected")}
                    </div>
                    <Money value={invoice.paidAmount} locale={locale} className="text-headline-semibold text-text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-body-regular text-text-secondary">
                      <span className="size-2 rounded-full bg-border-button-default" />
                      {t("col.remaining")}
                    </div>
                    <Money value={remaining} locale={locale} className={cx("text-headline-semibold", invoice.overdue ? "text-text-error-primary" : "text-text-primary")} />
                  </div>
                </div>
              </>
            )}
            <Divider className="my-4" />
            <dl className="grid gap-2.5 text-body-regular">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-text-secondary">{t("editor.issueDate")}</dt>
                <dd className="num text-text-primary">{fmtDate(invoice.issueDate)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-text-secondary">{t("editor.dueDate")}</dt>
                <dd className="flex items-center gap-2">
                  {open && <Chip variant="caption" color={due.color}>{due.text}</Chip>}
                  <span className="num text-text-primary">{fmtDate(invoice.dueDate)}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-text-secondary">{t("editor.paymentMethod")}</dt>
                <dd className="text-text-primary">{t(`pm.${invoice.paymentMethod}`)}</dd>
              </div>
            </dl>
          </Card>

          {!isDraft && !isCredit && (
            <Card>
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
                <h2 className="text-headline-semibold text-text-primary">{t("payment.title")}</h2>
                {canPay && (
                  <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={() => setPayOpen(true)}>
                    {t("payment.add")}
                  </Button>
                )}
              </div>
              {invoice.payments.length === 0 ? (
                <p className="px-5 pt-1 pb-5 text-body-regular text-text-secondary">{t("payment.none")}</p>
              ) : (
                <ul className="px-2 pb-2">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-background-primary-hover">
                      <div className="min-w-0">
                        <Money value={p.amount} locale={locale} className="text-body-medium text-text-primary" />
                        <div className="truncate text-caption-1-regular text-text-secondary">
                          <span className="num">{fmtDate(p.paidOn)}</span> · {t(`pm.${p.method}`)}
                          {p.reference && <> · <span className="ident">{p.reference}</span></>}
                        </div>
                      </div>
                      {canAdmin && <IconButton icon={RiCloseCircleLine} size="small" aria-label={t("payment.void")} onClick={() => setConfirm({ payment: p.id })} disabled={busy} />}
                    </li>
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
                    <div className="text-body-medium text-text-primary">{e.title}</div>
                    {e.href ? (
                      <Link href={e.href} className="text-body-regular text-accent-600 hover:underline">{e.meta}</Link>
                    ) : (
                      <div className="num text-caption-1-regular text-text-secondary">{e.meta}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {((isDraft && canAdmin) || (canWrite && !isDraft && !isCredit)) && (
            <Card className="p-3">
              {isDraft ? (
                <Button variant="danger" className="w-full" leadingIcon={RiDeleteBinLine} onClick={() => setConfirm("delete")} disabled={busy}>
                  {t("invoice.delete")}
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => setConfirm("credit")} disabled={busy}>
                  {t("invoice.credit")}
                </Button>
              )}
            </Card>
          )}
        </div>

        <div className="min-w-0 wide:sticky wide:top-6 wide:self-start">
          <InvoiceSheet model={model} />
        </div>
      </div>
      <PrintPortal model={{ ...model, status: isDraft ? "draft" : isCredit ? "credit" : "issued" }} />

      {ct && confirm && (
        <AlertDialog
          isOpen
          onOpenChange={(o) => !o && setConfirm(null)}
          variant={ct.danger ? "danger" : "default"}
          icon={ct.danger ? undefined : false}
          title={ct.title}
          description={ct.body}
          confirmLabel={ct.label}
          cancelLabel={t("common.cancel")}
          onConfirm={() => confirmAction(confirm)}
        />
      )}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        invoice={invoice}
        remaining={remaining}
        today={today}
        onDone={() => toast.success(t("payment.recordedToast"))}
      />
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  invoice,
  remaining,
  today,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  remaining: string;
  today: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange} size="md" aria-label={t("payment.record")}>
      {({ close }) => (
        <>
          <ModalHeader title={t("payment.record")} description={t("payment.recordHint")} closeLabel={t("common.close")} />
          <ModalBody>
            <PaymentForm
              invoice={invoice}
              remaining={remaining}
              today={today}
              onPending={setPending}
              onSaved={() => {
                close();
                onDone();
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="payment-form" disabled={pending}>
              {t("payment.save")}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

function PaymentForm({
  invoice,
  remaining,
  today,
  onPending,
  onSaved,
}: {
  invoice: Invoice;
  remaining: string;
  today: string;
  onPending: (p: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<ApiError | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>(invoice.paymentMethod);
  const [amount, setAmount] = useState(remaining);
  const [reference, setReference] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onPending(true);
    const res = await addPayment(invoice.id, { paidOn, method, amount: amount || "0", reference: reference.trim() || undefined });
    onPending(false);
    if (res.ok) onSaved();
    else setError(res.error);
  };

  return (
    <form id="payment-form" onSubmit={submit} className="grid gap-4" noValidate>
      <IssueList error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField label={t("payment.date")} value={paidOn} onChange={setPaidOn} error={issuesAt(error, "paidOn")} />
        <DecimalField label={t("payment.amount")} value={amount} onChange={setAmount} digits={[2, 2]} error={issuesAt(error, "amount")} hideSteppers />
      </div>
      <Select label={t("editor.paymentMethod")} aria-label={t("editor.paymentMethod")} selectedKey={method} onSelectionChange={(k) => k && setMethod(String(k) as PaymentMethod)}>
        {PaymentMethod.options.map((m) => (
          <SelectItem key={m} id={m}>
            {t(`pm.${m}`)}
          </SelectItem>
        ))}
      </Select>
      <Input label={t("payment.reference")} aria-label={t("payment.reference")} hint={t("payment.referenceHint")} value={reference} onChange={setReference} inputDir="ltr" />
    </form>
  );
}
