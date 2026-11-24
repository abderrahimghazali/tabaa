"use client";

import { Chip } from "@/components/base/badges/chip";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";
import { Section } from "./section";

export function AccountPanel() {
  const { t } = useI18n();
  const me = useMe();
  if (!me) return null;
  const rows: [string, React.ReactNode][] = [
    [t("account.name"), me.user.name],
    [t("account.email"), <span key="e" dir="ltr" className="inline-block">{me.user.email}</span>],
    [t("account.role"), <Chip key="r" color={me.role === "VIEWER" ? "gray" : "blue"} variant="caption">{t(`role.${me.role}`)}</Chip>],
    [t("account.workspace"), me.tenant.name],
  ];
  return (
    <div className="grid max-w-3xl gap-4">
      <Section title={t("settings.account")} description={t("account.intro")}>
        <dl className="grid gap-4 sm:col-span-2">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-body-medium text-text-secondary">{k}</dt>
              <dd className="min-w-0 break-words text-body-regular text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body-regular text-text-tertiary sm:col-span-2">{t("account.readOnly")}</p>
      </Section>
    </div>
  );
}
