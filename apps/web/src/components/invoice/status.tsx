import { Chip } from "@/components/base/badges/chip";
import { daysBetween, daysLabel, fmtDate, type Locale } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { statusChip, statusOf } from "@/lib/status";

type Statusable = { state: string; type: string; paymentStatus: string; overdue: boolean };

export function StatusChip({ inv, t }: { inv: Statusable; t: T }) {
  const s = statusOf(inv);
  return <Chip color={statusChip[s]} variant="caption">{t(`status.${s}`)}</Chip>;
}

export function dueInfo(dueDate: string, today: string, t: T, locale: Locale) {
  const days = daysBetween(dueDate, today);
  const text = days < 0 ? t("due.late", { n: daysLabel(days, locale) }) : days === 0 ? t("due.today") : t("due.in", { n: daysLabel(days, locale) });
  const color = days < 0 ? "rose" : days <= 14 ? "yellow" : "neutral";
  return { days, text, color, tone: color === "rose" ? "danger" : color === "yellow" ? "warn" : "neutral" } as const;
}

export function DueCell({ dueDate, today, open, t, locale }: { dueDate: string; today: string; open: boolean; t: T; locale: Locale }) {
  const info = dueInfo(dueDate, today, t, locale);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="num">{fmtDate(dueDate)}</span>
      {open && (info.color === "neutral" ? <span className="text-caption-1-regular text-text-tertiary">{info.text}</span> : <Chip variant="caption" color={info.color}>{info.text}</Chip>)}
    </div>
  );
}

/** Legacy name, kept until every caller uses StatusChip. */
export const StatusBadge = StatusChip;
