"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { Reauth } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { PasswordField } from "@/components/auth/fields";
import { Notice } from "@/components/auth/fields";
import type { Result } from "@/lib/result";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";

/** Asks for the password (and a current code when two-factor is on) before a sensitive action. */
export function SensitiveDialog<T>({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  confirmName,
  children,
  run,
  onDone,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  /** When set, the exact text that must be typed to confirm. */
  confirmName?: string;
  children?: ReactNode;
  run: (reauth: Reauth, typedName: string) => Promise<Result<T>>;
  onDone: (data: T) => void;
}) {
  const { t } = useI18n();
  const me = useMe();
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setTyped("");
    setError(null);
  };
  const ready = password.length > 0 && (!me?.mfaEnabled || code.length === 6) && (confirmName === undefined || typed === confirmName);

  const submit = () => {
    if (!ready || pending) return;
    setError(null);
    start(async () => {
      const res = await run({ password, ...(me?.mfaEnabled ? { code } : {}) }, typed);
      if (res.ok) {
        reset();
        onOpenChange(false);
        onDone(res.data);
        return;
      }
      const c = res.error.code;
      setError(c === "INVALID_CODE" ? t("auth.err.invalidCode") : c === "INVALID_CREDENTIALS" ? t("reauth.badPassword") : c === "TOO_MANY_ATTEMPTS" ? t("auth.err.tooMany") : res.error.message);
    });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }} size="md" aria-label={title}>
      {({ close }) => (
        <>
          <ModalHeader title={title} description={description} closeLabel={t("common.close")} tone={danger ? "danger" : "default"} />
          <ModalBody>
            <form
              id="sensitive-form"
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {children}
              {error && <Notice tone="error">{error}</Notice>}
              {confirmName !== undefined && (
                <Input label={t("close.confirmName", { name: confirmName })} aria-label={t("close.confirmName", { name: confirmName })} value={typed} onChange={setTyped} autoComplete="off" />
              )}
              <PasswordField label={t("reauth.password")} aria-label={t("reauth.password")} value={password} onChange={setPassword} autoComplete="current-password" />
              {me?.mfaEnabled && (
                <Input
                  label={t("reauth.code")}
                  aria-label={t("reauth.code")}
                  hint={t("reauth.codeHint")}
                  value={code}
                  onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  inputDir="ltr"
                  inputClassName="ident tracking-[0.3em]"
                />
              )}
            </form>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
            <Button variant={danger ? "danger" : "primary"} type="submit" form="sensitive-form" disabled={!ready || pending}>
              {confirmLabel}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
