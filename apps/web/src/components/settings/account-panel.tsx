"use client";

import { useState } from "react";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { closeWorkspace } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";
import { SensitiveDialog } from "./sensitive-dialog";
import { Section } from "./section";

export function AccountPanel() {
  const { t } = useI18n();
  const me = useMe();
  const [closing, setClosing] = useState(false);
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

      {me.role === "OWNER" && (
        <div className="rounded-3xl border border-border-error-default bg-background-primary-default p-5 sm:p-6">
          <h2 className="text-headline-medium text-text-error-primary">{t("close.zone")}</h2>
          <div className="mt-3 flex flex-col items-start gap-3">
            <div>
              <h3 className="text-body-medium text-text-primary">{t("close.title")}</h3>
              <p className="mt-0.5 text-body-regular text-text-secondary">{t("close.intro", { name: me.tenant.name })}</p>
            </div>
            <Button variant="danger" onClick={() => setClosing(true)}>{t("close.button")}</Button>
          </div>
        </div>
      )}

      <SensitiveDialog
        isOpen={closing}
        onOpenChange={setClosing}
        title={t("close.dialogTitle", { name: me.tenant.name })}
        confirmLabel={t("close.confirm")}
        danger
        confirmName={me.tenant.name}
        run={(reauth, confirmName) => closeWorkspace({ ...reauth, confirmName })}
        onDone={() => {}}
      >
        <div className="flex flex-col gap-2">
          <p className="text-body-medium text-text-primary">{t("close.effects")}</p>
          <ul className="list-disc space-y-1.5 ps-5 text-body-regular text-text-secondary">
            <li>{t("close.e1")}</li>
            <li>{t("close.e2")}</li>
            <li>{t("close.e3")}</li>
            <li>{t("close.e4")}</li>
          </ul>
          <p className="text-body-medium text-text-error-primary">{t("close.e5")}</p>
        </div>
      </SensitiveDialog>
    </div>
  );
}
