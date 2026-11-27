"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RiArrowDownSLine, RiBankLine, RiCheckLine, RiDeleteBinLine, RiFileUploadLine } from "@remixicon/react";
import type { ApiError, BankImport, BankTransaction, BankTransactionList, BankTransactionStatus } from "@facture/core";
import { MobileActionBar } from "@/components/app/mobile-actions";
import { Money } from "@/components/app/money";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { AlertDialog } from "@/components/base/modal/modal";
import { Pagination } from "@/components/base/pagination/pagination";
import { SearchField } from "@/components/base/search-field/search-field";
import { Tab, TabList, Tabs } from "@/components/base/tabs/tabs";
import { toast } from "@/components/base/toast/toast";
import { TopbarActions } from "@/components/frame";
import { EmptyState, FilterSelect, ListCard, ListToolbar, MobileFilters } from "@/components/invoice/list-kit";
import { Notice } from "@/components/auth/fields";
import { deleteBankImport, ignoreBankLine, matchBankLine, unignoreBankLine, unmatchBankLine } from "@/lib/actions";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCan } from "@/lib/me-client";
import { useStamp } from "@/lib/use-stamp";
import { cx } from "@/utils/cx";
import { ImportDialog } from "./import-dialog";
import { MatchPanel } from "./match-panel";

const TABS: BankTransactionStatus[] = ["UNMATCHED", "MATCHED", "IGNORED"];
const cents = (v: string) => Math.round((Number(v) || 0) * 100);

export function BankView({
  list,
  imports,
  status,
  q,
  importId,
  page,
  pageSize,
  openImport,
}: {
  list: BankTransactionList;
  imports: BankImport[];
  status: BankTransactionStatus;
  q: string;
  importId: string;
  page: number;
  pageSize: number;
  openImport: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startNav] = useTransition();
  const canBank = useCan("bank");
  const canAdmin = useCan("admin");
  const [importing, setImporting] = useState(openImport && canBank);
  const [matching, setMatching] = useState<BankTransaction | null>(null);
  const [unmatching, setUnmatching] = useState<BankTransaction | null>(null);
  const [deleting, setDeleting] = useState<BankImport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(q);
  const [showHistory, setShowHistory] = useState(false);
  const focusAfter = useRef<string | null>(null);

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("new");
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in next)) sp.delete("page");
    const qs = sp.toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    if (openImport) router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (search === q) return;
    const id = setTimeout(() => go({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    document.querySelector<HTMLElement>(`[data-bank-row="${id}"] [data-primary]`)?.focus();
  }, [list.items]);

  const message = (e: ApiError) => {
    if (e.code === "NOT_MATCHABLE") return t("bank.err.NOT_MATCHABLE");
    if (e.code === "OVERPAYMENT") return t("bank.err.OVERPAYMENT");
    if (e.code === "HAS_MATCHES") return t("bank.err.HAS_MATCHES");
    if (e.code === "FORBIDDEN") return e.message;
    return t("bank.err.generic");
  };

  const nextRowId = (id: string) => {
    const i = list.items.findIndex((l) => l.id === id);
    return list.items[i + 1]?.id ?? list.items[i - 1]?.id ?? null;
  };

  const act = async (line: BankTransaction, fn: () => Promise<{ ok: true } | { ok: false; error: ApiError }>, success: string) => {
    if (busy) return;
    setBusy(line.id);
    const next = nextRowId(line.id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast.success(success);
      focusAfter.current = status === "UNMATCHED" || status === "IGNORED" ? next : null;
      router.refresh();
    } else {
      toast.error(message(res.error));
      if (res.error.code === "NOT_MATCHABLE") router.refresh();
    }
  };

  const quickMatch = (line: BankTransaction) => {
    const s = line.suggestions[0];
    if (!s) return;
    return act(line, () => matchBankLine(line.id, { method: "TRANSFER", allocations: [{ invoiceId: s.invoiceId, amount: line.amount }] }), t("bank.matched", { n: 1 }));
  };

  const importOptions = [
    { key: "all", label: t("bank.allImports") },
    ...imports.map((i) => ({ key: i.id, label: `${i.fileName} · ${fmtDate(i.importedAt.slice(0, 10))}` })),
  ];
  const filtered = !!(q || importId !== "all");
  const totalPages = Math.max(1, Math.ceil(list.total / pageSize));
  const noData = imports.length === 0 && list.counts.UNMATCHED + list.counts.MATCHED + list.counts.IGNORED === 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {canBank && (
        <TopbarActions>
          <Button leadingIcon={RiFileUploadLine} onClick={() => setImporting(true)}>{t("bank.import")}</Button>
        </TopbarActions>
      )}
      {canBank && (
        <MobileActionBar>
          <Button leadingIcon={RiFileUploadLine} onClick={() => setImporting(true)}>{t("bank.import")}</Button>
        </MobileActionBar>
      )}

      {!canBank && <Notice tone="info">{t("bank.readOnly")}</Notice>}

      {noData ? (
        <ListCard className="pb-0">
          <EmptyState icon={RiBankLine} title={t("bank.empty.title")} body={t("bank.empty.body")}>
            {canBank && <Button className="mt-1" leadingIcon={RiFileUploadLine} onClick={() => setImporting(true)}>{t("bank.import")}</Button>}
          </EmptyState>
        </ListCard>
      ) : (
        <>
          <Tabs selectedKey={status} onSelectionChange={(k) => go({ status: String(k) === "UNMATCHED" ? null : String(k) })}>
            <TabList aria-label={t("bank.tabs")}>
              {TABS.map((s) => (
                <Tab key={s} id={s} count={list.counts[s]}>{t(`bank.tab.${s}`)}</Tab>
              ))}
            </TabList>
          </Tabs>

          <ListCard className={totalPages > 1 ? "pb-3" : "pb-0"}>
            <ListToolbar count={<><span className="num">{list.total}</span> {t(list.total === 1 ? "bank.countOne" : "bank.count")}</>}>
              <div className="hidden nav:contents">
                <FilterSelect label={t("bank.filter.import")} value={importId} onChange={(v) => go({ imp: v })} options={importOptions} />
              </div>
              <SearchField
                aria-label={t("common.search")}
                clearLabel={t("lists.clearSearch")}
                placeholder={t("bank.search")}
                value={search}
                onChange={setSearch}
                className="min-w-0 flex-1 nav:w-[260px] nav:min-w-[200px] nav:flex-none"
              />
              <MobileFilters
                onReset={() => go({ imp: null })}
                filters={[{ key: "imp", label: t("bank.filter.import"), value: importId, onChange: (v) => go({ imp: v }), options: importOptions }]}
              />
            </ListToolbar>

            {list.items.length === 0 ? (
              <div className="mt-2 border-t border-separator-border">
                {q ? (
                  <EmptyState icon={RiBankLine} title={t("bank.empty.search", { q })} body={t("bank.noMatchHint")}>
                    <Button variant="secondary" className="mt-1" onClick={() => { setSearch(""); go({ q: null, imp: null }); }}>{t("bank.clearFilters")}</Button>
                  </EmptyState>
                ) : (
                  <EmptyState icon={status === "UNMATCHED" ? RiCheckLine : RiBankLine} title={t(`bank.empty.${status}`)} body={t(`bank.empty.${status}Body` as "bank.empty.UNMATCHEDBody")}>
                    {filtered && <Button variant="secondary" className="mt-1" onClick={() => go({ imp: null })}>{t("bank.clearFilters")}</Button>}
                  </EmptyState>
                )}
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-separator-border border-t border-separator-border" aria-label={t(`bank.tab.${status}`)}>
                {list.items.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    locale={locale}
                    busy={busy === line.id}
                    canBank={canBank}
                    canAdmin={canAdmin}
                    onQuick={() => void quickMatch(line)}
                    onChoose={() => setMatching(line)}
                    onIgnore={() => void act(line, () => ignoreBankLine(line.id), t("bank.ignored"))}
                    onUnignore={() => void act(line, () => unignoreBankLine(line.id), t("bank.restored"))}
                    onUnmatch={() => setUnmatching(line)}
                  />
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <div className="border-t border-separator-border px-3 pt-3">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={(p) => go({ page: p === 1 ? null : String(p) })}
                  previousLabel={t("common.previous")}
                  nextLabel={t("common.next")}
                  aria-label={t("lists.pagination")}
                />
              </div>
            )}
          </ListCard>

          <History
            imports={imports}
            open={showHistory}
            onToggle={() => setShowHistory((o) => !o)}
            canAdmin={canAdmin}
            onFilter={(id) => go({ imp: id, status: null })}
            onDelete={setDeleting}
          />
        </>
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {matching && <MatchPanel line={matching} onClose={() => setMatching(null)} onMatched={() => { focusAfter.current = nextRowId(matching.id); setMatching(null); }} />}

      {unmatching && (
        <AlertDialog
          isOpen
          onOpenChange={(o) => !o && setUnmatching(null)}
          title={t("bank.unmatchTitle")}
          description={t("bank.unmatchBody", { n: unmatching.allocations.length, total: fmtNumber(unmatching.allocations.reduce((s, a) => s + cents(a.amount), 0) / 100) })}
          confirmLabel={t("bank.unmatchConfirm")}
          cancelLabel={t("bank.keep")}
          pendingLabel={t("auth.pending")}
          onConfirm={async () => {
            const res = await unmatchBankLine(unmatching.id);
            if (!res.ok) {
              toast.error(message(res.error));
              throw new Error(res.error.code);
            }
            toast.success(t("bank.unmatched"));
            router.refresh();
          }}
        />
      )}

      {deleting && (
        <AlertDialog
          isOpen
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t("bank.hist.deleteTitle")}
          description={t("bank.hist.deleteBody", { name: deleting.fileName, n: deleting.lineCount })}
          confirmLabel={t("bank.hist.delete")}
          cancelLabel={t("common.cancel")}
          pendingLabel={t("auth.pending")}
          onConfirm={async () => {
            const res = await deleteBankImport(deleting.id);
            if (!res.ok) {
              toast.error(message(res.error));
              throw new Error(res.error.code);
            }
            toast.success(t("bank.importDeleted"));
            if (importId === deleting.id) go({ imp: null });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LineRow({
  line,
  locale,
  busy,
  canBank,
  canAdmin,
  onQuick,
  onChoose,
  onIgnore,
  onUnignore,
  onUnmatch,
}: {
  line: BankTransaction;
  locale: "fr" | "ar";
  busy: boolean;
  canBank: boolean;
  canAdmin: boolean;
  onQuick: () => void;
  onChoose: () => void;
  onIgnore: () => void;
  onUnignore: () => void;
  onUnmatch: () => void;
}) {
  const { t } = useI18n();
  const incoming = !line.amount.startsWith("-");
  const best = line.suggestions[0];
  const exact = !!best && cents(best.amountDue) === cents(line.amount);

  return (
    <li data-bank-row={line.id} className="grid gap-3 px-4 py-4 nav:grid-cols-[92px_minmax(0,1fr)_150px] nav:gap-5">
      <div className="num text-body-regular text-text-secondary max-nav:order-2 max-nav:text-caption-1-regular rtl:text-right">{fmtDate(line.date)}</div>

      <div className="grid min-w-0 content-start gap-2.5 max-nav:order-3">
        <div className="min-w-0">
          <div dir="auto" className="wrap-break-word text-body-medium text-text-primary max-nav:hidden">{line.label}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-regular text-text-tertiary">
            {line.reference && <span dir="ltr" className="ident">{t("bank.reference", { ref: line.reference })}</span>}
            {line.accountLabel && <Chip color="gray" variant="caption">{line.accountLabel}</Chip>}
          </div>
        </div>

        {line.status === "UNMATCHED" && incoming && (
          <div className="grid gap-2.5 rounded-2xl bg-background-secondary-default p-3">
            {best ? (
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-caption-1-medium text-text-secondary">{t("bank.suggestion")}</span>
                  <Link href={`/factures/${best.invoiceId}`} className="ident text-body-medium text-text-primary hover:underline">{best.number}</Link>
                  <span dir="auto" className="min-w-0 truncate text-body-regular text-text-secondary">{best.customerName}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {best.reasons.map((r) => (
                    <Chip key={r} color="blue" variant="caption">{t(`bank.reason.${r}`)}</Chip>
                  ))}
                  <span className="num text-caption-1-regular text-text-secondary">{t("bank.dueAmount", { amount: fmtNumber(best.amountDue) })}</span>
                </div>
                {line.suggestions.length > 1 && <p className="text-caption-1-regular text-text-tertiary">{t("bank.moreSuggestions", { n: line.suggestions.length - 1 })}</p>}
              </div>
            ) : (
              <p className="text-body-regular text-text-secondary">{t("bank.noSuggestion")}</p>
            )}
            {canBank && (
              <div className="flex flex-wrap items-center gap-2 max-nav:[&>*]:flex-1">
                {exact && (
                  <Button size="small" data-primary onClick={onQuick} disabled={busy} aria-busy={busy} leadingIcon={RiCheckLine}>{t("bank.match")}</Button>
                )}
                <Button size="small" variant="secondary" {...(exact ? {} : { "data-primary": true })} onClick={onChoose} disabled={busy}>{t("bank.choose")}</Button>
                <Button size="small" variant="secondary" onClick={onIgnore} disabled={busy}>{t("bank.ignore")}</Button>
              </div>
            )}
          </div>
        )}

        {line.status === "UNMATCHED" && !incoming && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption-1-regular text-text-tertiary">{t("bank.outgoing")}</p>
            {canBank && <Button size="small" variant="secondary" data-primary onClick={onIgnore} disabled={busy}>{t("bank.ignore")}</Button>}
          </div>
        )}

        {line.status === "MATCHED" && (
          <div className="grid gap-2">
            <ul className="grid gap-1">
              {line.allocations.map((a) => (
                <li key={a.paymentId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-regular">
                  <span className="text-caption-1-medium text-text-secondary">{t("bank.paidInvoices")}</span>
                  <Link href={`/factures/${a.invoiceId}`} className="ident text-body-medium text-text-primary hover:underline">{a.number}</Link>
                  <span dir="auto" className="truncate text-text-secondary">{a.customerName}</span>
                  <Money value={a.amount} locale={locale} className="text-caption-1-regular text-text-secondary" />
                </li>
              ))}
            </ul>
            {canAdmin && (
              <div>
                <Button size="small" variant="secondary" data-primary onClick={onUnmatch} disabled={busy}>{t("bank.unmatch")}</Button>
              </div>
            )}
          </div>
        )}

        {line.status === "IGNORED" && canBank && (
          <div>
            <Button size="small" variant="secondary" data-primary onClick={onUnignore} disabled={busy}>{t("bank.unignore")}</Button>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 max-nav:order-1 nav:flex-col nav:items-end">
        <div dir="auto" className="min-w-0 wrap-break-word text-body-medium text-text-primary nav:hidden">{line.label}</div>
        <div className="text-end">
          <Money
            value={line.amount}
            locale={locale}
            className={cx("text-headline-medium", incoming ? "text-text-primary" : "text-text-tertiary")}
          />
          <span className="sr-only">{incoming ? t("bank.in") : t("bank.out")}</span>
        </div>
      </div>
    </li>
  );
}

function History({
  imports,
  open,
  onToggle,
  canAdmin,
  onFilter,
  onDelete,
}: {
  imports: BankImport[];
  open: boolean;
  onToggle: () => void;
  canAdmin: boolean;
  onFilter: (id: string) => void;
  onDelete: (i: BankImport) => void;
}) {
  const { t } = useI18n();
  const stamp = useStamp();
  return (
    <section className="rounded-2xl border border-border-table">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="bank-history"
        onClick={onToggle}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <span className="text-body-medium text-text-primary">
          {t("bank.hist.title")} <span className="num text-text-tertiary">({imports.length})</span>
        </span>
        <RiArrowDownSLine className={cx("size-5 text-foreground-icon-secondary transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="bank-history" className="border-t border-separator-border">
          {imports.length === 0 ? (
            <p className="px-4 py-4 text-body-regular text-text-secondary">{t("bank.hist.none")}</p>
          ) : (
            <ul className="divide-y divide-separator-border">
              {imports.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <div dir="ltr" className="truncate text-start text-body-medium text-text-primary rtl:text-end">{i.fileName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-regular text-text-secondary">
                      <span className="num">{stamp(i.importedAt)}</span>
                      {i.importedByName && <span>{t("bank.hist.by", { name: i.importedByName })}</span>}
                      {i.accountLabel && <Chip color="gray" variant="caption">{i.accountLabel}</Chip>}
                    </div>
                    <div className="num mt-0.5 text-caption-1-regular text-text-tertiary rtl:text-right">
                      {t("bank.hist.lines", { n: i.lineCount })} · {t("bank.hist.dups", { n: i.duplicateCount })} · {t("bank.hist.matched", { n: i.matchedCount })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="small" variant="secondary" onClick={() => onFilter(i.id)}>{t("bank.hist.filter")}</Button>
                    {canAdmin && (
                      <IconButton icon={RiDeleteBinLine} aria-label={t("bank.hist.deleteLabel", { name: i.fileName })} onClick={() => onDelete(i)} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
