"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import {
  activeRules,
  amountInWords,
  computeInvoice,
  daysUntil,
  defaultDueDate,
  PaymentMethod,
  type ApiError,
  type Company,
  type Invoice,
  type InvoiceInput,
  type Item,
  type Language,
  type LineInput,
  type Party,
} from "@facture/core";
import { Card, PageHeader } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { ComboBox, ComboBoxItem } from "@/components/base/combobox/combobox";
import { Divider } from "@/components/base/divider/divider";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/base/drawer/drawer";
import { HintText } from "@/components/base/input/hint-text";
import { Input } from "@/components/base/input/input";
import { AlertDialog } from "@/components/base/modal/modal";
import { Select, SelectItem } from "@/components/base/select/select";
import { Textarea } from "@/components/base/textarea/textarea";
import { toast } from "@/components/base/toast/toast";
import { CrumbLabel, TopbarActions } from "@/components/frame";
import { PartyForm, PartyFormFooter } from "@/components/party-form";
import { IssueList } from "@/components/ui/issue-list";
import { issueInvoice, saveInvoice } from "@/lib/actions";
import { fmtNumber, toDecimal } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { issuesAt, normalizePath } from "@/lib/result";
import { DateField, DecimalField } from "./fields";
import { InvoiceSheet, type SheetModel } from "./invoice-sheet";

type Line = {
  key: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  vatRate: string;
};

// Tab order of a line; Enter walks it, and adds a line after the last field.
const LINE_FIELDS = ["description", "quantity", "unit", "unitPrice", "vatRate", "discountPercent"] as const;
const LANGS: Language[] = ["fr", "ar", "fr-ar"];
const LINE_GRID = "grid-cols-2 min-[520px]:grid-cols-[84px_72px_minmax(0,1fr)_84px_72px]";

let keySeed = 0;
const newLine = (vatRate: string, init?: Partial<Line>): Line => ({
  key: keySeed++,
  description: "",
  quantity: "1",
  unit: "unité",
  unitPrice: "",
  discountPercent: "0",
  vatRate,
  ...init,
});

const fromInvoice = (inv: Invoice): Line[] =>
  inv.lines.map((l) =>
    newLine(l.vatRate, {
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
    }),
  );

const hasContent = (l: Line) => l.description.trim() || toDecimal(l.unitPrice) !== "0";

export function InvoiceEditor({
  company,
  parties: initialParties,
  items,
  invoice,
  today,
}: {
  company: Company;
  parties: Party[];
  items: Item[];
  invoice?: Invoice;
  today: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [parties, setParties] = useState(initialParties);
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [customerQuery, setCustomerQuery] = useState(() => initialParties.find((p) => p.id === invoice?.customerId)?.name ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today);
  const [deliveryDate, setDeliveryDate] = useState(invoice?.deliveryDate ?? "");
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [dueTouched, setDueTouched] = useState(!!invoice);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(invoice?.paymentMethod ?? "TRANSFER");
  const [reference, setReference] = useState(invoice?.reference ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [language, setLanguage] = useState<Language>(invoice?.language ?? company.invoiceLanguage);
  const rules = activeRules(issueDate || today);
  const [lines, setLines] = useState<Line[]>(() => (invoice ? fromInvoice(invoice) : [newLine(rules.vatRates[0] ?? "20")]));

  const [draftId, setDraftId] = useState<string | null>(invoice?.id ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newPartyOpen, setNewPartyOpen] = useState(false);
  const [partyPending, setPartyPending] = useState(false);
  const [issued, setIssued] = useState<Invoice | null>(null);
  const focusAfter = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  const customer = parties.find((p) => p.id === customerId) ?? null;
  const autoDue = defaultDueDate({
    issueDate: issueDate || today,
    deliveryDate: deliveryDate || undefined,
    termDays: customer?.paymentTermDays ?? company.defaultPaymentTermDays,
    rules,
  });
  const due = dueTouched && dueDate ? dueDate : autoDue;
  const term = daysUntil(due, issueDate || today);
  const overTerm = term > rules.maxPaymentTermDays;

  const payloadLines: LineInput[] = lines.filter(hasContent).map((l) => ({
    description: l.description.trim(),
    quantity: toDecimal(l.quantity, "0"),
    unit: l.unit.trim() || "unité",
    unitPrice: toDecimal(l.unitPrice, "0"),
    discountPercent: toDecimal(l.discountPercent, "0"),
    vatRate: l.vatRate,
  }));

  const totals = useMemo(
    () => computeInvoice(payloadLines, { paymentMethod, rules }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(payloadLines), paymentMethod, rules.id],
  );
  const words = useMemo(
    () => ({ fr: amountInWords(totals.amountDue, "fr"), ar: amountInWords(totals.amountDue, "ar") }),
    [totals.amountDue],
  );
  const lineNets = (() => {
    let n = 0;
    return lines.map((l) => (hasContent(l) ? totals.lines[n++]?.net : undefined));
  })();

  const model: SheetModel = {
    company,
    customer,
    number: issued?.number ?? invoice?.number ?? null,
    type: invoice?.type ?? "INVOICE",
    status: issued ? "issued" : "draft",
    issueDate: issueDate || today,
    deliveryDate: deliveryDate || undefined,
    dueDate: due,
    paymentMethod,
    reference: reference || undefined,
    notes: notes || undefined,
    language,
    currency: "MAD",
    totals,
    words,
  };

  const dismiss = (...paths: string[]) =>
    setError((e) => {
      if (!e?.issues) return e;
      const rest = e.issues.filter((i) => !paths.includes(normalizePath(i.path)));
      return rest.length === e.issues.length ? e : rest.length ? { ...e, issues: rest } : null;
    });
  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((all) => all.map((l, n) => (n === i ? { ...l, ...patch } : l)));
    dismiss("lines", ...Object.keys(patch).map((k) => `lines.${i}.${k}`));
  };
  const addLine = () => {
    if (lines.length >= 200) return;
    focusAfter.current = lines.length;
    setLines((all) => [...all, newLine(rules.vatRates[0] ?? "20")]);
  };
  const removeLine = (i: number) =>
    setLines((all) => (all.length === 1 ? [newLine(rules.vatRates[0] ?? "20")] : all.filter((_, n) => n !== i)));

  const focusField = (line: number, field: string) =>
    listRef.current
      ?.querySelector<HTMLElement>(`[data-line="${line}"][data-field="${field}"] input, [data-line="${line}"][data-field="${field}"] button`)
      ?.focus();

  const listRefCallback = (node: HTMLOListElement | null) => {
    listRef.current = node;
    if (node && focusAfter.current !== null) {
      const n = focusAfter.current;
      focusAfter.current = null;
      requestAnimationFrame(() => focusField(n, "description"));
    }
  };

  const onLineKey = (e: React.KeyboardEvent<HTMLLIElement>, i: number) => {
    const field = (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field;
    if (e.key !== "Enter" || !field || field === "description" || field === "vatRate" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const at = LINE_FIELDS.indexOf(field as (typeof LINE_FIELDS)[number]);
    if (at < LINE_FIELDS.length - 1) focusField(i, LINE_FIELDS[at + 1]!);
    else if (i === lines.length - 1) addLine();
    else focusField(i + 1, "description");
  };

  const buildInput = (): InvoiceInput => ({
    type: invoice?.type ?? "INVOICE",
    customerId,
    issueDate: issueDate || today,
    deliveryDate: deliveryDate || undefined,
    dueDate: due,
    currency: "MAD",
    language,
    paymentMethod,
    reference: reference.trim() || undefined,
    notes: notes.trim() || undefined,
    originalInvoiceId: invoice?.originalInvoiceId,
    lines: payloadLines,
  });

  const localIssues = () => {
    const issues: NonNullable<ApiError["issues"]> = [];
    if (!customerId) issues.push({ path: "customerId", rule: "required", message: t("editor.pickCustomer") });
    if (payloadLines.length === 0) issues.push({ path: "lines", rule: "required", message: t("editor.needLine") });
    payloadLines.forEach((l, i) => {
      if (!l.description) issues.push({ path: `lines.${i}.description`, rule: "required", message: t("editor.needDescription") });
    });
    return issues;
  };

  const persist = async () => {
    const issues = localIssues();
    if (issues.length) {
      setError({ code: "VALIDATION", message: t("error.fixFields"), issues });
      return null;
    }
    setError(null);
    const res = await saveInvoice(draftId, buildInput());
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setDraftId(res.data.id);
    return res.data;
  };

  const saveDraft = () =>
    start(async () => {
      const saved = await persist();
      if (!saved) return;
      toast.success(t("editor.draftSaved"));
      router.push(`/factures/${saved.id}`);
    });

  const issue = () =>
    start(async () => {
      const saved = await persist();
      if (!saved) return;
      const res = await issueInvoice(saved.id);
      if (!res.ok) {
        setError(res.error);
        toast.error(t("editor.cannotIssue"));
        return;
      }
      setIssued(res.data);
      toast.success(t("invoice.issuedToast"));
      setTimeout(() => router.push(`/factures/${saved.id}`), 1200);
    });

  const attemptIssue = () => {
    const issues = localIssues();
    if (issues.length) {
      setError({ code: "VALIDATION", message: t("error.fixFields"), issues });
      return;
    }
    setConfirmOpen(true);
  };

  const err = (path: string) => issuesAt(error, path);
  const locked = !!issued;
  const title = invoice ? (invoice.type === "CREDIT_NOTE" ? t("editor.editCredit") : t("editor.edit")) : t("editor.new");
  const customerError = err("customerId") ?? err("customer.ice");

  const shownParties = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q || (customer && customer.name.toLowerCase() === q)) return parties;
    return parties.filter((p) => `${p.name} ${p.ice ?? ""}`.toLowerCase().includes(q));
  }, [parties, customerQuery, customer]);

  const actionButtons = (
    <>
      <Button variant="secondary" onClick={saveDraft} disabled={pending || locked}>
        {t("editor.saveDraft")}
      </Button>
      <Button onClick={attemptIssue} disabled={pending || locked}>
        {t("invoice.issue")}
      </Button>
    </>
  );

  return (
    <div>
      {invoice && <CrumbLabel>{invoice.number ?? t("invoices.draftTitle")}</CrumbLabel>}
      <TopbarActions>
        <div className="hidden items-center gap-2 nav:flex">{actionButtons}</div>
      </TopbarActions>
      <PageHeader title={title} subtitle={invoice?.number ?? undefined} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 wide:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <form onSubmit={(e) => e.preventDefault()} className="grid min-w-0 content-start gap-3" noValidate>
          <IssueList error={error} />

          <fieldset disabled={locked} className="grid min-w-0 gap-3 border-0 p-0">
            <Card className="grid gap-4 p-5">
              <h2 className="text-headline-semibold text-text-primary">{t("editor.customerDates")}</h2>

              <div className="flex items-start gap-2">
                <ComboBox
                  className="min-w-0 flex-1"
                  label={t("editor.customer")}
                  aria-label={t("editor.customer")}
                  placeholder={t("editor.customerPlaceholder")}
                  emptyMessage={t("editor.noCustomer")}
                  items={shownParties}
                  selectedKey={customerId || null}
                  onSelectionChange={(key) => {
                    setCustomerId(key ? String(key) : "");
                    if (key) dismiss("customerId", "customer.ice");
                  }}
                  inputValue={customerQuery}
                  onInputChange={(v) => {
                    setCustomerQuery(v);
                    if (!v) setCustomerId("");
                  }}
                  menuTrigger="focus"
                  isInvalid={!!customerError}
                  hint={customerError}
                >
                  {(p) => (
                    <ComboBoxItem id={p.id} textValue={p.name}>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.ice && <span className="ident shrink-0 text-caption-1-regular text-text-tertiary">{p.ice.slice(0, 9)}…</span>}
                    </ComboBoxItem>
                  )}
                </ComboBox>
                <Button variant="secondary" leadingIcon={RiAddLine} onClick={() => setNewPartyOpen(true)} className="mt-6 shrink-0">
                  <span className="max-[480px]:sr-only">{t("editor.newCustomer")}</span>
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label={t("editor.issueDate")} value={issueDate} onChange={setIssueDate} error={err("issueDate")} />
                <DateField label={t("editor.deliveryDate")} value={deliveryDate} onChange={setDeliveryDate} error={err("deliveryDate")} />
                <div className="sm:col-span-2">
                  <DateField
                    label={t("editor.dueDate")}
                    value={due}
                    onChange={(v) => {
                      setDueDate(v);
                      setDueTouched(true);
                    }}
                    error={err("dueDate")}
                  />
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption-1-medium">
                    <span className={overTerm ? "text-text-error-primary" : "text-text-secondary"}>
                      {overTerm ? t("editor.termOver", { n: term, max: rules.maxPaymentTermDays }) : t("editor.term", { n: Math.max(term, 0) })}
                    </span>
                    {dueTouched && (
                      <button type="button" onClick={() => setDueTouched(false)} className="cursor-pointer text-accent-600 underline underline-offset-2 max-nav:inline-flex max-nav:min-h-11 max-nav:items-center">
                        {t("editor.resetDue")}
                      </button>
                    )}
                  </p>
                </div>
                <Select
                  label={t("editor.paymentMethod")}
                  aria-label={t("editor.paymentMethod")}
                  selectedKey={paymentMethod}
                  onSelectionChange={(k) => k && setPaymentMethod(String(k) as PaymentMethod)}
                  isInvalid={!!err("paymentMethod")}
                >
                  {PaymentMethod.options.map((m) => (
                    <SelectItem key={m} id={m}>
                      {t(`pm.${m}`)}
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  label={t("editor.reference")}
                  aria-label={t("editor.reference")}
                  maxLength={100}
                  value={reference}
                  onChange={setReference}
                  inputDir="ltr"
                  hint={t("editor.referenceHint")}
                />
                {paymentMethod === "CASH" && (
                  <div className="sm:col-span-2">
                    <HintText>{t("editor.stampHint", { rate: Number(rules.stampDutyRate) * 100 })}</HintText>
                  </div>
                )}
              </div>
            </Card>

            <Card className="grid gap-3 p-5">
              <h2 className="text-headline-semibold text-text-primary">{t("editor.lines")}</h2>
              {err("lines") && <HintText isInvalid>{err("lines")}</HintText>}
              <div className={`hidden gap-2 px-3 text-caption-1-medium text-text-secondary min-[520px]:grid ${LINE_GRID}`}>
                <span>{t("editor.qty")}</span>
                <span>{t("editor.unit")}</span>
                <span>{t("editor.unitPrice")}</span>
                <span>{t("editor.vat")}</span>
                <span>{t("editor.discount")}</span>
              </div>
              <ol ref={listRefCallback} className="grid gap-2">
                {lines.map((l, i) => {
                  const flag = (f: string) => err(`lines.${i}.${f}`);
                  const q = l.description.trim().toLowerCase();
                  const shown = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
                  return (
                    <li
                      key={l.key}
                      onKeyDownCapture={(e) => onLineKey(e, i)}
                      className="rounded-2xl border border-border-button-default bg-background-primary-default p-3 shadow-xs"
                    >
                      <div data-line={i} data-field="description">
                        <ComboBox
                          aria-label={t("editor.lineN", { n: i + 1 })}
                          placeholder={t("editor.descriptionPlaceholder")}
                          emptyMessage={t("editor.noMatch")}
                          items={shown}
                          selectedKey={null}
                          allowsCustomValue
                          inputValue={l.description}
                          onInputChange={(v) => setLine(i, { description: v.slice(0, 500) })}
                          onSelectionChange={(key) => {
                            const it = items.find((x) => x.id === key);
                            if (!it) return;
                            setLine(i, {
                              description: it.name,
                              unit: it.unit,
                              vatRate: it.vatRate,
                              ...(l.unitPrice ? {} : { unitPrice: it.unitPrice }),
                            });
                          }}
                          isInvalid={!!flag("description")}
                          hint={flag("description")}
                        >
                          {(it) => (
                            <ComboBoxItem id={it.id} textValue={it.name}>
                              <span className="min-w-0 flex-1 truncate">{it.name}</span>
                              <span className="num shrink-0 text-caption-1-regular text-text-tertiary">{fmtNumber(it.unitPrice)}</span>
                            </ComboBoxItem>
                          )}
                        </ComboBox>
                      </div>

                      <div className={`mt-2.5 grid items-start gap-2 ${LINE_GRID}`}>
                        <LineField label={t("editor.qty")} line={i} field="quantity">
                          <DecimalField aria-label={`${t("editor.qty")} ${i + 1}`} size="small" hideSteppers value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} error={flag("quantity")} />
                        </LineField>
                        <LineField label={t("editor.unit")} line={i} field="unit">
                          <Input aria-label={`${t("editor.unit")} ${i + 1}`} maxLength={20} size="small" value={l.unit} onChange={(v) => setLine(i, { unit: v })} isInvalid={!!flag("unit")} errorMessage={flag("unit")} />
                        </LineField>
                        <LineField label={t("editor.unitPrice")} line={i} field="unitPrice" className="col-span-2 min-[520px]:col-span-1">
                          <DecimalField aria-label={`${t("editor.unitPrice")} ${i + 1}`} size="small" hideSteppers digits={[2, 2]} placeholder="0,00" value={l.unitPrice} onChange={(v) => setLine(i, { unitPrice: v })} error={flag("unitPrice")} />
                        </LineField>
                        <LineField label={t("editor.vat")} line={i} field="vatRate">
                          <Select
                            aria-label={`${t("editor.vat")} ${i + 1}`}
                            size="sm"
                            selectedKey={String(Number(l.vatRate))}
                            onSelectionChange={(k) => k && setLine(i, { vatRate: String(k) })}
                            isInvalid={!!flag("vatRate")}
                          >
                            {[...new Set([...rules.vatRates, String(Number(l.vatRate))])].map((r) => (
                              <SelectItem key={r} id={r}>
                                <span className="num">{r} %</span>
                              </SelectItem>
                            ))}
                          </Select>
                        </LineField>
                        <LineField label={t("editor.discount")} line={i} field="discountPercent">
                          <DecimalField aria-label={`${t("editor.discount")} ${i + 1}`} size="small" hideSteppers maxValue={100} digits={[0, 2]} value={l.discountPercent} onChange={(v) => setLine(i, { discountPercent: v })} error={flag("discountPercent")} />
                        </LineField>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        <IconButton icon={RiDeleteBinLine} size="small" aria-label={`${t("editor.removeLine")} ${i + 1}`} onClick={() => removeLine(i)} />
                        <div className="text-body-regular text-text-secondary">
                          {t("editor.lineTotal")} <span className="num text-body-medium text-text-primary">{fmtNumber(lineNets[i] ?? "0")}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="secondary" leadingIcon={RiAddLine} onClick={addLine} disabled={lines.length >= 200}>
                  {t("editor.addLine")}
                </Button>
                <p className="text-caption-1-regular text-text-tertiary">{t("editor.keyboardHint")}</p>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-headline-semibold text-text-primary">{t("editor.summary")}</h2>
              <dl className="grid gap-2 text-body-regular">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">{t("sheet.totalNet")}</dt>
                  <dd><Money value={totals.totalNet} locale={locale} bare /></dd>
                </div>
                {totals.breakdown.map((b) => (
                  <div key={b.rate} className="flex justify-between">
                    <dt className="text-text-secondary">{t("sheet.vat")} <span className="num">{Number(b.rate)} %</span></dt>
                    <dd><Money value={b.vat} locale={locale} bare /></dd>
                  </div>
                ))}
                <div className="flex justify-between text-body-medium text-text-primary">
                  <dt>{t("sheet.totalGross")}</dt>
                  <dd><Money value={totals.totalGross} locale={locale} bare /></dd>
                </div>
                {Number(totals.stampDuty) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">{t("sheet.stampDuty")}</dt>
                    <dd><Money value={totals.stampDuty} locale={locale} bare /></dd>
                  </div>
                )}
              </dl>
              <Divider className="my-3" />
              <div className="flex items-baseline justify-between">
                <span className="text-body-medium text-text-primary">{t("sheet.amountDue")}</span>
                <Money value={totals.amountDue} locale={locale} className="text-title-2-semibold text-text-primary" />
              </div>
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="text-headline-semibold text-text-primary">{t("editor.more")}</h2>
              <Textarea label={t("editor.notes")} aria-label={t("editor.notes")} maxLength={2000} hint={t("editor.notesHint")} value={notes} onChange={setNotes} rows={3} />
              <Select label={t("editor.language")} aria-label={t("editor.language")} selectedKey={language} onSelectionChange={(k) => k && setLanguage(String(k) as Language)}>
                {LANGS.map((l) => (
                  <SelectItem key={l} id={l}>
                    {t(`lang.${l}`)}
                  </SelectItem>
                ))}
              </Select>
              <HintText>{t("editor.languageHint")}</HintText>
            </Card>
          </fieldset>
        </form>

        <div className="min-w-0 wide:sticky wide:top-6 wide:self-start">
          <InvoiceSheet model={model} />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-button-default bg-background-primary-default px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] nav:hidden">
        <div className="mx-auto flex max-w-[640px] items-center gap-2 [&>*]:flex-1">{actionButtons}</div>
      </div>

      <AlertDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="default"
        icon={false}
        title={t("invoice.issueConfirmTitle")}
        description={t("invoice.issueConfirmBody")}
        confirmLabel={t("invoice.issue")}
        cancelLabel={t("common.cancel")}
        onConfirm={issue}
      />

      <Drawer isOpen={newPartyOpen} onOpenChange={setNewPartyOpen} placement="end" size="md" aria-label={t("customers.new")}>
        {({ close }) => (
          <>
            <DrawerHeader title={t("customers.new")} closeLabel={t("common.close")} />
            <DrawerBody>
              <PartyForm
                formId="new-party"
                onPending={setPartyPending}
                onSaved={(p) => {
                  setParties((all) => [p, ...all]);
                  setCustomerId(p.id);
                  setCustomerQuery(p.name);
                  dismiss("customerId", "customer.ice");
                  close();
                }}
              />
            </DrawerBody>
            <DrawerFooter>
              <PartyFormFooter formId="new-party" pending={partyPending} onCancel={close} />
            </DrawerFooter>
          </>
        )}
      </Drawer>
    </div>
  );
}

function LineField({ label, line, field, className, children }: { label: string; line: number; field: string; className?: string; children: React.ReactNode }) {
  return (
    <div data-line={line} data-field={field} className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="truncate text-caption-1-medium text-text-secondary min-[520px]:sr-only">{label}</span>
      {children}
    </div>
  );
}

