import type { ChipColor } from "@/components/base/badges/chip";

export type StatusKey = "draft" | "issued" | "partial" | "paid" | "overdue" | "credit";
export type StampTone = "neutral" | "encre" | "ok" | "warn" | "danger";

export function statusOf(x: { state: string; type: string; paymentStatus: string; overdue: boolean }): StatusKey {
  if (x.state === "DRAFT") return "draft";
  if (x.type === "CREDIT_NOTE") return "credit";
  if (x.paymentStatus === "PAID") return "paid";
  if (x.overdue) return "overdue";
  if (x.paymentStatus === "PARTIALLY_PAID") return "partial";
  return "issued";
}

/** BoardUI Chip colour per invoice status. */
export const statusChip: Record<StatusKey, ChipColor> = {
  draft: "gray",
  issued: "blue",
  partial: "purple",
  paid: "lime",
  overdue: "rose",
  credit: "yellow",
};

export const statusStamp: Record<StatusKey, StampTone> = {
  draft: "neutral",
  issued: "encre",
  partial: "encre",
  paid: "ok",
  overdue: "danger",
  credit: "warn",
};
