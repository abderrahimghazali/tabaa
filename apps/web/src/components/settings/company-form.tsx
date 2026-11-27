"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RiAlertLine, RiArrowDownSLine, RiCheckLine, RiInformationLine } from "@remixicon/react";
import {
  activeRules,
  validateIce,
  validateRib,
  type ApiError,
  type Company,
  type CompanyInput,
} from "@facture/core";
import { Card, Tray } from "@/components/app/layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NumberField } from "@/components/base/number-field/number-field";
import { Notification } from "@/components/base/notification/notification";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { toast } from "@/components/base/toast/toast";
import type { Mark, Zone } from "@/components/invoice/invoice-sheet";
import { IssueList } from "@/components/ui/issue-list";
import { saveCompany } from "@/lib/actions";
import { digits, groupDigits, ICE_GROUPS, RIB_GROUPS, todayIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { useCanAdmin, useCanWrite } from "@/lib/me-client";
import { issuesAt } from "@/lib/result";
import { cx } from "@/utils/cx";
import { CompanyPreview } from "./company-preview";
import { ProfileStatus, type ProfileLine } from "./company-status";
import { useLeaveGuard } from "./leave-guard";

const FORMS = ["SARL", "SARL AU", "SA", "SNC", "SCS", "Auto-entrepreneur", "Personne physique"];
const REGIMES = ["MONTHLY", "QUARTERLY", "NOT_SUBJECT"] as const;
const BASES = ["CASH", "ACCRUAL"] as const;
const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const FIELD = "border border-border-button-default bg-background-primary-default shadow-xs";

type Values = {
  name: string;
  legalForm: string;
  capital: number;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  ice: string;
  ifNumber: string;
  rcNumber: string;
  rcCourt: string;
  tpNumber: string;
  cnssNumber: string;
  vatRegime: (typeof REGIMES)[number];
  vatTaxPoint: "RECEIPTS" | "DEBITS";
  vatBasis: (typeof BASES)[number];
  bankName: string;
  rib: string;
};

const fromCompany = (c: Company | null): Values => ({
  name: c?.name ?? "",
  legalForm: c?.legalForm ?? "",
  capital: c?.capital ? Number(c.capital) : Number.NaN,
  line1: c?.address.line1 ?? "",
  line2: c?.address.line2 ?? "",
  postalCode: c?.address.postalCode ?? "",
  city: c?.address.city ?? "",
  phone: c?.phone ?? "",
  email: c?.email ?? "",
  ice: digits(c?.ice ?? ""),
  ifNumber: c?.ifNumber ?? "",
  rcNumber: c?.rcNumber ?? "",
  rcCourt: c?.rcCourt ?? "",
  tpNumber: c?.tpNumber ?? "",
  cnssNumber: c?.cnssNumber ?? "",
  vatRegime: c?.vatRegime ?? "MONTHLY",
  vatTaxPoint: c?.vatTaxPoint ?? "RECEIPTS",
  vatBasis: c?.vatBasis ?? "CASH",
  bankName: c?.bankName ?? "",
  rib: digits(c?.rib ?? ""),
});

function SettingsRow({
  label,
  hint,
  zone,
  onZone,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  zone?: Zone;
  onZone: (z: Zone | null) => void;
  children: React.ReactNode;
}) {
  const labelId = useId();
  const row = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={row}
      role="group"
      aria-labelledby={labelId}
      onFocus={() => onZone(zone ?? null)}
      onBlur={() => onZone(null)}
      className="grid gap-x-8 gap-y-2 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start"
    >
      <div className="min-w-0 sm:pt-[9px]">
        <div
          id={labelId}
          onClick={() => row.current?.querySelector<HTMLElement>("input, button")?.focus()}
          className="text-body-medium text-text-primary"
        >
          {label}
        </div>
        {hint && <div className="mt-0.5 text-caption-1-regular text-text-tertiary">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SectionCard({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="scroll-mt-6">
      <section id={id} className="scroll-mt-6">
        <header className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-headline-medium text-text-primary">{title}</h2>
          <p className="mt-0.5 text-body-regular text-text-secondary">{description}</p>
        </header>
        <div className="mt-2 divide-y divide-border-button-default px-5 pb-2 sm:px-6">{children}</div>
      </section>
    </Card>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? RiCheckLine : RiAlertLine;
  return (
    <span className={cx("inline-flex items-start gap-1", ok ? "text-green-600" : "text-red-600")}>
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export function CompanyForm({ company }: { company: Company | null }) {
  const { t } = useI18n();
  const canWrite = useCanAdmin();
  const canWriteAny = useCanWrite();
  const router = useRouter();
  const guard = useLeaveGuard();
  const reduce = useReducedMotion();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const rules = activeRules(todayIso());
  const [base, setBase] = useState<Values>(() => fromCompany(company));
  const [v, setV] = useState<Values>(base);
  const [zone, setZone] = useState<Zone | null>(null);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));

  const dirty = canWrite && JSON.stringify(v) !== JSON.stringify(base);
  useEffect(() => {
    guard.setDirty(dirty);
    return () => guard.setDirty(false);
  }, [dirty, guard.setDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const iceCheck = v.ice ? validateIce(v.ice) : null;
  const iceError = issuesAt(error, "ice") ?? (iceCheck && !iceCheck.valid ? t("ice.invalid", { n: v.ice.length }) : undefined);
  const ribCheck = v.rib ? validateRib(v.rib) : null;
  const ribError = issuesAt(error, "rib") ?? (ribCheck && !ribCheck.valid ? t("rib.invalid", { n: v.rib.length }) : undefined);
  const f = (path: string) => issuesAt(error, path);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const input: CompanyInput = {
      name: v.name.trim(),
      legalForm: opt(v.legalForm),
      capital: Number.isNaN(v.capital) ? undefined : v.capital.toFixed(2),
      address: {
        line1: v.line1.trim(),
        line2: opt(v.line2),
        postalCode: opt(v.postalCode),
        city: v.city.trim(),
        country: "MA",
      },
      ice: v.ice,
      ifNumber: opt(v.ifNumber),
      rcNumber: opt(v.rcNumber),
      rcCourt: opt(v.rcCourt),
      tpNumber: opt(v.tpNumber),
      cnssNumber: opt(v.cnssNumber),
      vatRegime: v.vatRegime,
      vatBasis: v.vatBasis,
      vatTaxPoint: v.vatBasis === "CASH" ? "RECEIPTS" : "DEBITS",
      phone: opt(v.phone),
      email: opt(v.email),
      bankName: opt(v.bankName),
      rib: opt(v.rib),
      defaultPaymentTermDays: company?.defaultPaymentTermDays ?? rules.defaultPaymentTermDays,
      invoiceLanguage: company?.invoiceLanguage ?? "fr",
    };
    setError(null);
    start(async () => {
      const res = await saveCompany(input);
      if (res.ok) {
        guard.setDirty(false);
        setBase(v);
        toast.success(t("company.saved"));
        if (!company) router.push("/");
      } else {
        setError(res.error);
        toast.error(t("error.fixFields"));
        requestAnimationFrame(() =>
          requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()),
        );
      }
    });
  };

  const cancel = () => {
    setV(base);
    setError(null);
  };

  const text = (
    key: keyof Values,
    label: string,
    extra: { ident?: boolean; path?: string; type?: string; list?: string; inputDir?: "ltr" } = {},
  ) => (
    <Input
      name={key}
      aria-label={label}
      type={extra.type}
      value={String(v[key])}
      onChange={(val) => set(key, val as never)}
      isInvalid={!!f(extra.path ?? key)}
      errorMessage={f(extra.path ?? key)}
      maxLength={{ name: 200, line1: 200, line2: 200, postalCode: 20, city: 100 }[String(key)]}
      fieldClassName={FIELD}
      inputClassName={extra.ident ? "ident" : undefined}
      {...(extra.list ? ({ list: extra.list } as object) : {})}
    />
  );

  const mark: Mark = { zone, blanks: true };
  const language = company?.invoiceLanguage ?? "fr";
  const preview = {
    id: "",
    name: v.name.trim(),
    legalForm: opt(v.legalForm),
    capital: Number.isNaN(v.capital) ? undefined : v.capital.toFixed(2),
    address: { line1: v.line1.trim(), line2: opt(v.line2), postalCode: opt(v.postalCode), city: v.city.trim(), country: "MA" },
    ice: v.ice,
    ifNumber: opt(v.ifNumber),
    rcNumber: opt(v.rcNumber),
    rcCourt: opt(v.rcCourt),
    tpNumber: opt(v.tpNumber),
    cnssNumber: opt(v.cnssNumber),
    vatRegime: v.vatRegime,
    vatTaxPoint: v.vatBasis === "CASH" ? "RECEIPTS" : "DEBITS",
    vatBasis: v.vatBasis,
    phone: opt(v.phone),
    email: opt(v.email),
    bankName: opt(v.bankName),
    rib: v.rib,
    defaultPaymentTermDays: 60,
    invoiceLanguage: language,
  } as Company;

  const sectionName = (id: ProfileLine["id"]) => t(({ identity: "company.identity", legal: "company.legal", vat: "company.vat", bank: "company.bank" } as const)[id]);
  const previewEl = (
    <CompanyPreview company={preview} language={language} mark={mark} label={t("co.previewAria")} skeletonLabel={t("co.skel")} />
  );
  const statusEl = (compact: boolean) => <ProfileStatus values={v} t={t} sectionName={sectionName} compact={compact} />;
  const Hint = () => (
    <p className="mt-2 flex items-start gap-1.5 text-caption-1-regular text-text-secondary">
      <RiInformationLine className="mt-px size-3.5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      <span>{t(`co.regime.${v.vatRegime}.hint`)}</span>
    </p>
  );

  return (
    <form id="company-form" ref={formRef} onSubmit={submit} noValidate>
      <div className="grid items-start gap-x-8 gap-y-4 wide:grid-cols-[minmax(0,720px)_400px]">
        <div className="grid min-w-0 gap-4">
          {!company && (
            <Notification status="information" dismissible={false} title={t("company.firstTime")} description={t("company.firstTimeBody")} />
          )}
          {!canWrite && canWriteAny && <Notification status="information" dismissible={false} title={t("co.readOnly")} />}
          <div className="empty:hidden">
            <IssueList error={error} />
          </div>

          <div className="wide:hidden">
            <Card className="rounded-2xl px-4 py-3">{statusEl(true)}</Card>
          </div>
          <details className="group wide:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl border border-border-button-default bg-background-primary-default px-4 py-3 text-body-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden">
              {t("company.preview")}
              <RiArrowDownSLine className="size-5 text-foreground-icon-secondary transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <Tray className="mt-2 p-3">{previewEl}</Tray>
          </details>

          <div inert={!canWrite || undefined} className="grid min-w-0 gap-4">
            <SectionCard id="identity" title={t("company.identity")} description={t("company.identityHint")}>
              <SettingsRow label={t("company.name")} hint={t("co.h.name")} zone="name" onZone={setZone}>
                {text("name", t("company.name"))}
              </SettingsRow>
              <SettingsRow label={t("company.legalForm")} hint={t("co.h.legalForm")} zone="legalForm" onZone={setZone}>
                {text("legalForm", t("company.legalForm"), { list: "legal-forms" })}
                <datalist id="legal-forms">
                  {FORMS.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </SettingsRow>
              <SettingsRow label={t("company.capital")} hint={t("company.capitalHint")} zone="capital" onZone={setZone}>
                <NumberField
                  name="capital"
                  aria-label={t("company.capital")}
                  value={v.capital}
                  onChange={(n) => set("capital", n)}
                  minValue={0}
                  formatOptions={{ maximumFractionDigits: 2, useGrouping: false }}
                  isInvalid={!!f("capital")}
                  fieldClassName={FIELD}
                  hideSteppers
                />
              </SettingsRow>
              <SettingsRow label={t("field.address")} hint={t("co.h.address")} zone="address" onZone={setZone}>
                <div className="grid gap-2">
                  {text("line1", t("field.address"), { path: "address.line1" })}
                  {text("line2", t("field.address2"))}
                </div>
              </SettingsRow>
              <SettingsRow label={t("co.l.postal")} zone="address" onZone={setZone}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                  {text("postalCode", t("field.postalCode"))}
                  {text("city", t("field.city"), { path: "address.city" })}
                </div>
              </SettingsRow>
              <SettingsRow label={t("co.l.contact")} hint={t("co.h.contact")} zone="contact" onZone={setZone}>
                <div className="grid gap-2">
                  {text("phone", t("field.phone"), { type: "tel" })}
                  {text("email", t("field.email"), { type: "email" })}
                </div>
              </SettingsRow>
            </SectionCard>

            <SectionCard id="legal" title={t("company.legal")} description={t("company.legalHint")}>
              <SettingsRow
                label="ICE"
                zone="ice"
                onZone={setZone}
                hint={v.ice ? <Verdict ok={!!iceCheck?.valid}>{iceCheck?.valid ? t("ice.valid") : t("ice.invalid", { n: v.ice.length })}</Verdict> : t("ice.hint")}
              >
                <Input
                  name="ice"
                  aria-label="ICE"
                  inputMode="numeric"
                  placeholder="000000000 0000 00"
                  value={groupDigits(v.ice.slice(0, 15), ICE_GROUPS)}
                  onChange={(val) => set("ice", digits(val).slice(0, 15))}
                  isInvalid={!!iceError && (!!f("ice") || !!v.ice)}
                  errorMessage={f("ice")}
                  fieldClassName={FIELD}
                  inputClassName="ident"
                  inputDir="ltr"
                  trailingAddon={
                    v.ice ? (
                      iceCheck?.valid ? (
                        <RiCheckLine className="size-5 shrink-0 text-green-600" aria-hidden />
                      ) : (
                        <RiAlertLine className="size-5 shrink-0 text-red-600" aria-hidden />
                      )
                    ) : undefined
                  }
                />
              </SettingsRow>
              <SettingsRow label="IF" hint={t("co.h.if")} zone="if" onZone={setZone}>
                {text("ifNumber", "IF", { ident: true })}
              </SettingsRow>
              <SettingsRow label={t("co.l.rc")} hint={t("co.h.rc")} zone="rc" onZone={setZone}>
                <div className="grid grid-cols-2 gap-2">
                  {text("rcNumber", "RC", { ident: true })}
                  {text("rcCourt", t("company.rcCourt"))}
                </div>
              </SettingsRow>
              <SettingsRow label={t("company.tp")} hint={t("co.h.tp")} zone="tp" onZone={setZone}>
                {text("tpNumber", t("company.tp"), { ident: true })}
              </SettingsRow>
              <SettingsRow label="CNSS" hint={t("co.h.cnss")} zone="cnss" onZone={setZone}>
                {text("cnssNumber", "CNSS", { ident: true })}
              </SettingsRow>
            </SectionCard>

            <SectionCard id="vat" title={t("company.vat")} description={t("company.vatHint")}>
              <SettingsRow label={t("company.vatRegime")} hint={t("co.h.regime")} onZone={setZone}>
                <SegmentedControl
                  aria-label={t("company.vatRegime")}
                  className="w-full"
                  selectedKeys={new Set([v.vatRegime])}
                  onSelectionChange={(keys) => {
                    const k = [...keys][0];
                    if (k) set("vatRegime", k as Values["vatRegime"]);
                  }}
                >
                  {REGIMES.map((x) => (
                    <SegmentedControlItem key={x} id={x} className="flex-1" {...(x === v.vatRegime ? { "data-focus": "vatRegime" } : {})}>
                      {t(`co.regime.${x}`)}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
                <Hint />
              </SettingsRow>
              <SettingsRow label={t("company.vatBasis")} onZone={setZone}>
                <RadioGroup
                  aria-label={t("company.vatBasis")}
                  value={v.vatBasis}
                  onChange={(k) => {
                    set("vatBasis", k as Values["vatBasis"]);
                    set("vatTaxPoint", k === "CASH" ? "RECEIPTS" : "DEBITS");
                  }}
                  className="gap-2"
                >
                  {BASES.map((x) => (
                    <Radio
                      key={x}
                      value={x}
                      className="w-full items-start rounded-xl border border-border-button-default bg-background-primary-default p-3 transition-colors hover:bg-background-primary-hover data-[selected]:border-border-button-active data-[selected]:bg-background-secondary-default data-[focus-visible]:ring-2 data-[focus-visible]:ring-border-focus-ring"
                    >
                      <span className="grid gap-0.5">
                        <span className="text-body-medium text-text-primary">{t(`vatBasis.${x}`)}</span>
                        <span className="text-caption-1-regular text-text-secondary">{t(`vatBasis.${x}.hint`)}</span>
                      </span>
                    </Radio>
                  ))}
                </RadioGroup>
              </SettingsRow>
            </SectionCard>

            <SectionCard id="bank" title={t("company.bank")} description={t("company.bankHint")}>
              <SettingsRow label={t("company.bankName")} hint={t("co.h.bank")} zone="bank" onZone={setZone}>
                {text("bankName", t("company.bankName"))}
              </SettingsRow>
              <SettingsRow
                label="RIB"
                zone="rib"
                onZone={setZone}
                hint={v.rib ? <Verdict ok={!!ribCheck?.valid}>{ribCheck?.valid ? t("rib.valid") : t("rib.invalid", { n: v.rib.length })}</Verdict> : t("rib.hint")}
              >
                <Input
                  name="rib"
                  aria-label="RIB"
                  inputMode="numeric"
                  placeholder="000 000 0000000000000000 00"
                  value={groupDigits(v.rib.slice(0, 24), RIB_GROUPS)}
                  onChange={(val) => set("rib", digits(val).slice(0, 24))}
                  isInvalid={!!ribError && (!!f("rib") || !!v.rib)}
                  errorMessage={f("rib")}
                  fieldClassName={FIELD}
                  inputClassName="ident"
                  inputDir="ltr"
                  trailingAddon={
                    v.rib ? (
                      ribCheck?.valid ? (
                        <RiCheckLine className="size-5 shrink-0 text-green-600" aria-hidden />
                      ) : (
                        <RiAlertLine className="size-5 shrink-0 text-red-600" aria-hidden />
                      )
                    ) : undefined
                  }
                />
              </SettingsRow>
            </SectionCard>
          </div>
        </div>

        <aside className="hidden min-w-0 grid-cols-[minmax(0,1fr)] gap-3 wide:sticky wide:top-6 wide:grid">
          <Tray className="p-3">
            <div className="px-1 pt-0.5 pb-2.5 text-body-medium text-text-primary">{t("company.preview")}</div>
            {previewEl}
          </Tray>
          <Card className="p-4">{statusEl(false)}</Card>
        </aside>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            key="bar"
            role="region"
            aria-label={t("co.dirty")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: reduce ? 0.01 : 0.2, ease: "easeOut" }}
            className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mt-6 flex max-w-[720px] wide:max-w-[min(720px,calc(100%-432px))] items-center justify-between gap-3 rounded-2xl border border-border-button-default bg-background-primary-default py-2.5 ps-4 pe-2.5 shadow-lg"
          >
            <span className="flex items-center gap-2 text-body-medium text-text-primary">
              <span className="size-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
              {t("co.dirty")}
            </span>
            <span className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={cancel} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("common.save")}
              </Button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
