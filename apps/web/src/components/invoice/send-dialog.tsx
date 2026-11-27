"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiAttachment2, RiFilePdf2Line, RiMailSendLine } from "@remixicon/react";
import type { ApiError, DeliveryKind } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { LinkButton } from "@/components/base/buttons/link-button";
import { Input } from "@/components/base/input/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Switch } from "@/components/base/switch/switch";
import { Textarea } from "@/components/base/textarea/textarea";
import { toast } from "@/components/base/toast/toast";
import { Notice } from "@/components/auth/fields";
import { getSendPreview, sendInvoice } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-client";
import { EmailChips, MAX_RECIPIENTS } from "./email-chips";

export type SendTarget = {
  id: string;
  number: string | null;
  isCredit: boolean;
  /** Where to fix a missing address: the customer page when known, else the invoice page that links to it. */
  customerId?: string;
  /** Something is still due, so a reminder makes sense. */
  remindable: boolean;
  overdue: boolean;
};

const MESSAGE_MAX = 4000;
const SUBJECT_MAX = 200;

/** The send dialog, opened with `open(target)`. Returns the element to render once. */
export function useSendDialog() {
  const [target, setTarget] = useState<SendTarget | null>(null);
  const [count, setCount] = useState(0);
  const dialog = target ? <SendDialog key={count} target={target} onClose={() => setTarget(null)} /> : null;
  const open = useCallback((t: SendTarget) => {
    setCount((c) => c + 1);
    setTarget(t);
  }, []);
  return { open, dialog };
}

function SendDialog({ target, onClose }: { target: SendTarget; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState<DeliveryKind>(target.remindable && target.overdue ? "REMINDER" : "INVOICE");
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachUbl, setAttachUbl] = useState(false);
  const [loaded, setLoaded] = useState<DeliveryKind | null>(null);
  const [failedKind, setFailedKind] = useState<DeliveryKind | null>(null);
  const [toEdited, setToEdited] = useState(false);
  const loading = loaded !== kind;
  const previewFailed = failedKind === kind;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const edited = useRef({ to: false, text: false });

  useEffect(() => {
    let stale = false;
    getSendPreview(target.id, kind).then((res) => {
      if (stale) return;
      setLoaded(kind);
      if (!res.ok) return setFailedKind(kind);
      if (!edited.current.to) setTo(res.data.to.slice(0, MAX_RECIPIENTS));
      if (!edited.current.text) {
        setSubject(res.data.subject);
        setMessage(res.data.message);
      }
    });
    return () => {
      stale = true;
    };
  }, [target.id, kind]);

  const reminder = kind === "REMINDER";
  const pdfName = `${target.number ?? "facture"}.pdf`;
  const issue = (path: string) => error?.issues?.find((i) => i.path === path || i.path.startsWith(`${path}.`) || i.path.startsWith(`${path}[`))?.message;

  const failure = (e: ApiError) => {
    if (e.code === "SEND_LIMIT") return t("send.err.SEND_LIMIT");
    if (e.code === "MAIL_FAILED") return t("send.err.MAIL_FAILED");
    if (e.code === "FORBIDDEN" || e.code.startsWith("PDF_")) return e.message;
    return e.message || t("send.err.generic");
  };

  const submit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (sending || loading) return;
    setError(null);
    if (!to.length) {
      setError({ code: "VALIDATION", message: "", issues: [{ path: "to", rule: "min", message: t("send.noRecipient") }] });
      return;
    }
    setSending(true);
    const res = await sendInvoice(target.id, { kind, to, cc, subject: subject.trim(), message, attachUbl });
    setSending(false);
    if (res.ok) {
      toast.success(t(reminder ? "send.reminded" : "send.sent", { n: to.length + cc.length }));
      router.refresh();
      onClose();
    } else setError(res.error);
  };

  const title = reminder ? t("send.titleReminder") : t(target.isCredit ? "send.titleCredit" : "send.title");
  const topError = error && error.code !== "VALIDATION" ? failure(error) : null;

  return (
    <Modal isOpen onOpenChange={(o) => !o && !sending && onClose()} size="lg" aria-label={title}>
      <ModalHeader title={title} description={t("send.intro")} closeLabel={t("common.close")} />
      <ModalBody>
        <form id="send-form" onSubmit={submit} noValidate className="grid gap-4">
          {topError && <Notice tone="error">{topError}</Notice>}
          {previewFailed && <Notice tone="info">{t("send.previewFailed")}</Notice>}

          {target.remindable && !target.isCredit && (
            <SegmentedControl
              aria-label={t("send.kind")}
              selectedKeys={[kind]}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                if ((k === "INVOICE" || k === "REMINDER") && k !== kind) {
                  setError(null);
                  setKind(k);
                }
              }}
              className="w-full [&>*]:flex-1"
            >
              <SegmentedControlItem id="INVOICE">{t("send.kind.INVOICE")}</SegmentedControlItem>
              <SegmentedControlItem id="REMINDER">{t("send.kind.REMINDER")}</SegmentedControlItem>
            </SegmentedControl>
          )}

          <div className="grid gap-2">
            <EmailChips
              label={t("send.to")}
              value={to}
              onChange={(v) => {
                edited.current.to = true;
                setToEdited(true);
                setTo(v);
                setError(null);
              }}
              error={issue("to")}
              hint={t("send.toHint")}
              autoFocus={!loading && to.length === 0}
            />
            {!loading && to.length === 0 && !toEdited && !previewFailed && (
              <div className="grid justify-items-start gap-1 text-caption-1-regular text-text-secondary">
                <p>{t("send.noEmail")}</p>
                <LinkButton href={target.customerId ? `/clients/${target.customerId}` : `/factures/${target.id}`} size="small">{t("send.editCustomer")}</LinkButton>
              </div>
            )}
          </div>

          {showCc || cc.length ? (
            <EmailChips label={t("send.cc")} value={cc} onChange={setCc} error={issue("cc")} />
          ) : (
            <div>
              <LinkButton size="small" leadingIcon={RiAddLine} onClick={() => setShowCc(true)}>
                {t("send.addCc")}
              </LinkButton>
            </div>
          )}

          <Input
            label={t("send.subject")}
            value={subject}
            onChange={(v) => {
              edited.current.text = true;
              setSubject(v);
            }}
            maxLength={SUBJECT_MAX}
            isInvalid={!!issue("subject")}
            errorMessage={issue("subject")}
            isDisabled={loading}
          />

          <div className="grid gap-1">
            <Textarea
              label={t("send.message")}
              value={message}
              onChange={(v) => {
                edited.current.text = true;
                setMessage(v);
              }}
              rows={6}
              maxLength={MESSAGE_MAX}
              isInvalid={!!issue("message")}
              isDisabled={loading}
            />
            {message.length >= MESSAGE_MAX - 300 && (
              <p aria-live="polite" className="num text-end text-caption-1-regular text-text-secondary">
                {t("send.counter", { n: message.length })}
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-2xl bg-background-secondary-default p-3.5">
            <div className="flex items-center gap-2.5 text-body-regular text-text-primary">
              <RiAttachment2 className="size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="text-caption-1-medium text-text-secondary">{t("send.attached")}</span>
            </div>
            <ul className="grid gap-1.5">
              <li className="flex items-center gap-2 text-body-medium text-text-primary">
                <RiFilePdf2Line className="size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />
                <span dir="ltr" className="ident truncate">{pdfName}</span>
              </li>
              {attachUbl && (
                <li className="flex items-center gap-2 text-body-medium text-text-primary">
                  <RiAttachment2 className="size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span dir="ltr" className="ident truncate">{(target.number ?? "facture") + ".xml"}</span>
                </li>
              )}
            </ul>
            <Switch isSelected={attachUbl} onChange={setAttachUbl}>{t("send.attachUbl")}</Switch>
            <p className="-mt-1 text-caption-1-regular text-text-secondary">{t("send.attachUblHint")}</p>
          </div>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={sending}>{t("common.cancel")}</Button>
        <Button type="submit" form="send-form" leadingIcon={sending ? undefined : RiMailSendLine} disabled={sending || loading} aria-busy={sending}>
          {sending ? t("send.sending") : t(reminder ? "send.confirmReminder" : "send.confirm")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
