import { RiAlertLine } from "@remixicon/react";
import type { Purchase, PurchaseSummary } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import type { T } from "@/lib/i18n";
import { purchaseChip, purchaseStatus } from "@/lib/purchase";

export function PurchaseStatusChip({ p, t }: { p: Pick<Purchase | PurchaseSummary, "state" | "paymentStatus" | "overdue">; t: T }) {
  const s = purchaseStatus(p);
  return <Chip color={purchaseChip[s]} variant="caption">{t(s === "partial" || s === "paid" || s === "overdue" ? `status.${s}` : `pstatus.${s}`)}</Chip>;
}

export function DisputeChip({ t }: { t: T }) {
  return <Chip color="orange" variant="caption">{t("purchases.dispute")}</Chip>;
}

export function WarningMark({ count, t }: { count: number; t: T }) {
  if (count <= 0) return null;
  return (
    <span title={t("purchases.warningsCount", { n: count })} className="inline-flex items-center gap-0.5 text-status-orange-text">
      <RiAlertLine className="size-[18px]" aria-hidden />
      <span className="num text-caption-1-medium">{count}</span>
      <span className="sr-only">{t("purchases.warningsCount", { n: count })}</span>
    </span>
  );
}
