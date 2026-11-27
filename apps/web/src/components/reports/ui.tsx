"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RiArrowLeftSLine, RiArrowRightSLine, RiDownload2Line, RiInformationLine, RiPrinterLine } from "@remixicon/react";
import { Card } from "@/components/app/layout";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { fmtDate, fmtNumber, groupDigits, ICE_GROUPS } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { formatPeriod, parsePeriod, periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { cx } from "@/utils/cx";

/** Replaces one or more search params, keeping the others. */
export function useQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** Month or quarter, with previous and next arrows. Lives in the URL. */
export function PeriodPicker({ period, kinds }: { period: string; kinds: readonly Period["kind"][] }) {
  const { t, locale } = useI18n();
  const query = useQuery();
  const p = parsePeriod(period)!;
  const go = (q: Period) => query({ period: formatPeriod(q) });
  const switchKind = (kind: Period["kind"]) => {
    if (kind === p.kind) return;
    go(kind === "quarter" ? { kind, year: p.year, quarter: Math.ceil((p as { month: number }).month / 3) } : { kind, year: p.year, month: ((p as { quarter: number }).quarter - 1) * 3 + 1 });
  };
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <div className="flex items-center gap-1">
        <IconButton icon={RiArrowLeftSLine} aria-label={t("reports.prev")} onClick={() => go(shiftPeriod(p, -1))} className="rtl:-scale-x-100" />
        <span aria-live="polite" className="min-w-[10rem] px-2 text-center text-body-medium text-text-primary first-letter:uppercase">{periodLabel(p, locale)}</span>
        <IconButton icon={RiArrowRightSLine} aria-label={t("reports.next")} onClick={() => go(shiftPeriod(p, 1))} className="rtl:-scale-x-100" />
      </div>
      {kinds.length > 1 && (
        <SegmentedControl aria-label={t("reports.periodKind")} selectedKeys={[p.kind]} onSelectionChange={(k) => k && switchKind([...k][0] as Period["kind"])}>
          <SegmentedControlItem id="month">{t("reports.month")}</SegmentedControlItem>
          <SegmentedControlItem id="quarter">{t("reports.quarter")}</SegmentedControlItem>
        </SegmentedControl>
      )}
    </div>
  );
}

export function Disclaimer() {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-background-secondary-default px-4 py-3 text-body-regular text-text-secondary">
      <RiInformationLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
      {t("reports.disclaimer")}
    </p>
  );
}

export function Notices({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-2" aria-label="Notices">
      {items.map((n) => (
        <li key={n} className="rounded-2xl bg-status-orange-background px-4 py-3 text-body-regular text-status-orange-text">{n}</li>
      ))}
    </ul>
  );
}

/** Title, period, deadline: the first lines of a working paper. */
export function DocHeader({ title, period, from, to, lines }: { title: string; period: string; from: string; to: string; lines: [string, ReactNode][] }) {
  const { t, locale } = useI18n();
  const p = parsePeriod(period)!;
  return (
    <header className="grid gap-3 border-b border-border-button-default pb-4">
      <div>
        <h2 className="text-title-2-medium text-text-primary">{title}</h2>
        <p className="mt-0.5 text-body-regular text-text-secondary">
          <span className="first-letter:uppercase">{periodLabel(p, locale)}</span> · {t("reports.fromTo", { from: fmtDate(from), to: fmtDate(to) })}
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-body-regular sm:grid-cols-[auto_minmax(0,1fr)]">
        {lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="min-w-0 text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** A block of a statement: heading, optional actions on the right (hidden when printing), then the content. */
export function Block({ title, hint, actions, children }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-headline-semibold text-text-primary">{title}</h3>
          {hint && <p className="mt-0.5 text-body-regular text-text-secondary">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** The statement's card: the white sheet that holds the blocks. */
export function Sheet({ children }: { children: ReactNode }) {
  return <Card className="grid gap-6 p-5 sm:p-6 print:gap-5 print:rounded-none print:border-0 print:p-0">{children}</Card>;
}

/** Tables scroll inside their own box, so a wide table never widens the page. */
export function DataTable({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-table print:overflow-visible print:rounded-none">
      <table style={{ minWidth }} className="w-full border-collapse text-body-regular print:min-w-0! print:text-[11px]">
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, end, className }: { children?: ReactNode; end?: boolean; className?: string }) => (
  <th scope="col" className={cx("bg-background-secondary-default px-3 py-2 text-caption-1-medium whitespace-nowrap text-text-secondary print:px-1.5 print:py-1", end ? "text-end" : "text-start", className)}>
    {children}
  </th>
);

export const Td = ({ children, end, num, className, colSpan }: { children?: ReactNode; end?: boolean; num?: boolean; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cx("border-t border-separator-border px-3 py-2 align-top print:px-1.5 print:py-1", end ? "text-end" : "text-start", num && "num whitespace-nowrap", className)}>
    {children}
  </td>
);

/** An amount in a table cell: tabular figures, right-aligned by the cell. */
export const Amt = ({ v, muted }: { v: string; muted?: boolean }) => <span className={cx("num whitespace-nowrap", muted && "text-text-tertiary")}>{fmtNumber(v)}</span>;

export function CsvButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="small" variant="secondary" leadingIcon={RiDownload2Line} onClick={onClick}>
      {label}
    </Button>
  );
}

export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button variant="secondary" leadingIcon={RiPrinterLine} onClick={() => window.print()} className="print:hidden">
      {t("invoice.print")}
    </Button>
  );
}

export function EmptyRows({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border-button-default px-4 py-6 text-center text-body-regular text-text-secondary">{children}</p>;
}

/** A single figure the eye goes to: the result of the statement. */
export function Result({ label, value, tone, note }: { label: string; value: ReactNode; tone: "due" | "credit" | "neutral"; note?: string }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-1 rounded-2xl border px-5 py-4", tone === "due" ? "border-border-error-default/40 bg-status-rose-background text-status-rose-text" : tone === "credit" ? "border-accent-500/30 bg-status-lime-background text-status-lime-text" : "border-border-button-default bg-background-secondary-default text-text-primary")}>
      <div>
        <div className="text-body-medium">{label}</div>
        {note && <div className="mt-0.5 text-caption-1-regular opacity-80">{note}</div>}
      </div>
      <div className="text-title-1-semibold">{value}</div>
    </div>
  );
}

/** A number field applied to the URL on Enter or when it loses focus. */
export function AppliedAmount({ label, name, value, hint, bare }: { label: string; name: string; value: string; hint?: string; bare?: boolean }) {
  const query = useQuery();
  const [draft, setDraft] = useState(value);
  const apply = () => {
    const v = draft.trim().replace(/\s/g, "").replace(",", ".");
    if (v === value || (v === "" && value === "")) return;
    if (v !== "" && !/^\d{1,13}(\.\d{1,2})?$/.test(v)) return;
    query({ [name]: v === "" || Number(v) === 0 ? null : v });
  };
  return (
    <Input
      {...(bare ? { "aria-label": label } : { label })}
      hint={hint}
      value={draft}
      onChange={setDraft}
      inputMode="decimal"
      inputDir="ltr"
      onBlur={apply}
      onKeyDown={(e) => e.key === "Enter" && apply()}
      className={bare ? "w-44" : "w-full sm:w-56"}
    />
  );
}

/** IF and ICE of a third party, stacked in one cell; a missing identifier is flagged in red. */
export function IdCell({ ifNumber, ice }: { ifNumber: string | null; ice: string | null }) {
  const miss = <span className="text-text-error-primary">—</span>;
  return (
    <div dir="ltr" className="num grid w-max gap-0.5 text-start text-caption-1-regular leading-4 whitespace-nowrap">
      <span><span className="text-text-tertiary">IF </span>{ifNumber ?? miss}</span>
      <span><span className="text-text-tertiary">ICE </span>{ice ? groupDigits(ice, ICE_GROUPS) : miss}</span>
    </div>
  );
}

/** A percentage with the French decimal comma. */
export const pct = (v: string) => `${v.replace(".", ",")} %`;
