"use client";

import { RiAlertLine, RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import { validateIce, validateRib } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import type { T } from "@/lib/i18n";
import { cx } from "@/utils/cx";

export type ProfileValues = {
  name: string;
  line1: string;
  city: string;
  ice: string;
  ifNumber: string;
  rcNumber: string;
  tpNumber: string;
  cnssNumber: string;
  rib: string;
  bankName: string;
  vatRegime: string;
  vatTaxPoint: string;
};

type Level = "ok" | "warn" | "error";
export type ProfileLine = { id: "identity" | "legal" | "vat" | "bank"; level: Level; text: string; focus: string };

/** Mirrors validateForIssue's two seller rules: the ICE is present and valid, and the IF is present. */
export function profileStatus(v: ProfileValues, t: T) {
  const blank = (s: string) => !s.trim();
  const iceOk = !blank(v.ice) && validateIce(v.ice).valid;
  const ifOk = !blank(v.ifNumber);
  const blocked = !iceOk || !ifOk;

  const identity = [blank(v.name) && "co.m.name", blank(v.line1) && "co.m.address", blank(v.city) && "co.m.city"].filter(Boolean) as Parameters<T>[0][];
  const identityFocus = blank(v.name) ? "name" : blank(v.line1) ? "line1" : "city";

  const legalErrors = [blank(v.ice) ? "co.m.iceMissing" : !iceOk ? "co.m.iceInvalid" : null, !ifOk ? "co.m.ifMissing" : null].filter(Boolean) as Parameters<T>[0][];
  const rec = [blank(v.rcNumber) && "RC", blank(v.tpNumber) && "TP", blank(v.cnssNumber) && "CNSS"].filter(Boolean) as string[];
  const legalFocus = !iceOk ? "ice" : !ifOk ? "ifNumber" : blank(v.rcNumber) ? "rcNumber" : blank(v.tpNumber) ? "tpNumber" : "cnssNumber";
  const recText = rec.length ? t("co.m.rec", { list: rec.join(", ") }).replace("(s)", rec.length > 1 ? "s" : "") : null;

  const ribBad = !blank(v.rib) && !validateRib(v.rib).valid;
  const bankText = blank(v.rib) ? t("co.m.ribMissing") : ribBad ? t("co.m.ribInvalid") : blank(v.bankName) ? t("co.m.bankName") : null;
  const bankFocus = blank(v.rib) || ribBad ? "rib" : "bankName";

  const lines: ProfileLine[] = [
    identity.length
      ? { id: "identity", level: "error", text: identity.map((k) => t(k)).join(", "), focus: identityFocus }
      : { id: "identity", level: "ok", text: t("co.complete"), focus: "name" },
    legalErrors.length
      ? { id: "legal", level: "error", text: [...legalErrors.map((k) => t(k)), recText].filter(Boolean).join(" · "), focus: legalFocus }
      : recText
        ? { id: "legal", level: "warn", text: recText, focus: legalFocus }
        : { id: "legal", level: "ok", text: t("co.complete"), focus: legalFocus },
    {
      id: "vat",
      level: "ok",
      text: `${t(`co.regime.${v.vatRegime as "MONTHLY"}`)} · ${t(`taxPoint.${v.vatTaxPoint as "RECEIPTS"}`)}`,
      focus: "vatRegime",
    },
    bankText
      ? { id: "bank", level: ribBad ? "error" : "warn", text: bankText, focus: bankFocus }
      : { id: "bank", level: "ok", text: t("co.complete"), focus: bankFocus },
  ];
  return { blocked, lines };
}

const ICONS = { ok: RiCheckLine, warn: RiAlertLine, error: RiErrorWarningLine } as const;
const TONE = { ok: "text-green-600", warn: "text-orange-600", error: "text-red-600" } as const;

export function jumpTo(line: ProfileLine) {
  const section = document.getElementById(line.id);
  section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const field = document.querySelector<HTMLElement>(`#company-form [name="${line.focus}"], #company-form [data-focus="${line.focus}"]`);
  window.setTimeout(() => field?.focus({ preventScroll: true }), 350);
}

export function ProfileStatus({
  values,
  t,
  sectionName,
  compact,
}: {
  values: ProfileValues;
  t: T;
  sectionName: (id: ProfileLine["id"]) => string;
  compact?: boolean;
}) {
  const { blocked, lines } = profileStatus(values, t);
  const shown = compact ? lines.filter((l) => l.level !== "ok") : lines;
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={compact ? "text-caption-1-medium text-text-secondary" : "text-body-medium text-text-primary"}>{t("co.status")}</h2>
        <Chip color={blocked ? "rose" : "lime"} variant="caption" className="ms-auto">
          {blocked ? t("co.blocked") : t("co.ready")}
        </Chip>
      </div>
      {!compact && <p className="text-caption-1-regular text-text-secondary">{blocked ? t("co.blockedWhy") : t("co.readyWhy")}</p>}
      {shown.length > 0 && (
        <ul className="grid gap-0.5">
          {shown.map((l) => {
            const Icon = ICONS[l.level];
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(l)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-start text-caption-1-regular outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <Icon className={cx("mt-px size-4 shrink-0", TONE[l.level])} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-text-primary">{sectionName(l.id)}</span>
                    <span className="text-text-tertiary"> — </span>
                    <span className={l.level === "ok" ? "text-text-secondary" : "text-text-primary"}>{l.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
