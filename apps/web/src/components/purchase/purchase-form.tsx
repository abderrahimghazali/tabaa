"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { activeRules, addDays, daysUntil, type ApiError, type Party, type Purchase, type PurchaseCategory, type PurchaseInput } from "@facture/core";
import { Card, PageHeader } from "@/components/app/layout";
import { Money } from "@/components/app/money";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { ComboBox, ComboBoxItem } from "@/components/base/combobox/combobox";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/base/drawer/drawer";
import { HintText } from "@/components/base/input/hint-text";
import { Input } from "@/components/base/input/input";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { Select, SelectItem } from "@/components/base/select/select";
import { Switch } from "@/components/base/switch/switch";
import { Textarea } from "@/components/base/textarea/textarea";
import { toast } from "@/components/base/toast/toast";
import { CrumbLabel, TopbarActions } from "@/components/frame";
import { DateField, DecimalField } from "@/components/invoice/fields";
import { PartyForm, PartyFormFooter } from "@/components/party-form";
import { IssueList } from "@/components/ui/issue-list";
import { findPurchaseByNumber, savePurchase } from "@/lib/actions";
import { fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { fromCents, PURCHASE_CATEGORIES, purchaseError, toCents, vatOf } from "@/lib/purchase";
import { issuesAt } from "@/lib/result";

type Row = { key: number; rate: string; net: string; vat: string; vatTouched: boolean };

let rowKey = 0;
const newRow = (rate: string): Row => ({ key: ++rowKey, rate, net: "", vat: "", vatTouched: false });
const TOLERANCE = 100;

export function PurchaseForm({ purchase, suppliers: initialSuppliers, today, defaultSupplierId }: { purchase?: Purchase; suppliers: Party[]; today: string; defaultSupplierId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const rulesFor = (d: string) => activeRules(d || today);

  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(purchase?.supplierId ?? defaultSupplierId ?? "");
  const [supplierQuery, setSupplierQuery] = useState(() => initialSuppliers.find((p) => p.id === (purchase?.supplierId ?? defaultSupplierId))?.name ?? "");
  const [number, setNumber] = useState(purchase?.number ?? "");
  const [issueDate, setIssueDate] = useState(purchase?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(purchase?.dueDate ?? "");
  const [dueTouched, setDueTouched] = useState(!!purchase);
  const [category, setCategory] = useState<PurchaseCategory>(purchase?.category ?? "SERVICES");
  const [description, setDescription] = useState(purchase?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    purchase
      ? purchase.vatLines.map((l) => ({ key: ++rowKey, rate: l.vatRate, net: l.net, vat: l.vat, vatTouched: toCents(l.vat) !== toCents(vatOf(l.net, l.vatRate)) }))
      : [newRow(activeRules(today).vatRates[0] ?? "20")],
  );
  const [deductible, setDeductible] = useState(purchase?.vatDeductible ?? true);
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [error, setError] = useState<ApiError | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; number: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [partyPending, setPartyPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const rules = rulesFor(issueDate);
  const supplier = suppliers.find((p) => p.id === supplierId) ?? null;
  const termDays = supplier?.paymentTermDays ?? rules.defaultPaymentTermDays;
  const autoDue = addDays(issueDate || today, Math.min(termDays, rules.maxPaymentTermDays));
  const due = dueTouched && dueDate ? dueDate : autoDue;
  const term = daysUntil(due, issueDate || today);
  const overTerm = term > rules.maxPaymentTermDays;
  const err = (path: string) => issuesAt(error, path);

  const totals = rows.reduce(
    (a, r) => ({ net: a.net + toCents(r.net), vat: a.vat + toCents(r.vat) }),
    { net: 0, vat: 0 },
  );
  const dismiss = () => setError(null);

  const setRow = (i: number, patch: Partial<Row>) => {
    dismiss();
    setRows((all) =>
      all.map((r, n) => {
        if (n !== i) return r;
        const next = { ...r, ...patch };
        if (!next.vatTouched && ("net" in patch || "rate" in patch)) next.vat = next.net === "" ? "" : vatOf(next.net, next.rate);
        return next;
      }),
    );
  };
  const addRow = () => {
    if (rows.length >= 5) return;
    const used = new Set(rows.map((r) => r.rate));
    setRows((all) => [...all, newRow(rules.vatRates.find((v) => !used.has(v)) ?? rules.vatRates[0] ?? "20")]);
  };
  const removeRow = (i: number) => setRows((all) => (all.length === 1 ? [newRow(rules.vatRates[0] ?? "20")] : all.filter((_, n) => n !== i)));

  const deviation = (r: Row) => Math.abs(toCents(r.vat) - toCents(vatOf(r.net, r.rate)));
  const filled = rows.filter((r) => r.net !== "" || r.vat !== "");

  const localIssues = () => {
    const issues: NonNullable<ApiError["issues"]> = [];
    if (!supplierId) issues.push({ path: "supplierId", rule: "required", message: t("purchases.form.pickSupplier") });
    if (!number.trim()) issues.push({ path: "number", rule: "required", message: t("purchases.form.needNumber") });
    if (!description.trim()) issues.push({ path: "description", rule: "required", message: t("purchases.form.needDescription") });
    if (filled.length === 0 || totals.net + totals.vat <= 0) issues.push({ path: "vatLines", rule: "required", message: t("purchases.form.needAmount") });
    if (due < (issueDate || today)) issues.push({ path: "dueDate", rule: "order", message: t("purchases.form.dueBefore") });
    rows.forEach((r, i) => {
      if (deviation(r) > TOLERANCE) issues.push({ path: `vatLines.${i}.vat`, rule: "tolerance", message: t("purchases.form.vatGap", { rate: r.rate, calc: fmtNumber(vatOf(r.net, r.rate)) }) });
    });
    return issues;
  };

  const input = (): PurchaseInput => ({
    supplierId,
    number: number.trim(),
    issueDate: issueDate || today,
    dueDate: due,
    category,
    description: description.trim(),
    vatLines: filled.map((r) => ({ vatRate: r.rate, net: Number(r.net || "0").toFixed(2), vat: Number(r.vat || "0").toFixed(2) })),
    vatDeductible: deductible,
    notes: notes.trim() || undefined,
  });

  const save = (mode: "detail" | "next") =>
    start(async () => {
      const issues = localIssues();
      if (issues.length) {
        setError({ code: "VALIDATION", message: t("error.fixFields"), issues });
        return;
      }
      setError(null);
      setDuplicate(null);
      const res = await savePurchase(purchase?.id ?? null, input());
      if (!res.ok) {
        setError(res.error);
        if (res.error.code === "DUPLICATE") setDuplicate(await findPurchaseByNumber(supplierId, number));
        return;
      }
      toast.success(t(purchase ? "purchases.form.updated" : "purchases.form.created"));
      router.refresh();
      if (mode === "detail") {
        router.push(`/achats/${res.data.id}`);
        return;
      }
      setNumber("");
      setDescription("");
      setNotes("");
      setRows([newRow(rules.vatRates[0] ?? "20")]);
      setDueTouched(false);
      requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('[data-field="number"] input')?.focus());
    });

  const duplicateError = error?.code === "DUPLICATE" ? t("purchases.err.DUPLICATE", { number: number.trim() }) : undefined;
  const topError: ApiError | null = error && error.code !== "VALIDATION" && error.code !== "DUPLICATE" ? { ...error, message: purchaseError(error, t) } : error?.code === "VALIDATION" ? error : null;

  const shownSuppliers = (() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q || (supplier && supplier.name.toLowerCase() === q)) return suppliers;
    return suppliers.filter((p) => `${p.name} ${p.ice ?? ""}`.toLowerCase().includes(q));
  })();

  const actions = (
    <>
      {!purchase && (
        <Button variant="secondary" onClick={() => save("next")} disabled={pending}>{t("purchases.form.saveNext")}</Button>
      )}
      <Button onClick={() => save("detail")} disabled={pending} aria-busy={pending}>{t("common.save")}</Button>
    </>
  );

  return (
    <div>
      {purchase && <CrumbLabel>{purchase.number}</CrumbLabel>}
      <TopbarActions>{actions}</TopbarActions>
      <PageHeader title={t(purchase ? "purchases.form.edit" : "purchases.form.new")} subtitle={purchase ? purchase.supplier.name : undefined} />

      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          save("detail");
        }}
        noValidate
        className="mx-auto grid max-w-3xl min-w-0 content-start gap-3"
      >
        {purchase?.state === "REJECTED" && (
          <p role="status" className="rounded-2xl bg-status-orange-background px-4 py-3 text-body-regular text-status-orange-text">
            {t("purchases.form.rejectedNote", { reason: purchase.rejectionReason ?? "" })}
          </p>
        )}
        {topError && <IssueList error={topError} />}

        <Card className="grid gap-4 p-5">
          <h2 className="text-headline-semibold text-text-primary">{t("purchases.form.invoice")}</h2>
          <div className="flex items-start gap-2">
            <ComboBox
              className="min-w-0 flex-1"
              label={t("purchases.form.supplier")}
              aria-label={t("purchases.form.supplier")}
              placeholder={t("purchases.form.supplierPlaceholder")}
              emptyMessage={t("purchases.form.noSupplier")}
              items={shownSuppliers}
              selectedKey={supplierId || null}
              onSelectionChange={(key) => {
                setSupplierId(key ? String(key) : "");
                if (key) setSupplierQuery(suppliers.find((s) => s.id === key)?.name ?? "");
                dismiss();
              }}
              inputValue={supplierQuery}
              onInputChange={(v) => {
                setSupplierQuery(v);
                if (!v) setSupplierId("");
              }}
              menuTrigger="focus"
              autoFocus={!purchase}
              isInvalid={!!err("supplierId")}
              hint={err("supplierId")}
            >
              {(p) => (
                <ComboBoxItem id={p.id} textValue={p.name}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.ice && <span className="ident shrink-0 text-caption-1-regular text-text-tertiary">{p.ice.slice(0, 9)}…</span>}
                </ComboBoxItem>
              )}
            </ComboBox>
            <Button variant="secondary" leadingIcon={RiAddLine} onClick={() => setNewOpen(true)} className="mt-6 shrink-0">
              <span className="max-[480px]:sr-only">{t("purchases.form.newSupplier")}</span>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="number" className="grid content-start gap-1">
              <Input
                label={t("purchases.form.number")}
                value={number}
                onChange={(v) => {
                  setNumber(v);
                  if (error?.code === "DUPLICATE") setError(null);
                }}
                maxLength={60}
                inputDir="ltr"
                isRequired
                isInvalid={!!(err("number") ?? duplicateError)}
                errorMessage={err("number") ?? duplicateError}
                hint={t("purchases.form.numberHint")}
              />
              {duplicate && error?.code === "DUPLICATE" && (
                <Link href={`/achats/${duplicate.id}`} className="text-caption-1-medium text-accent-600 underline underline-offset-2">
                  {t("purchases.form.viewExisting")}
                </Link>
              )}
            </div>
            <DateField label={t("purchases.form.issueDate")} value={issueDate} onChange={(v) => { setIssueDate(v); dismiss(); }} error={err("issueDate")} />
            <div className="sm:col-span-2">
              <DateField
                label={t("purchases.form.dueDate")}
                value={due}
                onChange={(v) => {
                  setDueDate(v);
                  setDueTouched(true);
                  dismiss();
                }}
                error={err("dueDate")}
              />
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption-1-medium">
                <span className={overTerm ? "text-text-error-primary" : "text-text-secondary"}>
                  {overTerm ? t("editor.termOver", { n: term, max: rules.maxPaymentTermDays }) : t("purchases.form.term", { n: Math.max(term, 0) })}
                </span>
                {dueTouched && (
                  <button type="button" onClick={() => setDueTouched(false)} className="cursor-pointer text-accent-600 underline underline-offset-2 max-nav:inline-flex max-nav:min-h-11 max-nav:items-center">
                    {t("editor.resetDue")}
                  </button>
                )}
              </p>
            </div>
          </div>

          <RadioGroup aria-label={t("purchases.form.category")} value={category} onChange={(v) => setCategory(v as PurchaseCategory)} className="gap-2">
            <span className="text-body-medium text-text-primary">{t("purchases.form.category")}</span>
            {PURCHASE_CATEGORIES.map((c) => (
              <Radio
                key={c}
                value={c}
                className="w-full items-start rounded-xl border border-border-button-default bg-background-primary-default p-3 transition-colors hover:bg-background-primary-hover data-[selected]:border-border-button-active data-[selected]:bg-background-secondary-default data-[focus-visible]:ring-2 data-[focus-visible]:ring-border-focus-ring"
              >
                <span className="grid gap-0.5">
                  <span className="text-body-medium text-text-primary">{t(`pcat.${c}`)}</span>
                  <span className="text-caption-1-regular text-text-secondary">{t(`pcat.desc.${c}`)}</span>
                </span>
              </Radio>
            ))}
          </RadioGroup>

          <Input
            label={t("purchases.form.description")}
            value={description}
            onChange={(v) => {
              setDescription(v);
              dismiss();
            }}
            maxLength={300}
            isRequired
            isInvalid={!!err("description")}
            errorMessage={err("description")}
            hint={t("purchases.form.descriptionHint")}
          />
        </Card>

        <Card className="grid gap-3 p-5">
          <h2 className="text-headline-semibold text-text-primary">{t("purchases.form.amounts")}</h2>
          <p className="-mt-1 text-body-regular text-text-secondary">{t("purchases.form.amountsHint")}</p>
          {err("vatLines") && <HintText isInvalid>{err("vatLines")}</HintText>}
          <ol className="grid gap-2">
            {rows.map((r, i) => {
              const dev = r.net !== "" ? deviation(r) : 0;
              const msg = err(`vatLines.${i}.vat`);
              return (
                <li key={r.key} className="grid gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-3 shadow-xs">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Select
                      label={t("purchases.form.rate")}
                      aria-label={`${t("purchases.form.rate")} ${i + 1}`}
                      selectedKey={r.rate}
                      onSelectionChange={(k) => k && setRow(i, { rate: String(k) })}
                      className="max-sm:col-span-2"
                    >
                      {rules.vatRates.map((v) => (
                        <SelectItem key={v} id={v} textValue={`${v} %`}>{v} %</SelectItem>
                      ))}
                    </Select>
                    <DecimalField
                      label={t("purchases.form.net")}
                      aria-label={`${t("purchases.form.net")} ${i + 1}`}
                      value={r.net}
                      onChange={(v) => setRow(i, { net: v })}
                      digits={[2, 2]}
                      hideSteppers
                    />
                    <DecimalField
                      label={t("purchases.form.vat")}
                      aria-label={`${t("purchases.form.vat")} ${i + 1}`}
                      value={r.vat}
                      onChange={(v) => setRow(i, { vat: v, vatTouched: true })}
                      digits={[2, 2]}
                      hideSteppers
                      error={dev > TOLERANCE ? t("purchases.form.vatGap", { rate: r.rate, calc: fmtNumber(vatOf(r.net, r.rate)) }) : msg}
                    />
                    <IconButton
                      icon={RiDeleteBinLine}
                      aria-label={t("purchases.form.removeRate", { n: i + 1 })}
                      onClick={() => removeRow(i)}
                      className="max-sm:row-start-2 max-sm:col-start-2 sm:mb-0"
                    />
                  </div>
                  {r.vatTouched && dev > 0 && dev <= TOLERANCE && (
                    <p className="text-caption-1-regular text-text-secondary">
                      {t("purchases.form.vatDiff", { amount: fromCents(dev), calc: fmtNumber(vatOf(r.net, r.rate)), rate: r.rate })}
                    </p>
                  )}
                  {r.vatTouched && dev === 0 && (
                    <button type="button" onClick={() => setRow(i, { vatTouched: false })} className="justify-self-start text-caption-1-medium text-accent-600 underline underline-offset-2">
                      {t("purchases.form.autoVat")}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {rows.length < 5 && (
            <div>
              <Button variant="secondary" size="small" leadingIcon={RiAddLine} onClick={addRow}>{t("purchases.form.addRate")}</Button>
            </div>
          )}

          <dl className="grid gap-1.5 rounded-2xl bg-background-secondary-default p-4 text-body-regular">
            <div className="flex items-center justify-between gap-4"><dt className="text-text-secondary">{t("purchases.form.totalNet")}</dt><dd><Money value={fromCents(totals.net)} locale="fr" /></dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-text-secondary">{t("purchases.form.totalVat")}</dt><dd><Money value={fromCents(totals.vat)} locale="fr" /></dd></div>
            <div className="flex items-center justify-between gap-4 border-t border-separator-border pt-1.5 text-body-medium"><dt className="text-text-primary">{t("purchases.form.totalGross")}</dt><dd><Money value={fromCents(totals.net + totals.vat)} locale="fr" className="text-headline-semibold" /></dd></div>
          </dl>

          <div className="grid gap-1">
            <Switch isSelected={deductible} onChange={setDeductible}>{t("purchases.form.deductible")}</Switch>
            <p className="text-caption-1-regular text-text-secondary">{t(deductible ? "purchases.form.deductibleOn" : "purchases.form.deductibleOff")}</p>
          </div>
        </Card>

        <Card className="grid gap-3 p-5">
          <Textarea label={t("editor.notes")} aria-label={t("editor.notes")} maxLength={2000} value={notes} onChange={setNotes} rows={3} />
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:[&>*]:flex-1 nav:hidden">{actions}</div>
        <button type="submit" className="sr-only" tabIndex={-1}>{t("common.save")}</button>
      </form>

      <Drawer isOpen={newOpen} onOpenChange={setNewOpen} placement="end" size="md" aria-label={t("suppliers.new")}>
        {({ close }) => (
          <>
            <DrawerHeader title={t("suppliers.new")} closeLabel={t("common.close")} />
            <DrawerBody>
              <PartyForm
                formId="new-supplier"
                defaultKind="SUPPLIER"
                onPending={setPartyPending}
                onSaved={(p: Party) => {
                  setSuppliers((all) => [p, ...all]);
                  setSupplierId(p.id);
                  setSupplierQuery(p.name);
                  dismiss();
                  close();
                }}
              />
            </DrawerBody>
            <DrawerFooter>
              <PartyFormFooter formId="new-supplier" pending={partyPending} onCancel={close} />
            </DrawerFooter>
          </>
        )}
      </Drawer>
    </div>
  );
}
