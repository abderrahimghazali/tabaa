"use client";

import type { ReactNode } from "react";
import { CalendarDate, parseDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import { DatePicker } from "@/components/base/date-picker/date-picker";
import { HintText } from "@/components/base/input/hint-text";
import { NumberField } from "@/components/base/number-field/number-field";
import type { InputSize } from "@/components/base/input/input";
import { cx } from "@/utils/cx";

export function toCal(iso: string): CalendarDate | null {
  try {
    return iso ? parseDate(iso) : null;
  } catch {
    return null;
  }
}

/** Visible label above a control that has no field label of its own (date pickers). */
export function FieldShell({ label, hint, error, className, children }: { label: ReactNode; hint?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-body-medium text-text-primary">{label}</span>
      {children}
      {error ? <HintText isInvalid>{error}</HintText> : hint ? <HintText>{hint}</HintText> : null}
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={className}>
      <DatePicker aria-label={label} value={toCal(value)} onChange={(d) => onChange(d ? d.toString() : "")} className="w-full justify-start" />
    </FieldShell>
  );
}

const round = (v: number) => String(Math.round(v * 10000) / 10000);
const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

/** NumberField over a decimal string, the shape the invoice state and API use. */
export function DecimalField({
  value,
  onChange,
  label,
  "aria-label": ariaLabel,
  error,
  hint,
  minValue = 0,
  maxValue,
  digits = [0, 4],
  size,
  hideSteppers,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  "aria-label"?: string;
  error?: string;
  hint?: ReactNode;
  minValue?: number;
  maxValue?: number;
  digits?: [number, number];
  size?: InputSize;
  hideSteppers?: boolean;
  placeholder?: string;
  className?: string;
}) {
  // Amounts use one grouping and decimal convention (1 500,00) in both interface languages.
  return (
    <I18nProvider locale="fr-FR">
    <NumberField
      label={label}
      aria-label={ariaLabel ?? label}
      value={isNum(value) ? Number(value) : NaN}
      onChange={(n) => onChange(Number.isNaN(n) ? "" : round(n))}
      minValue={minValue}
      maxValue={maxValue}
      formatOptions={{ minimumFractionDigits: digits[0], maximumFractionDigits: digits[1] }}
      isInvalid={!!error}
      hint={error ?? hint}
      size={size}
      hideSteppers={hideSteppers}
      placeholder={placeholder}
      className={className}
    />
    </I18nProvider>
  );
}
