"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { flexRender, type Header } from "@tanstack/react-table";
import { RiFilter3Line } from "@remixicon/react";
import { Counter } from "@/components/base/badges/counter";
import { Button } from "@/components/base/buttons/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { Select, SelectItem } from "@/components/base/select/select";
import { useI18n } from "@/lib/i18n-client";
import { ChevronSortDown } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

/** Bordered card that holds a list: toolbar, table, pagination (BoardUI data-table anatomy). */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("flex w-full flex-col rounded-2xl border border-border-table pt-2", className)}>{children}</section>;
}

export function ListToolbar({ count, children }: { count: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-start gap-3 px-3 py-1 nav:flex-row nav:items-center nav:justify-between">
      <p className="text-body-medium whitespace-nowrap text-text-primary">{count}</p>
      <div className="flex w-full items-center gap-2.5 nav:w-auto nav:flex-wrap nav:justify-end">{children}</div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <Select aria-label={label} className="shrink-0" popoverClassName="min-w-48" selectedKey={value} onSelectionChange={(k) => onChange(String(k))}>
      {options.map((o) => (
        <SelectItem key={o.key} id={o.key} textValue={o.label}>
          {o.label}
        </SelectItem>
      ))}
    </Select>
  );
}

export function SortHeader<T>({ header, label }: { header: Header<T, unknown>; label: ReactNode }) {
  const dir = header.column.getIsSorted();
  if (!header.column.getCanSort()) return <>{label}</>;
  return (
    <button type="button" onClick={header.column.getToggleSortingHandler()} className="flex cursor-pointer items-center gap-0.5">
      {label}
      <ChevronSortDown className={cx("size-6 shrink-0 transition-[transform,color] duration-150", dir === "asc" && "rotate-180", dir ? "text-text-secondary" : "text-text-tertiary")} />
    </button>
  );
}

export function headerLabel<T>(header: Header<T, unknown>) {
  return flexRender(header.column.columnDef.header, header.getContext());
}

/** Lets React Aria rows with an href navigate through the Next router. */
export function RouterBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <RouterProvider navigate={(href) => router.push(href as string)}>{children}</RouterProvider>;
}

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export function EmptyState({ icon: Icon, title, body, children }: { icon: IconComponent; title: ReactNode; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-background-secondary-default text-foreground-icon-secondary">
        <Icon className="size-5" aria-hidden />
      </span>
      <h2 className="text-headline-medium text-text-primary">{title}</h2>
      <p className="max-w-sm text-body-regular text-text-secondary">{body}</p>
      {children}
    </div>
  );
}

export type MobileFilter = { key: string; label: string; value: string; onChange: (key: string) => void; options: { key: string; label: string }[] };

/** Phone-only: one "Filtres" button (with a count of active filters) that opens the filters in a bottom sheet. */
export function MobileFilters({ filters, onReset }: { filters: MobileFilter[]; onReset: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const active = filters.filter((f) => f.value !== "all").length;
  return (
    <>
      <Button variant="secondary" leadingIcon={RiFilter3Line} onClick={() => setOpen(true)} className="shrink-0 nav:hidden">
        {t("mob.filters")}
        {active > 0 && <Counter color="primary" className="ms-1.5">{active}</Counter>}
      </Button>
      <Modal isOpen={open} onOpenChange={setOpen} size="sm" aria-label={t("mob.filters")}>
        {({ close }) => (
          <>
            <ModalHeader title={t("mob.filters")} closeLabel={t("common.close")} />
            <ModalBody>
              <div className="grid gap-4 pt-1">
                {filters.map((f) => (
                  <Select key={f.key} label={f.label} className="w-full" triggerClassName="w-full" selectedKey={f.value} onSelectionChange={(k) => f.onChange(String(k))}>
                    {f.options.map((o) => (
                      <SelectItem key={o.key} id={o.key} textValue={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </Select>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={onReset} disabled={active === 0}>
                {t("mob.reset")}
              </Button>
              <Button onClick={close}>{t("mob.apply")}</Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </>
  );
}
