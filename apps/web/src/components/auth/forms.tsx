"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RiArrowLeftLine, RiMailCheckLine } from "@remixicon/react";
import type { ApiError } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { BrandLoader } from "@/components/ui/brand";
import { LinkButton } from "@/components/base/buttons/link-button";
import { forgotPassword, resetPassword, signIn, signUp, verifyEmail, verifyMfa } from "@/lib/auth-actions";
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

export function SignInForm({ next, expired, reset, mfaExpired }: { next?: string; expired?: boolean; reset?: boolean; mfaExpired?: boolean }) {
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
        {mfaExpired && <Notice tone="info">{t("auth.mfaExpired")}</Notice>}
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

type SignUpValues = { name: string; email: string; password: string; companyName: string };

export function SignUpForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState<SignUpValues | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, startResend] = useTransition();
  const f = useAuthSubmit(
    (fd) => {
      const e: Errors = {};
      if (!text(fd, "name")) e.name = t("auth.err.required");
      if (!EMAIL.test(text(fd, "email"))) e.email = t("auth.err.email");
      if (String(fd.get("password") ?? "").length < 10) e.password = t("auth.err.passwordShort");
      if (!text(fd, "companyName")) e.companyName = t("auth.err.required");
      return e;
    },
    async (fd) => {
      const values = { name: text(fd, "name"), email: text(fd, "email"), password: String(fd.get("password")), companyName: text(fd, "companyName") };
      const res = await signUp(values);
      if (res.ok) {
        setSent(values);
        return;
      }
      return res;
    },
  );

  if (sent) {
    const resend = () =>
      startResend(async () => {
        setResent(false);
        const res = await signUp(sent);
        if (res.ok) setResent(true);
      });
    return (
      <>
        <AuthHeading title={t("auth.checkInboxTitle")} />
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl bg-background-secondary-default p-4">
            <RiMailCheckLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <p role="status" className="text-body-regular text-text-primary">
              {t("auth.checkInboxBody", { email: sent.email })}
            </p>
          </div>
          <p className="text-body-regular text-text-secondary">{t("auth.checkInboxExisting")}</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={resend} aria-busy={resending}>
              {resending ? <BrandLoader size={20} label={t("auth.pending")} className="flex-row" /> : t("auth.resend")}
            </Button>
            {resent && <span role="status" className="text-body-medium text-text-secondary">{t("auth.resent")}</span>}
          </div>
        </div>
        <p className="mt-6 text-center">
          <LinkButton href="/connexion" leadingIcon={RiArrowLeftLine}>{t("auth.backToSignIn")}</LinkButton>
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t("auth.signUpTitle")} sub={t("auth.signUpSub")} />
      <form ref={f.ref} onSubmit={f.onSubmit} noValidate className="flex flex-col gap-4">
        {f.formError && <Notice tone="error">{f.formError}</Notice>}
        <Input name="name" maxLength={120} label={t("auth.name")} autoComplete="name" isRequired isInvalid={!!f.errors.name} errorMessage={f.errors.name} />
        <Input name="email" type="email" label={t("auth.workEmail")} autoComplete="email" isRequired isInvalid={!!f.errors.email} errorMessage={f.errors.email} />
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

export function VerifyEmail({ token }: { token?: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(!token);
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void verifyEmail(token).then((res) => {
      if (res && !res.ok) setFailed(true);
    });
  }, [token]);

  if (failed) {
    return (
      <>
        <AuthHeading title={t("auth.verifyFailedTitle")} sub={t("auth.verifyFailedBody")} />
        <LinkButton href="/inscription" variant="primary">{t("auth.backToSignUp")}</LinkButton>
        <p className="mt-6 text-center">
          <LinkButton href="/connexion" leadingIcon={RiArrowLeftLine}>{t("auth.backToSignIn")}</LinkButton>
        </p>
      </>
    );
  }
  return (
    <>
      <AuthHeading title={t("auth.verifyingTitle")} sub={t("auth.verifyingBody")} />
      <div className="flex justify-center py-6" aria-busy="true">
        <BrandLoader size={48} label={t("auth.pending")} />
      </div>
    </>
  );
}

export function MfaForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef("");

  const submit = (value: string, isRecovery: boolean) => {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await verifyMfa(isRecovery ? { recoveryCode: value.trim() } : { code: value }, next);
      if (res && !res.ok) {
        setError(res.error.code === "INVALID_CODE" ? t(isRecovery ? "auth.err.invalidRecovery" : "auth.err.invalidCode") : t("auth.err.unavailable"));
        if (!isRecovery) {
          setCode("");
          submitted.current = "";
        }
        form.current?.querySelector<HTMLInputElement>("input")?.focus();
      }
    });
  };

  const onCode = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && submitted.current !== digits) {
      submitted.current = digits;
      submit(digits, false);
    }
  };

  return (
    <>
      <AuthHeading title={recovery ? t("auth.mfaRecoveryTitle") : t("auth.mfaTitle")} sub={recovery ? t("auth.mfaRecoverySub") : t("auth.mfaSub")} />
      <form
        ref={form}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (recovery ? recoveryCode.trim().length >= 8 : code.length === 6) submit(recovery ? recoveryCode : code, recovery);
        }}
      >
        {error && <Notice tone="error">{error}</Notice>}
        {recovery ? (
          <Input
            key="recovery"
            autoFocus
            label={t("auth.mfaRecoveryCode")}
            value={recoveryCode}
            onChange={setRecoveryCode}
            autoComplete="off"
            inputDir="ltr"
            inputClassName="ident"
            maxLength={40}
          />
        ) : (
          <Input
            key="code"
            autoFocus
            label={t("auth.mfaCode")}
            value={code}
            onChange={onCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            inputDir="ltr"
            inputClassName="ident tracking-[0.35em]"
            placeholder="000000"
          />
        )}
        <SubmitButton pending={pending}>{t("auth.mfaVerify")}</SubmitButton>
      </form>
      <p className="mt-6 text-center">
        <LinkButton
          onClick={() => {
            setRecovery((r) => !r);
            setError(null);
          }}
        >
          {recovery ? t("auth.mfaUseApp") : t("auth.mfaUseRecovery")}
        </LinkButton>
      </p>
      <p className="mt-3 text-center">
        <LinkButton href="/connexion" leadingIcon={RiArrowLeftLine}>{t("auth.backToSignIn")}</LinkButton>
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
