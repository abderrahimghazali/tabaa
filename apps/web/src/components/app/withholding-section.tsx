"use client";

import { Button } from "@/components/base/buttons/button";
import { DecimalField } from "@/components/invoice/fields";
import { fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { fromCents, toCents } from "@/lib/purchase";

/**
 * "Retenue à la source" on a payment, shared by sales and purchases: two amounts withheld and paid to the Treasury,
 * with helpers that fill them. `side` only changes the sentence: who withheld from whom.
 */
export function WithholdingSection({
  side,
  open,
  onToggle,
  totalNet,
  totalVat,
  vatLeft,
  vat,
  tax,
  onChange,
  errors,
}: {
  side: "sale" | "purchase";
  open: boolean;
  onToggle: () => void;
  totalNet: string;
  totalVat: string;
  /** VAT of the document not yet withheld, in cents. */
  vatLeft: number;
  vat: string;
  tax: string;
  onChange: (field: "vat" | "tax", value: string) => void;
  errors?: { vat?: string; tax?: string };
}) {
  const { t } = useI18n();
  const held = toCents(vat) + toCents(tax);
  const helper = (label: string, field: "vat" | "tax", cents: number) => (
    <Button size="small" variant="secondary" onClick={() => onChange(field, fromCents(field === "vat" ? Math.min(cents, vatLeft) : cents))}>{label}</Button>
  );
  return (
    <div className="rounded-2xl border border-border-button-default">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 text-start text-body-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        {t("purchases.pay.withholding")}
        <span className="num text-caption-1-regular text-text-secondary">{held > 0 ? fmtNumber(fromCents(held)) : t("purchases.pay.optional")}</span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-separator-border p-4">
          <p className="text-body-regular text-text-secondary">{t(side === "sale" ? "wh.explain.sale" : "purchases.pay.whExplain")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <DecimalField label={t(side === "sale" ? "wh.vatWithheld.sale" : "purchases.pay.vatWithheld")} value={vat} onChange={(v) => onChange("vat", v)} digits={[2, 2]} hideSteppers error={errors?.vat} />
              <div className="flex flex-wrap gap-1.5">
                {helper(t("purchases.pay.vat75"), "vat", Math.round(toCents(totalVat) * 0.75))}
                {helper(t("purchases.pay.vat100"), "vat", toCents(totalVat))}
              </div>
            </div>
            <div className="grid content-start gap-2">
              <DecimalField label={t(side === "sale" ? "wh.taxWithheld.sale" : "purchases.pay.taxWithheld")} value={tax} onChange={(v) => onChange("tax", v)} digits={[2, 2]} hideSteppers error={errors?.tax} />
              <div className="flex flex-wrap gap-1.5">
                {helper(t("purchases.pay.tax5"), "tax", Math.round(toCents(totalNet) * 0.05))}
                {helper(t("purchases.pay.tax10"), "tax", Math.round(toCents(totalNet) * 0.1))}
              </div>
            </div>
          </div>
          <p className="text-caption-1-regular text-text-tertiary">{t("purchases.pay.whCheck")}</p>
        </div>
      )}
    </div>
  );
}
