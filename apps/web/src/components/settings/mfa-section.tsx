"use client";

import { useEffect, useState, useTransition } from "react";
import { RiDownload2Line, RiFileCopyLine } from "@remixicon/react";
import type { MfaSetup } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { toast } from "@/components/base/toast/toast";
import { Notice } from "@/components/auth/fields";
import { disableMfa, enableMfa, regenerateRecoveryCodes, setupMfa } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n-client";
import { useMe } from "@/lib/me-client";
import { QrCode } from "./qr-code";
import { SensitiveDialog } from "./sensitive-dialog";
import { Section } from "./section";

const group4 = (s: string) => s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    /* clipboard unavailable: the text stays selectable */
  }
}

function downloadCodes(codes: string[]) {
  const blob = new Blob([`Tabaa - codes de secours\n\n${codes.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tabaa-codes-de-secours.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CodesView({ codes, onFinish }: { codes: string[]; onFinish: () => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <ModalHeader title={t("mfa.step3Title")} description={t("mfa.step3Body")} showCloseButton={false} />
      <ModalBody>
        <ul aria-label={t("mfa.codesLabel")} dir="ltr" className="grid grid-cols-2 gap-2 rounded-2xl bg-background-secondary-default p-4">
          {codes.map((c) => (
            <li key={c} className="ident text-body-medium text-text-primary">{c}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="small" leadingIcon={RiFileCopyLine} onClick={() => void copy(codes.join("\n"), t("mfa.copied"))}>{t("mfa.copyCodes")}</Button>
          <Button variant="secondary" size="small" leadingIcon={RiDownload2Line} onClick={() => downloadCodes(codes)}>{t("mfa.downloadCodes")}</Button>
        </div>
        <div className="mt-4">
          <Checkbox isSelected={saved} onChange={setSaved}>{t("mfa.saved")}</Checkbox>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onFinish} disabled={!saved}>{t("mfa.done")}</Button>
      </ModalFooter>
    </>
  );
}

function EnrolDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setCode("");
    setCodes([]);
    setError(null);
    setSetup(null);
    void setupMfa().then((res) => {
      if (res.ok) setSetup(res.data);
      else setError(res.error.message);
    });
  }, [isOpen]);

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await enableMfa({ code });
      if (res.ok) {
        setCodes(res.data.recoveryCodes);
        setStep(3);
        toast.success(t("mfa.enabledToast"));
      } else setError(res.error.code === "INVALID_CODE" ? t("auth.err.invalidCode") : res.error.message);
    });

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={step !== 3} isKeyboardDismissDisabled={step === 3} size="md" aria-label={t("mfa.title")}>
      {({ close }) =>
        step === 3 ? (
          <CodesView codes={codes} onFinish={close} />
        ) : step === 1 ? (
          <>
            <ModalHeader title={t("mfa.step1Title")} description={t("mfa.step1Body")} closeLabel={t("common.close")} />
            <ModalBody>
              {error && <Notice tone="error">{error}</Notice>}
              {setup && (
                <div className="flex flex-col items-center gap-4">
                  <QrCode value={setup.otpauthUrl} label={t("mfa.qrLabel")} />
                  <div className="flex w-full flex-col gap-1.5">
                    <span className="text-body-medium text-text-secondary">{t("mfa.secret")}</span>
                    <div className="flex items-center justify-between gap-2 rounded-2lg bg-background-secondary-default p-2.5">
                      <code dir="ltr" className="ident text-body-medium break-all text-text-primary select-all">{group4(setup.secret)}</code>
                      <Button variant="secondary" size="small" leadingIcon={RiFileCopyLine} onClick={() => void copy(setup.secret, t("mfa.copied"))}>{t("mfa.copy")}</Button>
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
              <Button onClick={() => setStep(2)} disabled={!setup}>{t("mfa.continue")}</Button>
            </ModalFooter>
          </>
        ) : (
          <>
            <ModalHeader title={t("mfa.step2Title")} description={t("mfa.step2Body")} closeLabel={t("common.close")} />
            <ModalBody>
              <form id="mfa-enable" noValidate onSubmit={(e) => { e.preventDefault(); if (code.length === 6) confirm(); }} className="flex flex-col gap-4">
                {error && <Notice tone="error">{error}</Notice>}
                <Input
                  autoFocus
                  label={t("reauth.code")}
                  aria-label={t("reauth.code")}
                  value={code}
                  onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  inputDir="ltr"
                  inputClassName="ident tracking-[0.3em]"
                  placeholder="000000"
                />
              </form>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setStep(1)}>{t("common.back")}</Button>
              <Button type="submit" form="mfa-enable" disabled={code.length !== 6 || pending}>{t("mfa.confirm")}</Button>
            </ModalFooter>
          </>
        )
      }
    </Modal>
  );
}

export function MfaSection() {
  const { t } = useI18n();
  const me = useMe();
  const [enrol, setEnrol] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const on = !!me?.mfaEnabled;

  return (
    <>
      <Section title={t("mfa.title")} description={on ? t("mfa.onBody") : t("mfa.offBody")}>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Chip color={on ? "lime" : "gray"} variant="caption">{on ? t("mfa.on") : t("mfa.off")}</Chip>
          {on ? (
            <>
              <Button variant="secondary" onClick={() => setRegenerating(true)}>{t("mfa.regenerate")}</Button>
              <Button variant="secondary" onClick={() => setDisabling(true)}>{t("mfa.disable")}</Button>
            </>
          ) : (
            <Button onClick={() => setEnrol(true)}>{t("mfa.enable")}</Button>
          )}
        </div>
      </Section>

      <EnrolDialog isOpen={enrol} onOpenChange={setEnrol} />

      <SensitiveDialog
        isOpen={disabling}
        onOpenChange={setDisabling}
        title={t("mfa.disableTitle")}
        description={t("mfa.disableBody")}
        confirmLabel={t("mfa.disable")}
        danger
        run={(reauth) => disableMfa(reauth)}
        onDone={() => toast.success(t("mfa.disabledToast"))}
      />
      <SensitiveDialog
        isOpen={regenerating}
        onOpenChange={setRegenerating}
        title={t("mfa.regenerateTitle")}
        description={t("mfa.regenerateBody")}
        confirmLabel={t("mfa.regenerate")}
        run={(reauth) => regenerateRecoveryCodes(reauth)}
        onDone={(res) => setNewCodes(res.recoveryCodes)}
      />
      <Modal isOpen={newCodes !== null} onOpenChange={(o) => { if (!o) setNewCodes(null); }} isDismissable={false} isKeyboardDismissDisabled size="md" aria-label={t("mfa.step3Title")}>
        {({ close }) => newCodes && <CodesView codes={newCodes} onFinish={close} />}
      </Modal>
    </>
  );
}
