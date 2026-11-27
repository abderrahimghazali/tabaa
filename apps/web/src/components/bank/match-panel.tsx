"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiCloseLine } from "@remixicon/react";
import { PaymentMethod, type ApiError, type BankTransaction } from "@facture/core";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/auth/fields";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { SearchField } from "@/components/base/search-field/search-field";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { DecimalField } from "@/components/invoice/fields";
import { loadOpenInvoices, matchBankLine } from "@/lib/actions";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";

type OpenInvoice = { id: string; number: string; customerName: string; dueDate: string; remaining: string };

const cents = (v: string) => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

export function MatchPanel({ line, onClose, onMatched }: { line: BankTransaction; onClose: () => void; onMatched: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<OpenInvoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<{ inv: OpenInvoice; amount: string }[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    loadOpenInvoices().then((res) => {
      if (stale) return;
      if (res.ok) setOpen(res.data);
      else setFailed(true);
    });
    return () => {
      stale = true;
    };
  }, []);

  const budget = cents(line.amount);
  const allocated = chosen.reduce((s, c) => s + cents(c.amount), 0);
  const rest = budget - allocated;
  const chosenIds = new Set(chosen.map((c) => c.inv.id));

  const suggested: OpenInvoice[] = line.suggestions
    .filter((s) => !chosenIds.has(s.invoiceId))
    .map((s) => open?.find((o) => o.id === s.invoiceId) ?? { id: s.invoiceId, number: s.number, customerName: s.customerName, dueDate: s.dueDate, remaining: s.amountDue });
  const suggestionIds = new Set(line.suggestions.map((s) => s.invoiceId));
  const term = q.trim().toLowerCase();
  const others = useMemo(
    () =>
      (open ?? [])
        .filter((o) => !chosenIds.has(o.id) && !suggestionIds.has(o.id))
        .filter((o) => !term || `${o.number} ${o.customerName}`.toLowerCase().includes(term))
        .slice(0, 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, term, chosen, line.suggestions],
  );

  const add = (inv: OpenInvoice) => {
    setError(null);
    const amount = fromCents(Math.max(0, Math.min(cents(inv.remaining), rest)));
    setChosen((c) => [...c, { inv, amount }]);
  };

  const issueFor = (c: { inv: OpenInvoice; amount: string }) => {
    const v = cents(c.amount);
    if (v <= 0) return t("bank.panel.errZero");
    if (v > cents(c.inv.remaining)) return t("bank.panel.errOver", { amount: fmtNumber(c.inv.remaining) });
    return undefined;
  };
  const overBudget = rest < 0;
  const valid = chosen.length > 0 && !overBudget && chosen.every((c) => !issueFor(c));

  const apiMessage = (e: ApiError) => {
    if (e.code === "NOT_MATCHABLE") return t("bank.err.NOT_MATCHABLE");
    if (e.code === "OVERPAYMENT") return t("bank.err.OVERPAYMENT");
    if (e.code === "FORBIDDEN") return e.message;
    return e.issues?.[0]?.message ?? t("bank.err.generic");
  };

  const confirm = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    const res = await matchBankLine(line.id, { method, allocations: chosen.map((c) => ({ invoiceId: c.inv.id, amount: Number(c.amount).toFixed(2) })) });
    setPending(false);
    if (res.ok) {
      toast.success(t("bank.matched", { n: chosen.length }));
      router.refresh();
      onMatched();
      return;
    }
    setError(apiMessage(res.error));
    if (res.error.code === "NOT_MATCHABLE") router.refresh();
  };

  const reasons = (id: string) => line.suggestions.find((s) => s.invoiceId === id)?.reasons ?? [];

  const row = (inv: OpenInvoice, withReasons: boolean) => (
    <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="ident text-body-medium text-text-primary">{inv.number}</span>
          <span dir="auto" className="truncate text-body-regular text-text-secondary">{inv.customerName}</span>
        </div>
        <div className="num text-caption-1-regular text-text-secondary">
          {t("bank.panel.due", { amount: fmtNumber(inv.remaining), date: fmtDate(inv.dueDate) })}
        </div>
        {withReasons && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reasons(inv.id).map((r) => (
              <Chip key={r} color="blue" variant="caption">{t(`bank.reason.${r}`)}</Chip>
            ))}
          </div>
        )}
      </div>
      <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={() => add(inv)} aria-label={`${t("bank.panel.add")} ${inv.number}`}>
        {t("bank.panel.add")}
      </Button>
    </li>
  );

  return (
    <Modal isOpen onOpenChange={(o) => !o && !pending && onClose()} size="lg" aria-label={t("bank.panel.title")} className="max-sm:h-[90dvh]">
      <ModalHeader title={t("bank.panel.title")} description={`${fmtDate(line.date)} · ${line.label}`} closeLabel={t("bank.panel.close")} />
      <ModalBody>
        <div className="grid gap-4 pt-1">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-background-secondary-default p-4">
            <div>
              <div className="text-caption-1-regular text-text-secondary">{t("bank.panel.budget")}</div>
              <Money value={line.amount} locale={locale} className="text-headline-semibold text-text-primary" />
            </div>
            <div>
              <div className="text-caption-1-regular text-text-secondary">{t("bank.panel.rest")}</div>
              <Money value={fromCents(rest)} locale={locale} className={cx("text-headline-semibold", overBudget ? "text-text-error-primary" : "text-text-primary")} />
            </div>
          </div>
          {overBudget && <Notice tone="error">{t("bank.panel.errSum", { amount: fmtNumber(fromCents(-rest)) })}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}

          <section aria-label={t("bank.panel.selected")} className="grid gap-2">
            <h3 className="text-body-medium text-text-primary">{t("bank.panel.selected")}</h3>
            {chosen.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border-button-default px-4 py-3 text-body-regular text-text-secondary">{t("bank.panel.none")}</p>
            ) : (
              <ul className="grid gap-2">
                {chosen.map((c, i) => (
                  <li key={c.inv.id} className="grid gap-2 rounded-2xl border border-border-button-default p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="ident text-body-medium text-text-primary">{c.inv.number}</div>
                        <div dir="auto" className="truncate text-caption-1-regular text-text-secondary">{c.inv.customerName}</div>
                        <div className="num text-caption-1-regular text-text-secondary">{t("bank.panel.due", { amount: fmtNumber(c.inv.remaining), date: fmtDate(c.inv.dueDate) })}</div>
                      </div>
                      <IconButton icon={RiCloseLine} size="small" aria-label={t("bank.panel.remove", { number: c.inv.number })} onClick={() => setChosen((all) => all.filter((x) => x.inv.id !== c.inv.id))} />
                    </div>
                    <DecimalField
                      aria-label={t("bank.panel.amount", { number: c.inv.number })}
                      value={c.amount}
                      onChange={(v) => setChosen((all) => all.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                      digits={[2, 2]}
                      hideSteppers
                      error={issueFor(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {chosen.length > 0 && !overBudget && rest > 0 && (
              <p className="text-caption-1-regular text-text-secondary">{t("bank.panel.partialNote", { rest: fmtNumber(fromCents(rest)) })}</p>
            )}
          </section>

          {suggested.length > 0 && (
            <section aria-label={t("bank.panel.suggestions")} className="grid gap-1">
              <h3 className="text-body-medium text-text-primary">{t("bank.panel.suggestions")}</h3>
              <ul className="divide-y divide-separator-border">{suggested.map((s) => row(s, true))}</ul>
            </section>
          )}

          <section aria-label={t("bank.panel.open")} className="grid gap-2">
            <h3 className="text-body-medium text-text-primary">{t("bank.panel.open")}</h3>
            <SearchField aria-label={t("bank.panel.search")} placeholder={t("bank.panel.search")} value={q} onChange={setQ} clearLabel={t("lists.clearSearch")} shape="rounded" />
            {failed ? (
              <Notice tone="error">{t("bank.panel.loadFailed")}</Notice>
            ) : open === null ? (
              <p role="status" className="text-body-regular text-text-secondary">{t("auth.pending")}</p>
            ) : others.length === 0 ? (
              <p className="text-body-regular text-text-secondary">{t("bank.panel.noOpen")}</p>
            ) : (
              <ul className="divide-y divide-separator-border">{others.map((o) => row(o, false))}</ul>
            )}
          </section>

          <Select
            label={t("bank.panel.method")}
            className="w-full"
            triggerClassName="w-full"
            selectedKey={method}
            onSelectionChange={(k) => k && setMethod(String(k) as PaymentMethod)}
          >
            {PaymentMethod.options.map((m) => (
              <SelectItem key={m} id={m}>{t(`pm.${m}`)}</SelectItem>
            ))}
          </Select>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
        <Button onClick={() => void confirm()} disabled={!valid || pending} aria-busy={pending}>
          {t("bank.panel.confirm", { n: chosen.length })}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

