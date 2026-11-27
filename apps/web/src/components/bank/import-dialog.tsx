"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RiCheckboxCircleLine, RiFileTextLine, RiLockLine, RiUploadCloud2Line } from "@remixicon/react";
import type { ApiError, BankImport } from "@facture/core";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/auth/fields";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/base/modal/modal";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { importBank } from "@/lib/actions";
import { analyze, buildLines, decodeBytes, MAX_LINES, SEPARATORS, type Analysis, type Mapping, type Separator } from "@/lib/bank-csv";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { cx } from "@/utils/cx";

const MAX_BYTES = 5 * 1024 * 1024;
const NONE = "none";
const sepName = (s: Separator) => (s === "\t" ? "TAB" : s);

type Loaded = { name: string; text: string; encoding: string };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [file, setFile] = useState<Loaded | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [account, setAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BankImport | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const built = useMemo(() => (analysis && mapping ? buildLines(analysis, mapping) : null), [analysis, mapping]);

  const take = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_BYTES) return setError(t("bank.imp.tooBig"));
    let loaded: Loaded;
    try {
      const { text, encoding } = decodeBytes(await f.arrayBuffer());
      loaded = { name: f.name, text, encoding };
    } catch {
      return setError(t("bank.imp.readFailed"));
    }
    const a = analyze(loaded.text);
    if (a.rows.length === 0 || a.columns < 2) return setError(t("bank.imp.notCsv"));
    setFile(loaded);
    setAnalysis(a);
    setMapping(a.mapping);
  };

  const changeSeparator = (separator: Separator) => {
    if (!file) return;
    const a = analyze(file.text, { separator });
    setAnalysis(a);
    setMapping(a.mapping);
  };

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setMapping(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const submit = async () => {
    if (!built || !file || pending || built.lines.length === 0 || built.tooMany) return;
    setPending(true);
    setError(null);
    const res = await importBank({
      fileName: file.name.slice(0, 200),
      accountLabel: account.trim().slice(0, 100),
      lines: built.lines.map(({ date, label, amount, reference }) => ({ date, label, amount, ...(reference ? { reference } : {}) })),
    });
    setPending(false);
    if (res.ok) {
      setResult(res.data);
      router.refresh();
    } else setError(errorText(res.error));
  };

  const errorText = (e: ApiError) => (e.code === "FORBIDDEN" ? e.message : e.issues?.[0]?.message ?? t("bank.imp.failed"));

  const colName = (i: number) => {
    const h = analysis?.headers[i]?.trim();
    return h ? h : t("bank.imp.column", { n: i + 1 });
  };
  const colOptions = (optional: boolean) => {
    const cols = Array.from({ length: analysis?.columns ?? 0 }, (_, i) => ({ key: String(i), label: colName(i) }));
    return optional ? [{ key: NONE, label: t("bank.imp.none") }, ...cols] : cols;
  };
  const pick = (field: "date" | "label" | "amount" | "debit" | "credit") => ({
    selectedKey: mapping && mapping[field] >= 0 ? String(mapping[field]) : null,
    onSelectionChange: (k: React.Key | null) => k !== null && setMapping((m) => (m ? { ...m, [field]: Number(k) } : m)),
  });
  const colSelect = (label: string, field: "date" | "label" | "amount" | "debit" | "credit") => (
    <Select label={label} className="w-full" triggerClassName="w-full" placeholder={t("bank.imp.none")} {...pick(field)}>
      {colOptions(false).map((o) => (
        <SelectItem key={o.key} id={o.key} textValue={o.label}>{o.label}</SelectItem>
      ))}
    </Select>
  );

  const money = (v: string, className?: string) => <Money value={v} locale={locale} className={className} />;

  if (result) {
    return (
      <Modal isOpen onOpenChange={(o) => !o && onClose()} size="md" aria-label={t("bank.imp.title")}>
        {({ close }) => (
          <>
            <ModalHeader title={t("bank.imp.title")} closeLabel={t("common.close")} />
            <ModalBody>
              <div className="grid justify-items-center gap-3 py-6 text-center">
                <RiCheckboxCircleLine className="size-10 text-accent-600" aria-hidden />
                <h3 role="status" className="text-title-3-medium text-text-primary">
                  {t("bank.imp.done", { n: result.lineCount })}
                  {result.duplicateCount > 0 && <>, {t("bank.imp.doneDup", { d: result.duplicateCount })}</>}
                </h3>
                {result.duplicateCount > 0 && <p className="max-w-sm text-body-regular text-text-secondary">{t("bank.imp.doneBody")}</p>}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={close}>{t("common.close")}</Button>
              <Button
                onClick={() => {
                  router.push(`/banque?status=UNMATCHED&imp=${encodeURIComponent(result.id)}`);
                  close();
                }}
              >
                {t("bank.imp.view")}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal isOpen onOpenChange={(o) => !o && !pending && onClose()} size="xl" aria-label={t("bank.imp.title")}>
      {({ close }) => (
        <>
          <ModalHeader title={t("bank.imp.title")} description={file ? undefined : t("bank.imp.intro")} closeLabel={t("common.close")} />
          <ModalBody>
            <div className="grid gap-4 pt-1">
              {error && <Notice tone="error">{error}</Notice>}

              {!file || !analysis || !mapping || !built ? (
                <>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      void take(e.dataTransfer.files[0]);
                    }}
                    className={cx(
                      "grid cursor-pointer place-items-center gap-2 rounded-2xl border border-dashed px-4 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-border-focus-ring",
                      dragging ? "border-border-button-active bg-background-secondary-default" : "border-border-button-default hover:bg-background-secondary-default",
                    )}
                  >
                    <RiUploadCloud2Line className="size-8 text-foreground-icon-secondary" aria-hidden />
                    <span className="text-body-medium text-text-primary max-nav:hidden">{t("bank.imp.drop")}</span>
                    <span className="text-body-regular text-text-secondary max-nav:hidden">{t("bank.imp.or")}</span>
                    <span className="inline-flex min-h-9 items-center rounded-2lg border border-border-button-default bg-background-primary-default px-3.5 text-body-medium text-text-primary shadow-xs max-nav:min-h-11">
                      {t("bank.imp.choose")}
                    </span>
                    <input
                      ref={input}
                      type="file"
                      accept=".csv,.txt,text/csv,text/plain"
                      aria-label={t("bank.imp.choose")}
                      className="sr-only"
                      onChange={(e) => void take(e.target.files?.[0])}
                    />
                  </label>
                  <p className="flex items-start gap-2 text-body-regular text-text-secondary">
                    <RiLockLine className="mt-0.5 size-[18px] shrink-0 text-foreground-icon-secondary" aria-hidden />
                    {t("bank.imp.private")}
                  </p>
                  <p className="text-caption-1-regular text-text-tertiary">{t("bank.imp.formats")}</p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-background-secondary-default px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <RiFileTextLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <div className="min-w-0">
                        <div dir="ltr" className="truncate text-start text-body-medium text-text-primary">{file.name}</div>
                        <div className="text-caption-1-regular text-text-secondary">
                          {t("bank.imp.detected", { encoding: file.encoding === "utf-8" ? "UTF-8" : "Windows-1252", sep: sepName(analysis.separator) })}
                        </div>
                      </div>
                    </div>
                    <Button size="small" variant="secondary" onClick={reset} disabled={pending}>{t("bank.imp.other")}</Button>
                  </div>

                  {built.lines.length === 0 ? (
                    <Notice tone="error">{t("bank.imp.noLines")}</Notice>
                  ) : (
                    <section aria-label={t("bank.imp.preview")} className="grid gap-3">
                      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-background-secondary-default p-4 sm:grid-cols-4">
                        <div>
                          <dt className="text-caption-1-regular text-text-secondary">{t("bank.imp.lines")}</dt>
                          <dd className="num text-headline-semibold text-text-primary rtl:text-right">{built.lines.length}</dd>
                        </div>
                        <div>
                          <dt className="text-caption-1-regular text-text-secondary">{t("bank.imp.received")}</dt>
                          <dd className="text-headline-semibold text-text-primary">{money(built.received)}</dd>
                        </div>
                        <div>
                          <dt className="text-caption-1-regular text-text-secondary">{t("bank.imp.paidOut")}</dt>
                          <dd className="text-headline-semibold text-text-primary">{money(built.paidOut)}</dd>
                        </div>
                        <div>
                          <dt className="text-caption-1-regular text-text-secondary">{t("bank.imp.period")}</dt>
                          <dd className="num text-body-medium text-text-primary rtl:text-right">
                            {built.from && built.to ? t("bank.imp.periodValue", { from: fmtDate(built.from), to: fmtDate(built.to) }) : "-"}
                          </dd>
                        </div>
                      </dl>

                      <h3 className="text-body-medium text-text-primary">{t("bank.imp.preview")}</h3>
                      <ul className="divide-y divide-separator-border rounded-2xl border border-border-table">
                        {built.lines.slice(0, 5).map((l) => (
                          <li key={l.line} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-body-medium text-text-primary">{l.label}</div>
                              <div className="num text-caption-1-regular text-text-secondary">
                                {fmtDate(l.date)}
                                {l.reference && <span dir="ltr"> · {l.reference}</span>}
                              </div>
                            </div>
                            {money(l.amount, cx("text-body-medium", l.amount.startsWith("-") ? "text-text-tertiary" : "text-text-primary"))}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {built.ignored > 0 && <p className="text-caption-1-regular text-text-secondary">{t("bank.imp.ignoredRows", { n: built.ignored })}</p>}
                  {built.errors.length > 0 && (
                    <div role="alert" className="grid gap-2 rounded-2xl bg-status-rose-background px-4 py-3 text-status-rose-text">
                      <p className="text-body-medium">{t("bank.imp.errors", { n: built.errors.length })}</p>
                      <ul className="grid gap-1 text-caption-1-regular">
                        {built.errors.slice(0, 5).map((e) => (
                          <li key={e.line} className="flex flex-wrap gap-x-2">
                            <span className="num font-medium">{t("bank.imp.errLine", { line: e.line })}</span>
                            <span>{t(`bank.imp.err.${e.code}` as Key)}</span>
                            <span dir="ltr" className="min-w-0 max-w-full truncate opacity-80">{e.raw}</span>
                          </li>
                        ))}
                        {built.errors.length > 5 && <li>{t("bank.imp.errMore", { n: built.errors.length - 5 })}</li>}
                      </ul>
                    </div>
                  )}
                  {built.tooMany && <Notice tone="error">{t("bank.imp.tooMany")}</Notice>}
                  <div className="border-t border-separator-border pt-4">
                    <h3 className="text-headline-medium text-text-primary">{t("bank.imp.mapping")}</h3>
                    <p className="text-body-regular text-text-secondary">{t("bank.imp.mappingHint")}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {colSelect(t("bank.imp.date"), "date")}
                    {colSelect(t("bank.imp.label"), "label")}
                    <div className="grid content-start gap-1.5 sm:col-span-2">
                      <span className="text-body-medium text-text-primary">{t("bank.imp.amountMode")}</span>
                      <SegmentedControl
                        aria-label={t("bank.imp.amountMode")}
                        selectedKeys={[mapping.mode]}
                        onSelectionChange={(keys) => {
                          const k = [...keys][0];
                          if (k === "signed" || k === "split") setMapping({ ...mapping, mode: k });
                        }}
                        className="w-full sm:w-fit [&>*]:flex-1"
                      >
                        <SegmentedControlItem id="signed">{t("bank.imp.signed")}</SegmentedControlItem>
                        <SegmentedControlItem id="split">{t("bank.imp.split")}</SegmentedControlItem>
                      </SegmentedControl>
                    </div>
                    {mapping.mode === "signed" ? (
                      <div className="sm:col-span-2">{colSelect(t("bank.imp.amount"), "amount")}</div>
                    ) : (
                      <>
                        {colSelect(t("bank.imp.debit"), "debit")}
                        {colSelect(t("bank.imp.credit"), "credit")}
                      </>
                    )}
                    <Select
                      label={t("bank.imp.reference")}
                      className="w-full"
                      triggerClassName="w-full"
                      selectedKey={mapping.reference === null ? NONE : String(mapping.reference)}
                      onSelectionChange={(k) => setMapping({ ...mapping, reference: k === NONE || k === null ? null : Number(k) })}
                    >
                      {colOptions(true).map((o) => (
                        <SelectItem key={o.key} id={o.key} textValue={o.label}>{o.label}</SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={t("bank.imp.sep")}
                      className="w-full"
                      triggerClassName="w-full"
                      selectedKey={analysis.separator}
                      onSelectionChange={(k) => k !== null && changeSeparator(String(k) as Separator)}
                    >
                      {SEPARATORS.map((s) => (
                        <SelectItem key={s} id={s} textValue={t(`bank.imp.sep.${s}` as Key)}>{t(`bank.imp.sep.${s}` as Key)}</SelectItem>
                      ))}
                    </Select>
                    <div className="sm:col-span-2">
                      <Input label={t("bank.imp.account")} hint={t("bank.imp.accountHint")} value={account} onChange={setAccount} maxLength={100} />
                    </div>
                  </div>

                </>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close} disabled={pending}>{t("common.cancel")}</Button>
            {built && (
              <Button onClick={() => void submit()} disabled={pending || built.lines.length === 0 || built.tooMany} aria-busy={pending}>
                {pending ? t("bank.imp.importing") : t("bank.imp.submit", { n: Math.min(built.lines.length, MAX_LINES + 1) })}
              </Button>
            )}
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
