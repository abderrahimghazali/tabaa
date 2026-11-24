import { currencyLabel, fmtNumber, type Locale } from "@/lib/format";
import { cx } from "@/utils/cx";

/** Amount in Inter with tabular figures. Always left-to-right, even in Arabic. */
export function Money({
  value,
  locale,
  currency = "MAD",
  className,
  bare,
}: {
  value: string | number;
  locale: Locale;
  currency?: string;
  className?: string;
  bare?: boolean;
}) {
  return (
    <span className={cx("inline-flex items-baseline gap-[0.3em] whitespace-nowrap", className)}>
      <span className="num">{fmtNumber(value)}</span>
      {!bare && <span className="text-[0.7em] font-medium text-text-tertiary">{currencyLabel(locale, currency)}</span>}
    </span>
  );
}
