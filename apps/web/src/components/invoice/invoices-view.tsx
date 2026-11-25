"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiAddLine,
  RiDownload2Line,
  RiEditLine,
  RiEyeLine,
  RiFilePdf2Line,
  RiFileList3Line,
  RiFileReduceLine,
  RiMore2Fill,
  RiMoneyDollarCircleLine,
  RiSendPlaneLine,
} from "@remixicon/react";
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import type { InvoiceSummary } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { AlertDialog } from "@/components/base/modal/modal";
import { Pagination } from "@/components/base/pagination/pagination";
import { SearchField } from "@/components/base/search-field/search-field";
import { Tab, TabList, Tabs } from "@/components/base/tabs/tabs";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { toast } from "@/components/base/toast/toast";
import { NameAvatar } from "@/components/app/name-avatar";
import { Money } from "@/components/app/money";
import { createCreditNote, issueInvoice } from "@/lib/actions";
import { PdfSpinner, usePdfDownload } from "./pdf-download";
import { daysBetween, fmtDate, sub } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCanWrite } from "@/lib/me-client";
import { TABS, type Tab as TabKey } from "@/lib/invoice-tabs";
import { statusOf, type StatusKey } from "@/lib/status";
import { cx } from "@/utils/cx";
import { DueCell, StatusChip } from "./status";
import { EmptyState, FilterSelect, ListCard, ListToolbar, RouterBoundary, SortHeader, headerLabel } from "./list-kit";

const PAGE = 10;
const PERIODS = ["month", "d30", "quarter", "year"] as const;
const STATUSES = ["draft", "issued", "partial", "paid", "overdue", "credit"] as const;

type Row = InvoiceSummary & { remaining: string; open: boolean };

const isOpen = (i: InvoiceSummary) => i.state === "ISSUED" && i.type !== "CREDIT_NOTE" && i.paymentStatus !== "PAID";
const tabFilters: Record<TabKey, (i: InvoiceSummary) => boolean> = {
  all: () => true,
  drafts: (i) => i.state === "DRAFT",
  unpaid: isOpen,
  overdue: (i) => i.overdue && isOpen(i),
  paid: (i) => i.state === "ISSUED" && i.paymentStatus === "PAID",
};

function RowMenu({ inv, onIssue, onCredit }: { inv: Row; onIssue: () => void; onCredit: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const draft = inv.state === "DRAFT";
  const canWrite = useCanWrite();
  const pdf = usePdfDownload(inv.id);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const row = "flex items-center gap-2.5";
  const icon = "size-[18px] shrink-0 text-foreground-icon-secondary";
  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={t("common.actions")}
        className={cx(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-2lg",
          "border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-xs",
          "transition-[background-color,border-color,box-shadow,color] duration-150 ease",
          "hover:border-border-button-hover hover:bg-background-primary-hover",
          open && "border-border-button-active bg-background-primary-active",
        )}
      >
        {pdf.busy ? <PdfSpinner className="size-4 shrink-0" /> : <RiMore2Fill className="size-4 shrink-0" aria-hidden />}
      </DropdownTrigger>
      <DropdownPopover aria-label={t("common.actions")} placement="bottom end" variant="compact" className="w-[240px]">
        <DropdownGroup>
          <DropdownItem onSelect={() => go(`/factures/${inv.id}`)}>
            <span className={row}><RiEyeLine className={icon} aria-hidden />{t("row.open")}</span>
          </DropdownItem>
          {draft && canWrite && (
            <DropdownItem onSelect={() => go(`/factures/${inv.id}/modifier`)}>
              <span className={row}><RiEditLine className={icon} aria-hidden />{t("common.edit")}</span>
            </DropdownItem>
          )}
          {draft && canWrite && (
            <DropdownItem onSelect={() => { setOpen(false); onIssue(); }}>
              <span className={row}><RiSendPlaneLine className={icon} aria-hidden />{t("invoice.issue")}</span>
            </DropdownItem>
          )}
          {inv.open && canWrite && (
            <DropdownItem onSelect={() => go(`/factures/${inv.id}?pay=1`)}>
              <span className={row}><RiMoneyDollarCircleLine className={icon} aria-hidden />{t("payment.record")}</span>
            </DropdownItem>
          )}
          {!draft && canWrite && inv.type !== "CREDIT_NOTE" && (
            <DropdownItem onSelect={() => { setOpen(false); onCredit(); }}>
              <span className={row}><RiFileReduceLine className={icon} aria-hidden />{t("invoice.credit")}</span>
            </DropdownItem>
          )}
          <DropdownItem onSelect={() => { setOpen(false); void pdf.download(); }}>
            <span className={row}><RiFilePdf2Line className={icon} aria-hidden />{t("invoice.pdf")}</span>
          </DropdownItem>
          {!draft && (
            <DropdownItem
              onSelect={() => {
                setOpen(false);
                const a = document.createElement("a");
                a.href = `/factures/${inv.id}/ubl`;
                a.download = "";
                a.click();
              }}
            >
              <span className={row}><RiDownload2Line className={icon} aria-hidden />{t("invoice.ubl")}</span>
            </DropdownItem>
          )}
        </DropdownGroup>
      </DropdownPopover>
    </Dropdown>
  );
}

export function InvoicesView({
  invoices,
  today,
  initialTab = "all",
  initialQuery = "",
  hideCustomer,
}: {
  invoices: InvoiceSummary[];
  today: string;
  initialTab?: TabKey;
  initialQuery?: string;
  hideCustomer?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE });
  const [confirm, setConfirm] = useState<{ kind: "issue" | "credit"; id: string } | null>(null);

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    resetPage();
  };

  const customers = useMemo(() => [...new Set(invoices.map((i) => i.customerName))].sort((a, b) => a.localeCompare(b)), [invoices]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x, invoices.filter(tabFilters[x]).length])) as Record<TabKey, number>, [invoices]);

  const data = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return invoices
      .filter((i) => {
        if (!tabFilters[tab](i)) return false;
        if (status !== "all" && statusOf(i) !== (status as StatusKey)) return false;
        if (customer !== "all" && i.customerName !== customer) return false;
        if (period !== "all") {
          const age = daysBetween(today, i.issueDate);
          const ok =
            period === "month" ? i.issueDate.slice(0, 7) === today.slice(0, 7)
            : period === "d30" ? age >= 0 && age <= 30
            : period === "quarter" ? age >= 0 && age <= 90
            : i.issueDate.slice(0, 4) === today.slice(0, 4);
          if (!ok) return false;
        }
        return !term || `${i.number ?? ""} ${i.customerName}`.toLowerCase().includes(term);
      })
      .map((i) => ({ ...i, open: isOpen(i), remaining: isOpen(i) ? sub(i.amountDue, i.paidAmount) : "0.00" }));
  }, [invoices, tab, status, customer, period, q, today]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "invoice",
        accessorKey: hideCustomer ? "number" : "customerName",
        header: t("col.invoice"),
        cell: ({ row }) => {
          const inv = row.original;
          const number = inv.number ?? <span className="font-sans">{t("invoices.noNumber")}</span>;
          if (hideCustomer)
            return (
              <div className="min-w-0">
                <span className="ident text-body-medium">{number}</span>
                {inv.type === "CREDIT_NOTE" && <div className="text-caption-1-regular text-text-tertiary">{t("invoices.creditNote")}</div>}
              </div>
            );
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <NameAvatar name={inv.customerName} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-body-medium text-text-primary">{inv.customerName}</div>
                <div className="ident text-caption-1-regular text-text-tertiary">
                  {number}
                  {inv.type === "CREDIT_NOTE" && <span className="font-sans"> · {t("invoices.creditNote")}</span>}
                </div>
              </div>
            </div>
          );
        },
      },
      { accessorKey: "issueDate", header: t("col.date"), cell: ({ row }) => <span className="num text-text-secondary">{fmtDate(row.original.issueDate)}</span> },
      {
        accessorKey: "dueDate",
        header: t("col.due"),
        cell: ({ row }) => {
          const inv = row.original;
          return inv.state === "DRAFT" ? <span className="num text-text-secondary">{fmtDate(inv.dueDate)}</span> : <DueCell dueDate={inv.dueDate} today={today} open={inv.open} t={t} locale={locale} />;
        },
      },
      {
        id: "gross",
        accessorFn: (r) => Number(r.totalGross),
        header: t("col.gross"),
        cell: ({ row }) => <Money value={row.original.totalGross} locale={locale} bare className="text-body-medium" />,
      },
      {
        id: "remaining",
        accessorFn: (r) => Number(r.remaining),
        header: t("col.remaining"),
        cell: ({ row }) =>
          row.original.open ? (
            <Chip variant="caption" color={row.original.overdue ? "rose" : "gray"}>
              <Money value={row.original.remaining} locale={locale} bare />
            </Chip>
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      },
      { id: "status", enableSorting: false, header: t("col.status"), cell: ({ row }) => <StatusChip inv={row.original} t={t} /> },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowMenu inv={row.original} onIssue={() => setConfirm({ kind: "issue", id: row.original.id })} onCredit={() => setConfirm({ kind: "credit", id: row.original.id })} />
          </div>
        ),
      },
    ],
    [t, locale, today, hideCustomer],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (r) => r.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const headers = table.getHeaderGroups()[0]!.headers;
  const totalPages = table.getPageCount();
  const filtered = !!(q || status !== "all" || customer !== "all" || period !== "all" || tab !== "all");
  const alignEnd = new Set(["gross", "remaining", "actions"]);
  const widths: Record<string, string> = { invoice: "w-[26%]", issueDate: "w-[110px]", dueDate: "w-[140px]", gross: "w-[130px]", remaining: "w-[130px]", status: "w-[150px]", actions: "w-[56px]" };

  const clear = () => {
    setTab("all");
    setQ("");
    setStatus("all");
    setCustomer("all");
    setPeriod("all");
    resetPage();
  };

  const onConfirm = async () => {
    if (!confirm) return;
    const res = confirm.kind === "issue" ? await issueInvoice(confirm.id) : await createCreditNote(confirm.id);
    if (!res.ok) return void toast.error(res.error.message);
    if (confirm.kind === "issue") toast.success(t("invoice.issuedToast"));
    else {
      toast.success(t("invoice.creditCreatedToast"));
      router.push(`/factures/${res.data.id}/modifier`);
    }
  };

  const statusOptions = [{ key: "all", label: t("lists.allStatuses") }, ...STATUSES.map((k) => ({ key: k, label: t(`status.${k}`) }))];
  const customerOptions = [{ key: "all", label: t("lists.allCustomers") }, ...customers.map((c) => ({ key: c, label: c }))];
  const periodOptions = [{ key: "all", label: t("lists.allPeriods") }, ...PERIODS.map((k) => ({ key: k, label: t(`period.${k}`) }))];

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
      <Tabs selectedKey={tab} onSelectionChange={(k) => set(setTab)(k as TabKey)} className="min-w-max">
        <TabList aria-label={t("invoices.filters")}>
          {TABS.map((x) => (
            <Tab key={x} id={x} count={counts[x]}>
              {t(`invoices.tab.${x}`)}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      </div>

      <ListCard className={totalPages > 1 ? "pb-3" : "pb-0"}>
        <ListToolbar count={<><span className="num">{data.length}</span> {t(data.length === 1 ? "invoices.countOne" : "invoices.count")}</>}>
          <FilterSelect label={t("filter.status")} value={status} onChange={set(setStatus)} options={statusOptions} />
          {!hideCustomer && <FilterSelect label={t("filter.customer")} value={customer} onChange={set(setCustomer)} options={customerOptions} />}
          <FilterSelect label={t("filter.period")} value={period} onChange={set(setPeriod)} options={periodOptions} />
          <SearchField
            aria-label={t("common.search")}
            clearLabel={t("lists.clearSearch")}
            placeholder={t("invoices.search")}
            value={q}
            onChange={set(setQ)}
            className="min-w-[180px] flex-1 sm:w-[200px] sm:flex-none"
          />
        </ListToolbar>

        {data.length === 0 ? (
          <div className="mt-2 border-t border-separator-border">
            {invoices.length === 0 ? (
              <EmptyState icon={RiFileList3Line} title={t("invoices.emptyTitle")} body={t("invoices.emptyBody")}>
                <ButtonLink href="/factures/nouvelle" leadingIcon={RiAddLine} className="mt-1">{t("invoices.createFirst")}</ButtonLink>
              </EmptyState>
            ) : (
              <EmptyState icon={RiFileList3Line} title={q ? t("invoices.noMatch", { q }) : t("invoices.emptyView")} body={q ? t("invoices.noMatchHint") : t("invoices.emptyViewHint")}>
                {filtered && <Button variant="secondary" onClick={clear} className="mt-1">{t("invoices.clearFilters")}</Button>}
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            <div className="mt-2 hidden md:block">
              <RouterBoundary>
                <Table aria-label={t("lists.invoicesTable")} selectionMode="none" className="min-w-[860px] table-fixed">
                  <TableHeader>
                    {headers.map((h) => (
                      <TableColumn key={h.id} id={h.id} isRowHeader={h.id === "invoice"} className={cx(widths[h.id], alignEnd.has(h.id) && "text-end")}>
                        <div className={cx("flex items-center", alignEnd.has(h.id) && "justify-end")}>
                          <SortHeader header={h} label={headerLabel(h)} />
                        </div>
                      </TableColumn>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} id={row.id} href={`/factures/${row.original.id}`} className="cursor-pointer hover:bg-background-secondary-default">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cx(alignEnd.has(cell.column.id) && "text-end")}>
                            {cell.column.columnDef.cell && typeof cell.column.columnDef.cell === "function" ? cell.column.columnDef.cell(cell.getContext()) : null}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </RouterBoundary>
            </div>

            <ul className="mt-2 divide-y divide-separator-border border-t border-separator-border md:hidden">
              {rows.map((row) => {
                const inv = row.original;
                return (
                  <li key={row.id} className="relative flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      {!hideCustomer && <NameAvatar name={inv.customerName} size="md" />}
                      <div className="min-w-0 flex-1">
                        <a href={`/factures/${inv.id}`} className="block truncate text-body-medium text-text-primary after:absolute after:inset-0">
                          {hideCustomer ? (inv.number ?? t("invoices.noNumber")) : inv.customerName}
                        </a>
                        {!hideCustomer && <div className="ident text-caption-1-regular text-text-tertiary">{inv.number ?? <span className="font-sans">{t("invoices.noNumber")}</span>}</div>}
                      </div>
                      <div className="relative z-10">
                        <RowMenu inv={inv} onIssue={() => setConfirm({ kind: "issue", id: inv.id })} onCredit={() => setConfirm({ kind: "credit", id: inv.id })} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusChip inv={inv} t={t} />
                        {inv.state !== "DRAFT" && inv.open && <DueCell dueDate={inv.dueDate} today={today} open t={t} locale={locale} />}
                      </div>
                      <div className="text-end">
                        <Money value={inv.totalGross} locale={locale} className="text-headline-medium text-text-primary" />
                        {inv.open && (
                          <div className="text-caption-1-regular text-text-secondary">
                            {t("col.remaining")} <Money value={inv.remaining} locale={locale} bare />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div className="border-t border-separator-border px-3 pt-3">
                <Pagination
                  page={pagination.pageIndex + 1}
                  totalPages={totalPages}
                  onChange={(p) => table.setPageIndex(p - 1)}
                  previousLabel={t("common.previous")}
                  nextLabel={t("common.next")}
                  aria-label={t("lists.pagination")}
                />
              </div>
            )}
          </>
        )}
      </ListCard>

      <AlertDialog
        isOpen={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="default"
        icon={confirm?.kind === "credit" ? RiFileReduceLine : RiSendPlaneLine}
        title={confirm?.kind === "credit" ? t("invoice.creditConfirmTitle") : t("invoice.issueConfirmTitle")}
        description={confirm?.kind === "credit" ? t("invoice.creditConfirmBody") : t("invoice.issueConfirmBody")}
        confirmLabel={confirm?.kind === "credit" ? t("invoice.credit") : t("invoice.issue")}
        cancelLabel={t("common.cancel")}
        onConfirm={onConfirm}
      />
    </div>
  );
}
