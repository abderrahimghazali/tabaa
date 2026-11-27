"use client";

import { useId, useState } from "react";
import { RiCloseLine } from "@remixicon/react";
import { useI18n } from "@/lib/i18n-client";
import { cx } from "@/utils/cx";

// The same shape Zod's email() accepts, so the dialog never offers an address the API will refuse.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
export const isEmail = (v: string) => EMAIL.test(v) && v.length <= 254;

export const MAX_RECIPIENTS = 5;

/** Addresses as removable chips. Enter, comma, semicolon, space or leaving the field commits what was typed. */
export function EmailChips({
  label,
  value,
  onChange,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const full = value.length >= MAX_RECIPIENTS;

  const commit = (raw: string): boolean => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return true;
    const next = [...value];
    for (const p of parts) {
      if (!isEmail(p)) {
        setProblem(t("send.invalidEmail", { value: p }));
        setDraft(parts.slice(parts.indexOf(p)).join(" "));
        onChange(next);
        return false;
      }
      if (next.some((v) => v.toLowerCase() === p.toLowerCase())) continue;
      if (next.length >= MAX_RECIPIENTS) {
        setProblem(t("send.max"));
        setDraft("");
        onChange(next);
        return false;
      }
      next.push(p);
    }
    setProblem(null);
    setDraft("");
    onChange(next);
    return true;
  };

  const shown = problem ?? error;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body-medium text-text-primary">{label}</label>
      <div
        className={cx(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-background-primary-default px-2 py-1.5 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-border-focus-ring",
          shown ? "border-border-error-default" : "border-border-button-default",
        )}
      >
        {value.map((email) => (
          <span key={email} className="inline-flex max-w-full items-center gap-0.5 rounded-lg bg-background-secondary-default ps-2.5 pe-0.5 text-body-medium text-text-primary">
            <span dir="ltr" className="truncate py-1">{email}</span>
            <button
              type="button"
              aria-label={t("send.remove", { email })}
              onClick={() => onChange(value.filter((v) => v !== email))}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-foreground-icon-secondary outline-none hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring max-nav:size-9"
            >
              <RiCloseLine className="size-4" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          dir="ltr"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={draft}
          disabled={full && !draft}
          placeholder={value.length ? "" : t("send.placeholder")}
          aria-invalid={!!shown || undefined}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            const v = e.target.value;
            setProblem(null);
            if (/[\s,;]$/.test(v) && v.trim()) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (draft.trim()) {
                e.preventDefault();
                commit(draft);
              }
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              commit(draft + text);
            }
          }}
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-body-regular text-text-primary outline-none placeholder:text-text-tertiary max-nav:text-[16px]"
        />
      </div>
      <p id={`${id}-msg`} role={shown ? "alert" : undefined} className={cx("text-caption-1-regular", shown ? "text-text-error-primary" : "text-text-tertiary")}>
        {shown ?? hint}
      </p>
    </div>
  );
}
