"use client";

import { useState, useTransition } from "react";
import { RiBuilding2Line, RiMailLine, RiUserLine } from "@remixicon/react";
import type { ApiError, InvitationPreview } from "@facture/core";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { LinkButton } from "@/components/base/buttons/link-button";
import { BrandLoader } from "@/components/ui/brand";
import { acceptInvitation, signOutTo } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { AuthHeading, Notice, PasswordField, SubmitButton } from "./fields";

function Summary({ preview }: { preview: InvitationPreview }) {
  const { t } = useI18n();
  const rows: [React.ElementType, string, React.ReactNode][] = [
    [RiBuilding2Line, t("inv.workspace"), preview.tenantName],
    [RiUserLine, t("inv.role"), t(`role.${preview.role}`)],
    [RiMailLine, t("inv.forEmail"), <span key="e" dir="ltr" className="inline-block">{preview.email}</span>],
  ];
  return (
    <dl className="mb-5 grid gap-3 rounded-2xl bg-background-secondary-default p-4">
      {rows.map(([Icon, k, v]) => (
        <div key={k} className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <div className="min-w-0">
            <dt className="text-caption-1-regular text-text-tertiary">{k}</dt>
            <dd className="break-words text-body-medium text-text-primary">{v}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export function InvitationView({ token, preview, currentEmail }: { token: string; preview: InvitationPreview | null; currentEmail: string | null }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const next = `/invitation?token=${encodeURIComponent(token)}`;

  if (!preview) {
    return (
      <>
        <AuthHeading title={t("inv.invalidTitle")} />
        <Notice tone="info">{t("inv.invalidBody")}</Notice>
        <p className="mt-6 text-center">
          <LinkButton href="/connexion">{t("auth.backToSignIn")}</LinkButton>
        </p>
      </>
    );
  }

  const lead = preview.inviterName
    ? t("inv.lead", { inviter: preview.inviterName, workspace: preview.tenantName, role: t(`role.${preview.role}`) })
    : t("inv.leadNoName", { workspace: preview.tenantName, role: t(`role.${preview.role}`) });
  const sameAccount = !!currentEmail && currentEmail.toLowerCase() === preview.email.toLowerCase();
  const wrongAccount = !!currentEmail && !sameAccount;

  const message = (e: ApiError) => {
    const key = `inv.err.${e.code}` as Key;
    return ["SIGN_IN_REQUIRED", "WRONG_ACCOUNT", "INVALID_TOKEN"].includes(e.code) ? t(key) : t("auth.err.unavailable");
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const local: Record<string, string> = {};
    if (!preview.accountExists) {
      if (!name) local.name = t("auth.err.required");
      if (password.length < 10) local.password = t("auth.err.passwordShort");
    }
    setErrors(local);
    setError(null);
    if (Object.keys(local).length) return;
    start(async () => {
      const res = await acceptInvitation(preview.accountExists ? { token } : { token, name, password });
      if (res && !res.ok) {
        const issues = res.error.issues;
        if (res.error.code === "VALIDATION" && issues?.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
        else setError(res.error);
      }
    });
  };

  const header = <AuthHeading title={t("inv.title")} sub={lead} />;

  if (preview.accountExists && !currentEmail) {
    return (
      <>
        {header}
        <Summary preview={preview} />
        <p className="mb-4 text-body-regular text-text-secondary">{t("inv.signInBody", { email: preview.email })}</p>
        <ButtonLink className="w-full" href={`/connexion?next=${encodeURIComponent(next)}`}>{t("inv.signInButton")}</ButtonLink>
      </>
    );
  }

  if (wrongAccount) {
    return (
      <>
        {header}
        <Summary preview={preview} />
        <Notice tone="error">{t("inv.wrongBody", { current: currentEmail!, email: preview.email })}</Notice>
        <Button className="mt-4 w-full" aria-busy={pending} onClick={() => start(async () => { await signOutTo(next); })}>
          {pending ? <BrandLoader size={22} inverse label={t("auth.pending")} className="flex-row" /> : t("inv.wrongButton")}
        </Button>
      </>
    );
  }

  return (
    <>
      {header}
      <Summary preview={preview} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Notice tone="error">{message(error)}</Notice>}
        {!preview.accountExists && (
          <>
            <div>
              <h2 className="text-headline-medium text-text-primary">{t("inv.createTitle")}</h2>
              <p className="mt-1 text-body-regular text-text-secondary">{t("inv.createIntro")}</p>
            </div>
            <Input name="name" maxLength={120} label={t("auth.name")} autoComplete="name" isRequired isInvalid={!!errors.name} errorMessage={errors.name} />
            <PasswordField name="password" maxLength={128} label={t("auth.password")} hint={t("auth.passwordHint")} autoComplete="new-password" isRequired errorMessage={errors.password} />
          </>
        )}
        <SubmitButton pending={pending}>{preview.accountExists ? t("inv.join", { workspace: preview.tenantName }) : t("inv.createButton")}</SubmitButton>
      </form>
    </>
  );
}
