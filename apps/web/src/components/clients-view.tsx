"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RiAddLine, RiGroupLine } from "@remixicon/react";
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import type { Party } from "@facture/core";
import { Chip, type ChipColor } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Pagination } from "@/components/base/pagination/pagination";
import { SearchField } from "@/components/base/search-field/search-field";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { Money } from "@/components/app/money";
import { NameAvatar } from "@/components/app/name-avatar";
import { groupDigits, ICE_GROUPS } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";
import { TopbarActions } from "./frame";
import { EmptyState, FilterSelect, ListCard, ListToolbar, RouterBoundary, SortHeader, headerLabel } from "./invoice/list-kit";
import { WriteOnly } from "@/components/app/write-only";
import { useCanWrite } from "@/lib/me-client";
import { PartyDrawer } from "./party-form";

const PAGE = 10;
const TYPES = ["BUSINESS", "PUBLIC", "CONSUMER", "FOREIGN"] as const;
const typeColor: Record<Party["type"], ChipColor> = { BUSINESS: "gray", PUBLIC: "purple", CONSUMER: "cyan", FOREIGN: "yellow" };

type Row = Party & { owed: number };

export function ClientsView({ parties, outstanding, openNew }: { parties: Party[]; outstanding: Record<string, string>; openNew?: boolean }) {
  const { t, locale } = useI18n();
  const [creating, setCreating] = useState(!!openNew);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE });
  const hasOutstanding = Object.keys(outstanding).length > 0;
  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const data = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return parties
      .filter((p) => (type === "all" || p.type === type) && (!term || `${p.name} ${p.ice ?? ""}`.toLowerCase().includes(term)))
      .map((p) => ({ ...p, owed: Number(outstanding[p.id] ?? 0) }));
  }, [parties, q, type, outstanding]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("customers.name"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <NameAvatar name={row.original.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-body-medium text-text-primary">{row.original.name}</div>
              {row.original.email && <div className="truncate text-caption-1-regular text-text-tertiary">{row.original.email}</div>}
            </div>
          </div>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: t("customers.type"),
        cell: ({ row }) => <Chip variant="caption" color={typeColor[row.original.type]}>{t(`partyType.${row.original.type}`)}</Chip>,
      },
      {
        id: "ice",
        enableSorting: false,
        header: "ICE",
        cell: ({ row }) => (row.original.ice ? <span className="ident text-body-2-medium">{groupDigits(row.original.ice, ICE_GROUPS)}</span> : <span className="text-text-tertiary">—</span>),
      },
      { id: "city", accessorFn: (r) => r.address.city, header: t("field.city"), cell: ({ row }) => <span className="text-text-secondary">{row.original.address.city}</span> },
      ...(hasOutstanding
        ? [
            {
              id: "owed",
              accessorKey: "owed",
              header: t("customers.outstanding"),
              cell: ({ row }: { row: { original: Row } }) =>
                row.original.owed > 0 ? (
                  <Chip variant="caption" color="yellow">
                    <Money value={row.original.owed} locale={locale} bare />
                  </Chip>
                ) : (
                  <span className="text-text-tertiary">—</span>
                ),
            } satisfies ColumnDef<Row>,
          ]
        : []),
    ],
    [t, locale, hasOutstanding],
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
  const canWrite = useCanWrite();
  const headers = table.getHeaderGroups()[0]!.headers;
  const totalPages = table.getPageCount();

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <Button leadingIcon={RiAddLine} onClick={() => setCreating(true)}>
            {t("customers.new")}
          </Button>
        </WriteOnly>
      </TopbarActions>

      <ListCard className={totalPages > 1 ? "pb-3" : "pb-0"}>
        <ListToolbar count={<><span className="num">{data.length}</span> {t(data.length === 1 ? "customers.countOne" : "customers.count")}</>}>
          <FilterSelect
            label={t("customers.type")}
            value={type}
            onChange={(k) => { setType(k); resetPage(); }}
            options={[{ key: "all", label: t("lists.allTypes") }, ...TYPES.map((k) => ({ key: k, label: t(`partyType.${k}`) }))]}
          />
          <SearchField
            aria-label={t("common.search")}
            clearLabel={t("lists.clearSearch")}
            placeholder={t("customers.search")}
            value={q}
            onChange={(v) => { setQ(v); resetPage(); }}
            className="min-w-[180px] flex-1 sm:w-[200px] sm:flex-none"
          />
        </ListToolbar>

        {data.length === 0 ? (
          <div className="mt-2 border-t border-separator-border">
            <EmptyState icon={RiGroupLine} title={q ? t("customers.noMatch", { q }) : t("customers.emptyTitle")} body={q ? t("invoices.noMatchHint") : t("customers.emptyBody")}>
              {!q && canWrite && <Button className="mt-1" leadingIcon={RiAddLine} onClick={() => setCreating(true)}>{t("customers.createFirst")}</Button>}
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="mt-2 hidden md:block">
              <RouterBoundary>
                <Table aria-label={t("lists.customersTable")} selectionMode="none" className="min-w-[760px]">
                  <TableHeader>
                    {headers.map((h) => (
                      <TableColumn key={h.id} id={h.id} isRowHeader={h.id === "name"} className={cx(h.id === "owed" && "text-end")}>
                        <div className={cx("flex items-center", h.id === "owed" && "justify-end")}>
                          <SortHeader header={h} label={headerLabel(h)} />
                        </div>
                      </TableColumn>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} id={row.id} href={`/clients/${row.original.id}`} className="cursor-pointer hover:bg-background-secondary-default">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cx(cell.column.id === "owed" && "text-end")}>
                            {typeof cell.column.columnDef.cell === "function" ? cell.column.columnDef.cell(cell.getContext()) : null}
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
                const p = row.original;
                return (
                  <li key={row.id} className="relative flex items-center gap-3 p-4">
                    <NameAvatar name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/clients/${p.id}`} className="block truncate text-body-medium text-text-primary after:absolute after:inset-0">{p.name}</Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-caption-1-regular text-text-tertiary">
                        <span>{p.address.city}</span>
                        {p.ice && <span className="ident">{groupDigits(p.ice, ICE_GROUPS)}</span>}
                      </div>
                    </div>
                    {p.owed > 0 && <Chip variant="caption" color="yellow"><Money value={p.owed} locale={locale} bare /></Chip>}
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

      <PartyDrawer isOpen={creating} onOpenChange={setCreating} />
    </div>
  );
}
