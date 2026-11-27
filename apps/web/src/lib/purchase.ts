import type { ApiError, Purchase, PurchaseSummary } from "@facture/core";
import type { Key, T } from "./i18n";
import type { ChipColor } from "@/components/base/badges/chip";
import { statusChip } from "./status";

export type PurchaseStatusKey = "toApprove" | "rejected" | "approved" | "partial" | "paid" | "overdue";

type Statusable = Pick<Purchase | PurchaseSummary, "state" | "paymentStatus" | "overdue">;

/** One status per purchase invoice, in the vocabulary of sales invoices (partial, paid, overdue) plus its approval step. */
export function purchaseStatus(p: Statusable): PurchaseStatusKey {
  if (p.state === "TO_APPROVE") return "toApprove";
  if (p.state === "REJECTED") return "rejected";
  if (p.paymentStatus === "PAID") return "paid";
  if (p.overdue) return "overdue";
  if (p.paymentStatus === "PARTIAL") return "partial";
  return "approved";
}

export const purchaseChip: Record<PurchaseStatusKey, ChipColor> = {
  toApprove: "yellow",
  rejected: "rose",
  approved: statusChip.issued,
  partial: statusChip.partial,
  paid: statusChip.paid,
  overdue: statusChip.overdue,
};

export const PURCHASE_CATEGORIES = ["GOODS", "SERVICES", "FIXED_ASSET"] as const;

const cents = (v: string | number) => Math.round((Number(v) || 0) * 100);
export const toCents = cents;
export const fromCents = (c: number) => (c / 100).toFixed(2);

/** VAT as computed from a net amount and a rate, to the centime. */
export const vatOf = (net: string, rate: string) => fromCents(Math.round((cents(net) * (Number(rate) || 0)) / 100));

const KNOWN = ["DUPLICATE", "NOT_EDITABLE", "NOT_APPROVED", "HAS_PAYMENTS", "OVERPAYMENT"];

/** A translated message for the purchase error codes; anything else keeps the server's own message. */
export function purchaseError(e: ApiError, t: T): string {
  return KNOWN.includes(e.code) ? t(`purchases.err.${e.code}` as Key) : (e.issues?.[0]?.message ?? e.message);
}

const PAYMENT_RULES = ["PAYMENT-EXCEEDS", "PAYMENT-VAT-EXCEEDS", "PAYMENT-POSITIVE", "PAYMENT-NEGATIVE"];

/** Replaces the server's French messages for the payment validation rules by translated ones. */
export function translatePaymentError(e: ApiError | null, t: T): ApiError | null {
  if (!e?.issues) return e;
  return { ...e, issues: e.issues.map((i) => (PAYMENT_RULES.includes(i.rule) ? { ...i, message: t(`payment.err.${i.rule}` as Key) } : i)) };
}
