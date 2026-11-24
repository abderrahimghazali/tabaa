"use client";

import { RiErrorWarningFill } from "@remixicon/react";
import type { ApiError } from "@facture/core";
import { useI18n } from "@/lib/i18n-client";

/** Summary of an API failure: one headline plus every issue message. */
export function IssueList({ error }: { error: ApiError | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-border-error-default/30 bg-notification-error-background p-4">
      <RiErrorWarningFill className="mt-0.5 size-5 shrink-0 text-notification-error-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-body-medium text-text-primary">{error.code === "VALIDATION" ? t("error.fixFields") : error.message}</p>
        {error.issues && error.issues.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 ps-4 text-body-regular text-text-secondary marker:text-notification-error-foreground">
            {error.issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
