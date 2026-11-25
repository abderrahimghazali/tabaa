"use client";

import { MobileActionBar } from "@/components/app/mobile-actions";

import { useMemo, useState, useTransition } from "react";
import { RiAddLine, RiBox3Line } from "@remixicon/react";
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import type { ApiError, Item, ItemInput } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/base/drawer/drawer";
import { Input } from "@/components/base/input/input";
import { AlertDialog } from "@/components/base/modal/modal";
import { Notification } from "@/components/base/notification/notification";
import { NumberField } from "@/components/base/number-field/number-field";
import { Pagination } from "@/components/base/pagination/pagination";
import { SearchField } from "@/components/base/search-field/search-field";
import { Select, SelectItem } from "@/components/base/select/select";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { toast } from "@/components/base/toast/toast";
import { Money } from "@/components/app/money";
import { NameAvatar } from "@/components/app/name-avatar";
import { createItem, deleteItem, updateItem } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-client";
import { issuesAt } from "@/lib/result";
import { cx } from "@/utils/cx";
import { TopbarActions } from "./frame";
import { WriteOnly } from "@/components/app/write-only";
import { useCanAdmin, useCanWrite } from "@/lib/me-client";
import { EmptyState, ListCard, ListToolbar, SortHeader, headerLabel } from "./invoice/list-kit";

const PAGE = 10;

function ItemForm({
  initial,
  vatRates,
  onSaved,
  onPending,
}: {
  initial?: Item;
  vatRates: string[];
  onSaved: () => void;
  onPending: (p: boolean) => void;
}) {
  const t = useI18n().t;
  const [, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const [v, setV] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    unit: initial?.unit ?? "unité",
    unitPrice: initial?.unitPrice ?? "",
    vatRate: vatRates.find((r) => initial && Number(r) === Number(initial.vatRate)) ?? initial?.vatRate ?? vatRates[0] ?? "20",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const err = (p: string) => issuesAt(error, p);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: ItemInput = {
      name: v.name.trim(),
      description: v.description.trim() || undefined,
      unit: v.unit.trim() || "unité",
      unitPrice: v.unitPrice === "" ? "0" : v.unitPrice,
      vatRate: v.vatRate,
    };
    setError(null);
    onPending(true);
    start(async () => {
      const res = initial ? await updateItem(initial.id, input) : await createItem(input);
      onPending(false);
      if (res.ok) {
        toast.success(initial ? t("items.updated") : t("items.created"));
        onSaved();
      } else setError(res.error);
    });
  };

  return (
    <form id="item-form" onSubmit={submit} className="flex flex-col gap-4 py-2" noValidate>
      {error && (
        <Notification
          status="error"
          dismissible={false}
          title={error.code === "VALIDATION" ? t("error.fixFields") : error.message}
        />
      )}
      <Input label={t("items.name")} maxLength={200} value={v.name} onChange={(s) => set("name", s)} isRequired isInvalid={!!err("name")} errorMessage={err("name")} />
      <Input label={t("items.description")} value={v.description} onChange={(s) => set("description", s)} isInvalid={!!err("description")} errorMessage={err("description")} />
      <div className="grid grid-cols-2 gap-4">
        <Input className="max-sm:order-2" label={t("editor.unit")} maxLength={20} value={v.unit} onChange={(s) => set("unit", s)} isInvalid={!!err("unit")} errorMessage={err("unit")} />
        <NumberField
          label={t("items.price")}
          className="col-span-2 max-sm:order-1"
          hint={err("unitPrice")}
          isInvalid={!!err("unitPrice")}
          minValue={0}
          formatOptions={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          value={v.unitPrice === "" ? Number.NaN : Number(v.unitPrice)}
          onChange={(n) => set("unitPrice", Number.isNaN(n) ? "" : String(n))}
        />
        <Select className="max-sm:order-3" label={t("lists.vatRate")} selectedKey={v.vatRate} onSelectionChange={(k) => set("vatRate", String(k))}>
          {(vatRates.includes(v.vatRate) ? vatRates : [...vatRates, v.vatRate]).map((r) => (
            <SelectItem key={r} id={r} textValue={`${r} %`}>
              <span className="num">{r} %</span>
            </SelectItem>
          ))}
        </Select>
      </div>
    </form>
  );
}

export function ItemsView({ items, vatRates, openNew }: { items: Item[]; vatRates: string[]; openNew?: boolean }) {
  const { t, locale } = useI18n();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Item | "new" | null>(openNew && canWrite ? "new" : null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE });

  const data = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((it) => !term || `${it.name} ${it.description ?? ""}`.toLowerCase().includes(term));
  }, [items, q]);

  const columns = useMemo<ColumnDef<Item>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("items.name"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <NameAvatar name={row.original.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-body-medium text-text-primary">{row.original.name}</div>
              {row.original.description && <div className="truncate text-caption-1-regular text-text-tertiary">{row.original.description}</div>}
            </div>
          </div>
        ),
      },
      { id: "unit", accessorKey: "unit", header: t("editor.unit"), cell: ({ row }) => <span className="text-text-secondary">{row.original.unit}</span> },
      {
        id: "price",
        accessorFn: (r) => Number(r.unitPrice),
        header: t("items.price"),
        cell: ({ row }) => <Money value={row.original.unitPrice} locale={locale} bare className="text-body-medium" />,
      },
      {
        id: "vat",
        accessorFn: (r) => Number(r.vatRate),
        header: t("editor.vat"),
        cell: ({ row }) => <Chip variant="caption" color="gray"><span className="num">{Number(row.original.vatRate)} %</span></Chip>,
      },
    ],
    [t, locale],
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
  const end = new Set(["price", "vat"]);

  const remove = async () => {
    if (!deleting) return;
    const res = await deleteItem(deleting.id);
    if (res.ok) {
      setEditing(null);
      toast.success(t("items.deleted"));
    } else toast.error(res.error.message);
  };

  const canAdmin = useCanAdmin();

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <Button leadingIcon={RiAddLine} onClick={() => setEditing("new")}>
            {t("items.new")}
          </Button>
        </WriteOnly>
      </TopbarActions>
      <WriteOnly>
        <MobileActionBar>
          <Button leadingIcon={RiAddLine} onClick={() => setEditing("new")}>
            {t("items.new")}
          </Button>
        </MobileActionBar>
      </WriteOnly>

      <ListCard className={totalPages > 1 ? "pb-3" : "pb-0"}>
        <ListToolbar count={<><span className="num">{data.length}</span> {t(data.length === 1 ? "items.countOne" : "items.count")}</>}>
          <SearchField
            aria-label={t("common.search")}
            clearLabel={t("lists.clearSearch")}
            placeholder={t("items.search")}
            value={q}
            onChange={(v) => { setQ(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="min-w-0 flex-1 nav:w-[200px] nav:min-w-[180px] nav:flex-none"
          />
        </ListToolbar>

        {data.length === 0 ? (
          <div className="mt-2 border-t border-separator-border">
            <EmptyState icon={RiBox3Line} title={q ? t("customers.noMatch", { q }) : t("items.emptyTitle")} body={q ? t("invoices.noMatchHint") : t("items.emptyBody")}>
              {!q && canWrite && <Button className="mt-1" leadingIcon={RiAddLine} onClick={() => setEditing("new")}>{t("items.createFirst")}</Button>}
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-separator-border border-t border-separator-border nav:hidden">
              {rows.map((row) => {
                const it = row.original;
                const body = (
                  <>
                    <NameAvatar name={it.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body-medium text-text-primary wrap-break-word">{it.name}</div>
                      {it.description && <div className="text-caption-1-regular text-text-tertiary wrap-break-word">{it.description}</div>}
                    </div>
                    <div className="shrink-0 text-end">
                      <Money value={it.unitPrice} locale={locale} className="text-body-medium text-text-primary" />
                      <div className="text-caption-1-regular text-text-secondary">
                        {it.unit} · <span className="num">{Number(it.vatRate)} %</span>
                      </div>
                    </div>
                  </>
                );
                return (
                  <li key={row.id}>
                    {canWrite ? (
                      <button type="button" onClick={() => setEditing(it)} className="flex min-h-14 w-full items-start gap-3 p-4 text-start">
                        {body}
                      </button>
                    ) : (
                      <div className="flex min-h-14 items-start gap-3 p-4">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 hidden nav:block">
              <Table aria-label={t("lists.itemsTable")} selectionMode="none" onRowAction={(key) => canWrite && setEditing(items.find((i) => i.id === key) ?? null)} className="min-w-[640px]">
                <TableHeader>
                  {headers.map((h) => (
                    <TableColumn key={h.id} id={h.id} isRowHeader={h.id === "name"} className={cx(end.has(h.id) && "text-end")}>
                      <div className={cx("flex items-center", end.has(h.id) && "justify-end")}>
                        <SortHeader header={h} label={headerLabel(h)} />
                      </div>
                    </TableColumn>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} id={row.id} className="cursor-pointer hover:bg-background-secondary-default">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cx(end.has(cell.column.id) && "text-end")}>
                          {typeof cell.column.columnDef.cell === "function" ? cell.column.columnDef.cell(cell.getContext()) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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

      <Drawer isOpen={editing !== null} onOpenChange={(o) => !o && setEditing(null)} placement="end" aria-label={editing === "new" || editing === null ? t("items.new") : editing.name}>
        {({ close }) => (
          <>
            <DrawerHeader title={editing === "new" || editing === null ? t("items.new") : editing.name} closeLabel={t("common.close")} />
            <DrawerBody>
              {editing && (
                <ItemForm
                  key={editing === "new" ? "new" : editing.id}
                  initial={editing === "new" ? undefined : editing}
                  vatRates={vatRates}
                  onPending={setPending}
                  onSaved={close}
                />
              )}
            </DrawerBody>
            <DrawerFooter>
              {editing && editing !== "new" && (
                canAdmin && <Button variant="danger" onClick={() => setDeleting(editing)} className="sm:me-auto">
                  {t("common.delete")}
                </Button>
              )}
              <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
              <Button type="submit" form="item-form" disabled={pending}>{t("common.save")}</Button>
            </DrawerFooter>
          </>
        )}
      </Drawer>

      <AlertDialog
        isOpen={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("items.deleteTitle")}
        description={t("items.deleteBody", { name: deleting?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
      />
    </div>
  );
}
