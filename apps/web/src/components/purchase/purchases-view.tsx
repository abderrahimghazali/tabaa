"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RiAddLine, RiShoppingBag3Line } from "@remixicon/react";
import type { PurchaseList, PurchaseSummary } from "@facture/core";
import { MobileActionBar } from "@/components/app/mobile-actions";
import { Money } from "@/components/app/money";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Pagination } from "@/components/base/pagination/pagination";
import { SearchField } from "@/components/base/search-field/search-field";
import { Tab, TabList, Tabs } from "@/components/base/tabs/tabs";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { TopbarActions } from "@/components/frame";
import { EmptyState, FilterSelect, ListCard, ListToolbar, MobileFilters, RouterBoundary } from "@/components/invoice/list-kit";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCan } from "@/lib/me-client";
import { cx } from "@/utils/cx";
import { DisputeChip, PurchaseStatusChip, WarningMark } from "./purchase-status";

type Filters = { state: string; pay: string; overdue: boolean; supplier: string; period: string; q: string };

const TABS = ["all", "TO_APPROVE", "APPROVED", "REJECTED"] as const;
const PAYMENTS = ["UNPAID", "PARTIAL", "PAID"] as const;
const PERIODS = ["month", "d30", "quarter", "year"] as const;

export function PurchasesView({
  list,
  suppliers,
  filters,
  page,
  pageSize,
}: {
  list: PurchaseList;
  suppliers: { id: string; name: string }[];
  filters: Filters;
  page: number;
  pageSize: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startNav] = useTransition();
  const canWrite = useCan("write");
  const [search, setSearch] = useState(filters.q);
  const ov = list.overview;

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in next)) sp.delete("page");
    const qs = sp.toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    if (search === filters.q) return;
    const id = setTimeout(() => go({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(list.total / pageSize));
  const filtered = !!(filters.q || filters.pay !== "all" || filters.overdue || filters.supplier !== "all" || filters.period !== "all" || filters.state !== "all");
  const none = !filtered && list.total === 0;

  const payOptions = [{ key: "all", label: t("purchases.allPayments") }, ...PAYMENTS.map((k) => ({ key: k, label: t(`purchases.pay.${k}`) }))];
  const supplierOptions = [{ key: "all", label: t("purchases.allSuppliers") }, ...suppliers.map((s) => ({ key: s.id, label: s.name }))];
  const periodOptions = [{ key: "all", label: t("lists.allPeriods") }, ...PERIODS.map((k) => ({ key: k, label: t(`period.${k}`) }))];
  const overdueOptions = [{ key: "all", label: t("purchases.anyDue") }, { key: "1", label: t("status.overdue") }];

  const stat = (label: string, value: React.ReactNode, sub?: string, tone?: "danger", href?: Record<string, string | null>) => {
    const body = (
      <>
        <div className="text-body-regular text-text-secondary max-sm:text-caption-1-medium">{label}</div>
        <div className={cx("mt-1 text-title-2-medium max-sm:text-[15px] max-sm:leading-5", tone === "danger" ? "text-text-error-primary" : "text-text-primary")}>{value}</div>
        {sub && <div className="mt-0.5 text-caption-1-regular text-text-secondary">{sub}</div>}
      </>
    );
    const cls = "block min-w-0 rounded-3xl border border-border-button-default bg-background-primary-default p-4 max-sm:rounded-2xl max-sm:p-3";
    return href ? (
      <button type="button" onClick={() => go(href)} className={cx(cls, "cursor-pointer text-start outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring")}>
        {body}
      </button>
    ) : (
      <div className={cls}>{body}</div>
    );
  };

  const money = (v: string) => <Money value={v} locale={locale} />;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {canWrite && (
        <TopbarActions>
          <ButtonLink href="/achats/nouvelle" leadingIcon={RiAddLine}>{t("purchases.new")}</ButtonLink>
        </TopbarActions>
      )}
      {canWrite && (
        <MobileActionBar>
          <ButtonLink href="/achats/nouvelle" leadingIcon={RiAddLine}>{t("purchases.new")}</ButtonLink>
        </MobileActionBar>
      )}

      {!none && (
        <section aria-label={t("purchases.overview")} className="grid grid-cols-2 gap-3 max-sm:gap-2 wide:grid-cols-4">
          {stat(t("purchases.ov.toApprove"), <span className="num">{ov.toApprove}</span>, undefined, undefined, { state: "TO_APPROVE", pay: null, overdue: null })}
          {stat(t("purchases.ov.unpaid"), money(ov.unpaidTotal), undefined, undefined, { state: "APPROVED", pay: null, overdue: null })}
          {stat(t("purchases.ov.overdue"), money(ov.overdueTotal), t("purchases.ov.overdueCount", { n: ov.overdueCount }), Number(ov.overdueTotal) > 0 ? "danger" : undefined, { overdue: "1", state: null, pay: null })}
          {stat(t("purchases.ov.soon"), money(ov.dueWithin7Days))}
        </section>
      )}

      {none ? (
        <ListCard className="pb-0">
          <EmptyState icon={RiShoppingBag3Line} title={t("purchases.emptyTitle")} body={t("purchases.emptyBody")}>
            {canWrite && <ButtonLink className="mt-1" href="/achats/nouvelle" leadingIcon={RiAddLine}>{t("purchases.createFirst")}</ButtonLink>}
          </EmptyState>
        </ListCard>
      ) : (
        <>
          <Tabs selectedKey={filters.state} onSelectionChange={(k) => go({ state: String(k) })}>
            <TabList aria-label={t("purchases.tabs")}>
              {TABS.map((s) => (
                <Tab key={s} id={s} count={s === "TO_APPROVE" ? ov.toApprove : undefined}>{t(`purchases.tab.${s}`)}</Tab>
              ))}
            </TabList>
          </Tabs>

          <ListCard className={totalPages > 1 ? "pb-3" : "pb-0"}>
            <ListToolbar count={<><span className="num">{list.total}</span> {t(list.total === 1 ? "purchases.countOne" : "purchases.count")}</>}>
              <div className="hidden nav:contents">
                <FilterSelect label={t("purchases.filter.payment")} value={filters.pay} onChange={(v) => go({ pay: v })} options={payOptions} />
                <FilterSelect label={t("purchases.filter.due")} value={filters.overdue ? "1" : "all"} onChange={(v) => go({ overdue: v })} options={overdueOptions} />
                <FilterSelect label={t("purchases.filter.supplier")} value={filters.supplier} onChange={(v) => go({ supplier: v })} options={supplierOptions} />
                <FilterSelect label={t("filter.period")} value={filters.period} onChange={(v) => go({ period: v })} options={periodOptions} />
              </div>
              <SearchField
                aria-label={t("common.search")}
                clearLabel={t("lists.clearSearch")}
                placeholder={t("purchases.search")}
                value={search}
                onChange={setSearch}
                className="min-w-0 flex-1 nav:w-[220px] nav:min-w-[180px] nav:flex-none"
              />
              <MobileFilters
                onReset={() => go({ pay: null, overdue: null, supplier: null, period: null })}
                filters={[
                  { key: "pay", label: t("purchases.filter.payment"), value: filters.pay, onChange: (v) => go({ pay: v }), options: payOptions },
                  { key: "due", label: t("purchases.filter.due"), value: filters.overdue ? "1" : "all", onChange: (v) => go({ overdue: v }), options: overdueOptions },
                  { key: "supplier", label: t("purchases.filter.supplier"), value: filters.supplier, onChange: (v) => go({ supplier: v }), options: supplierOptions },
                  { key: "period", label: t("filter.period"), value: filters.period, onChange: (v) => go({ period: v }), options: periodOptions },
                ]}
              />
            </ListToolbar>

            {list.items.length === 0 ? (
              <div className="mt-2 border-t border-separator-border">
                <EmptyState icon={RiShoppingBag3Line} title={filters.q ? t("purchases.noMatch", { q: filters.q }) : t("purchases.emptyView")} body={t("invoices.noMatchHint")}>
                  {filtered && <Button variant="secondary" className="mt-1" onClick={() => { setSearch(""); go({ q: null, pay: null, overdue: null, supplier: null, period: null, state: null }); }}>{t("invoices.clearFilters")}</Button>}
                </EmptyState>
              </div>
            ) : (
              <PurchaseRows items={list.items} />
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
        </>
      )}
    </div>
  );
}

/** The purchase table (desktop) and cards (phone). Reused on a supplier's page, where the supplier column is hidden. */
export function PurchaseRows({ items, hideSupplier }: { items: PurchaseSummary[]; hideSupplier?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <>
      <div className="mt-2 hidden nav:block">
        <RouterBoundary>
          <Table aria-label={t("purchases.table")} selectionMode="none" className="min-w-[900px] table-fixed">
            <TableHeader>
              <TableColumn id="supplier" isRowHeader className={hideSupplier ? "w-[16%]" : "w-[26%]"}>{hideSupplier ? t("purchases.col.number") : t("purchases.col.supplier")}</TableColumn>
              <TableColumn id="date" className="w-[104px]">{t("col.date")}</TableColumn>
              <TableColumn id="due" className="w-[104px]">{t("col.due")}</TableColumn>
              <TableColumn id="gross" className="w-[130px] text-end"><div className="text-end">{t("col.gross")}</div></TableColumn>
              <TableColumn id="remaining" className="w-[130px] text-end"><div className="text-end">{t("col.remaining")}</div></TableColumn>
              <TableColumn id="status" className="w-[200px]">{t("col.status")}</TableColumn>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} id={p.id} href={`/achats/${p.id}`} className="cursor-pointer hover:bg-background-secondary-default">
                  <TableCell>
                    <div className="min-w-0">
                      <div className="truncate text-body-medium text-text-primary">{hideSupplier ? <span dir="ltr" className="ident">{p.number}</span> : p.supplierName}</div>
                      {!hideSupplier && (
                        <div className="flex min-w-0 items-center gap-1.5 text-caption-1-regular text-text-tertiary">
                          <span dir="ltr" className="ident shrink-0">{p.number}</span>
                          <span aria-hidden>·</span>
                          <span className="truncate">{t(`pcat.${p.category}`)}</span>
                        </div>
                      )}
                      {hideSupplier && <div className="text-caption-1-regular text-text-tertiary">{t(`pcat.${p.category}`)}</div>}
                    </div>
                  </TableCell>
                  <TableCell><span className="num text-text-secondary">{fmtDate(p.issueDate)}</span></TableCell>
                  <TableCell><span className="num text-text-secondary">{fmtDate(p.dueDate)}</span></TableCell>
                  <TableCell className="text-end"><Money value={p.totalGross} locale={locale} bare className="text-body-medium" /></TableCell>
                  <TableCell className="text-end">
                    {p.state === "APPROVED" && Number(p.amountDue) > 0 ? <Money value={p.amountDue} locale={locale} bare className={cx("text-body-medium", p.overdue && "text-text-error-primary")} /> : <span className="text-text-tertiary">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PurchaseStatusChip p={p} t={t} />
                      {p.disputed && <DisputeChip t={t} />}
                      <WarningMark count={p.warningCount} t={t} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </RouterBoundary>
      </div>

      <ul className="mt-2 divide-y divide-separator-border border-t border-separator-border nav:hidden">
        {items.map((p) => (
          <li key={p.id} className="relative flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/achats/${p.id}`} className="block truncate text-body-medium text-text-primary after:absolute after:inset-0">
                  {hideSupplier ? p.number : p.supplierName}
                </Link>
                <div className="flex min-w-0 items-center gap-1.5 text-caption-1-regular text-text-tertiary">
                  {!hideSupplier && (
                    <>
                      <span dir="ltr" className="ident shrink-0">{p.number}</span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <span className="truncate">{t(`pcat.${p.category}`)}</span>
                </div>
              </div>
              <div className="shrink-0 text-end">
                <Money value={p.totalGross} locale={locale} className="text-headline-medium text-text-primary" />
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <PurchaseStatusChip p={p} t={t} />
                {p.disputed && <DisputeChip t={t} />}
                <WarningMark count={p.warningCount} t={t} />
              </div>
              <div className="num text-end text-caption-1-regular text-text-secondary">
                {t("col.due")} {fmtDate(p.dueDate)}
                {p.state === "APPROVED" && Number(p.amountDue) > 0 && (
                  <div>{t("col.remaining")} <Money value={p.amountDue} locale={locale} bare className={cx(p.overdue && "text-text-error-primary")} /></div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
