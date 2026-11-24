"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RiArrowLeftLine, RiMailCheckLine } from "@remixicon/react";
import type { ApiError } from "@facture/core";
import { Input } from "@/components/base/input/input";
import { LinkButton } from "@/components/base/buttons/link-button";
import { forgotPassword, resetPassword, signIn, signUp } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n-client";
import { AuthHeading, Notice, PasswordField, SubmitButton, errorKey, fieldIssue, useFocusFirstInvalid } from "./fields";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Errors = Record<string, string>;

function useAuthSubmit<T>(validate: (fd: FormData) => Errors, run: (fd: FormData) => Promise<T | { ok: false; error: ApiError } | void>) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const ref = useFocusFirstInvalid([errors]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (pending) return;
    const local = validate(fd);
    setFormError(null);
    setApiError(null);
    setErrors(local);
    if (Object.keys(local).length) return;
    start(async () => {
      const res = (await run(fd)) as { ok?: boolean; error?: ApiError } | void;
      if (res && res.ok === false && res.error) {
        const err = res.error;
        setApiError(err);
        const key = errorKey(err.code);
        if (err.code === "VALIDATION" && err.issues?.length) {
          setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
        } else if (key && err.code !== "INVALID_TOKEN") setFormError(t(key));
        else if (err.code !== "EMAIL_TAKEN" && err.code !== "INVALID_TOKEN") setFormError(t("auth.err.unavailable"));
      }
    });
  };
  return { ref, pending, errors, formError, apiError, onSubmit };
}

export function SignInForm({ next, expired, reset }: { next?: string; expired?: boolean; reset?: boolean }) {
  const { t } = useI18n();
  const f = useAuthSubmit(
    (fd) => {
      const e: Errors = {};
      if (!EMAIL.test(text(fd, "email"))) e.email = t("auth.err.email");
      if (!String(fd.get("password") ?? "")) e.password = t("auth.err.required");
      return e;
    },
    (fd) => signIn({ email: text(fd, "email"), password: String(fd.get("password")) }, next),
  );
  return (
    <>
      <AuthHeading title={t("auth.signInTitle")} sub={t("auth.signInSub")} />
      <form ref={f.ref} onSubmit={f.onSubmit} noValidate className="flex flex-col gap-4">
        {reset && <Notice tone="success">{t("auth.resetDone")}</Notice>}
        {expired && !reset && <Notice tone="info">{t("auth.expired")}</Notice>}
        {f.formError && <Notice tone="error">{f.formError}</Notice>}
        <Input name="email" type="email" label={t("auth.email")} autoComplete="email" isRequired isInvalid={!!f.errors.email} errorMessage={f.errors.email} />
        <PasswordField name="password" maxLength={128} label={t("auth.password")} autoComplete="current-password" isRequired errorMessage={f.errors.password} />
        <div className="-mt-1 flex justify-end">
          <LinkButton href="/mot-de-passe-oublie">{t("auth.forgot")}</LinkButton>
        </div>
        <SubmitButton pending={f.pending}>{t("auth.signIn")}</SubmitButton>
      </form>
      <p className="mt-6 text-center text-body-regular text-text-secondary">
        {t("auth.noAccount")} <LinkButton href="/inscription">{t("auth.createAccount")}</LinkButton>
      </p>
    </>
  );
}

export function SignUpForm() {
  const { t } = useI18n();
  const f = useAuthSubmit(
    (fd) => {
      const e: Errors = {};
      if (!text(fd, "name")) e.name = t("auth.err.required");
      if (!EMAIL.test(text(fd, "email"))) e.email = t("auth.err.email");
      if (String(fd.get("password") ?? "").length < 10) e.password = t("auth.err.passwordShort");
      if (!text(fd, "companyName")) e.companyName = t("auth.err.required");
      return e;
    },
    (fd) => signUp({ name: text(fd, "name"), email: text(fd, "email"), password: String(fd.get("password")), companyName: text(fd, "companyName") }),
  );
  const taken = f.apiError?.code === "EMAIL_TAKEN";
  return (
    <>
      <AuthHeading title={t("auth.signUpTitle")} sub={t("auth.signUpSub")} />
      <form ref={f.ref} onSubmit={f.onSubmit} noValidate className="flex flex-col gap-4">
        {f.formError && <Notice tone="error">{f.formError}</Notice>}
        <Input name="name" maxLength={120} label={t("auth.name")} autoComplete="name" isRequired isInvalid={!!f.errors.name} errorMessage={f.errors.name} />
        <Input
          name="email"
          type="email"
          label={t("auth.workEmail")}
          autoComplete="email"
          isRequired
          isInvalid={!!f.errors.email || taken}
          errorMessage={
            taken ? (
              <>
                {t("auth.err.emailTaken")} <Link href="/connexion" className="underline">{t("auth.err.signInInstead")}</Link>
              </>
            ) : (
              f.errors.email
            )
          }
        />
        <PasswordField name="password" maxLength={128} label={t("auth.password")} hint={t("auth.passwordHint")} autoComplete="new-password" isRequired errorMessage={f.errors.password} />
        <Input name="companyName" maxLength={160} label={t("auth.companyName")} autoComplete="organization" isRequired isInvalid={!!f.errors.companyName} errorMessage={f.errors.companyName} />
        <SubmitButton pending={f.pending}>{t("auth.signUp")}</SubmitButton>
      </form>
      <p className="mt-6 text-center text-body-regular text-text-secondary">
        {t("auth.haveAccount")} <LinkButton href="/connexion">{t("auth.signIn")}</LinkButton>
      </p>
    </>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const f = useAuthSubmit(
    (fd): Errors => (EMAIL.test(text(fd, "email")) ? {} : { email: t("auth.err.email") }),
    async (fd) => {
      await forgotPassword({ email: text(fd, "email") });
      setSent(true);
    },
  );
  return (
    <>
      <AuthHeading title={t("auth.forgotTitle")} sub={sent ? undefined : t("auth.forgotSub")} />
      {sent ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-2xl bg-background-secondary-default p-4">
            <RiMailCheckLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <p role="status" className="text-body-regular text-text-primary">{t("auth.forgotSent")}</p>
          </div>
        </div>
      ) : (
        <form ref={f.ref} onSubmit={f.onSubmit} noValidate className="flex flex-col gap-4">
          {f.formError && <Notice tone="error">{f.formError}</Notice>}
          <Input name="email" type="email" label={t("auth.email")} autoComplete="email" isRequired isInvalid={!!f.errors.email} errorMessage={f.errors.email} />
          <SubmitButton pending={f.pending}>{t("auth.sendLink")}</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center">
        <LinkButton href="/connexion" leadingIcon={RiArrowLeftLine}>{t("auth.backToSignIn")}</LinkButton>
      </p>
    </>
  );
}

export function ResetForm({ token }: { token?: string }) {
  const { t } = useI18n();
  const f = useAuthSubmit(
    (fd): Errors => (String(fd.get("password") ?? "").length < 10 ? { password: t("auth.err.passwordShort") } : {}),
    (fd) => resetPassword({ token: token ?? "", password: String(fd.get("password")) }),
  );
  const invalid = !token || f.apiError?.code === "INVALID_TOKEN";
  if (invalid) {
    return (
      <>
        <AuthHeading title={t("auth.invalidTokenTitle")} sub={t("auth.err.invalidToken")} />
        <LinkButton href="/mot-de-passe-oublie" variant="primary">{t("auth.err.requestNew")}</LinkButton>
        <p className="mt-6 text-center">
          <LinkButton href="/connexion" leadingIcon={RiArrowLeftLine}>{t("auth.backToSignIn")}</LinkButton>
        </p>
      </>
    );
  }
  return (
    <>
      <AuthHeading title={t("auth.resetTitle")} sub={t("auth.resetSub")} />
      <form ref={f.ref} onSubmit={f.onSubmit} noValidate className="flex flex-col gap-4">
        {f.formError && <Notice tone="error">{f.formError}</Notice>}
        <PasswordField name="password" maxLength={128} label={t("auth.newPassword")} hint={t("auth.passwordHint")} autoComplete="new-password" isRequired errorMessage={f.errors.password} />
        <SubmitButton pending={f.pending}>{t("auth.resetSave")}</SubmitButton>
      </form>
    </>
  );
}
