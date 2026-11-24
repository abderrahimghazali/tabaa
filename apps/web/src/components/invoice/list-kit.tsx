"use client";

import type { ComponentType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { flexRender, type Header } from "@tanstack/react-table";
import { Select, SelectItem } from "@/components/base/select/select";
import { ChevronSortDown } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

/** Bordered card that holds a list: toolbar, table, pagination (BoardUI data-table anatomy). */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("flex w-full flex-col rounded-2xl border border-border-table pt-2", className)}>{children}</section>;
}

export function ListToolbar({ count, children }: { count: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-start gap-3 px-3 py-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-medium whitespace-nowrap text-text-primary">{count}</p>
      <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">{children}</div>
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
