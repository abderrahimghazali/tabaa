"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { RiCloseLine, RiShieldKeyholeLine } from "@remixicon/react";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";

const KEY = "tabaa:mfa-prompt-dismissed";
const read = () => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = () => () => {};

/** One calm line for OWNER and ADMIN without two-factor; dismissed for the browser session. */
export function MfaPrompt() {
  const { t } = useI18n();
  const me = useMe();
  const wasDismissed = useSyncExternalStore(subscribe, read, () => true);
  const [dismissed, setDismissed] = useState(false);
  if (!me || me.mfaEnabled || (me.role !== "OWNER" && me.role !== "ADMIN") || wasDismissed || dismissed) return null;
  return (
    <div role="status" className="mb-6 flex items-center gap-3 rounded-2xl bg-status-blue-background px-4 py-2.5 text-status-blue-text">
      <RiShieldKeyholeLine className="size-5 shrink-0" aria-hidden />
      <p className="flex-1 text-body-medium">
        {t("mfa.prompt")}{" "}
        <Link href="/parametres/securite" className="underline underline-offset-2">{t("mfa.promptAction")}</Link>
      </p>
      <button
        type="button"
        aria-label={t("mfa.dismiss")}
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {
            /* private mode: dismissed for this view only */
          }
          setDismissed(true);
        }}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-background-secondary-hover"
      >
        <RiCloseLine className="size-4" aria-hidden />
      </button>
    </div>
  );
}
