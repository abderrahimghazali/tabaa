"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  activeRules,
  validateIce,
  validateRib,
  type ApiError,
  type Company,
  type CompanyInput,
} from "@facture/core";
import { Card } from "@/components/app/layout";
import { Button } from "@/components/base/buttons/button";
import { LinkButton } from "@/components/base/buttons/link-button";
import { HintText } from "@/components/base/input/hint-text";
import { Input } from "@/components/base/input/input";
import { NumberField } from "@/components/base/number-field/number-field";
import { Notification } from "@/components/base/notification/notification";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { TopbarActions } from "@/components/frame";
import { IssueList } from "@/components/ui/issue-list";
import { saveCompany } from "@/lib/actions";
import { digits, groupDigits, ICE_GROUPS, RIB_GROUPS, todayIso } from "@/lib/format";
import { WriteOnly } from "@/components/app/write-only";
import { useI18n } from "@/lib/i18n-client";
import { useCanWrite } from "@/lib/me-client";
import { issuesAt } from "@/lib/result";
import { Section } from "./section";

const FORMS = ["SARL", "SARL AU", "SA", "SNC", "SCS", "Auto-entrepreneur", "Personne physique"];
const REGIMES = ["MONTHLY", "QUARTERLY", "NOT_SUBJECT"] as const;
const TAX_POINTS = ["RECEIPTS", "DEBITS"] as const;
const opt = (s: string) => (s.trim() ? s.trim() : undefined);

export function CompanyForm({ company }: { company: Company | null }) {
  const { t } = useI18n();
  const canWrite = useCanWrite();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const rules = activeRules(todayIso());
  const [v, setV] = useState({
    name: company?.name ?? "",
    legalForm: company?.legalForm ?? "",
    capital: company?.capital ? Number(company.capital) : Number.NaN,
    line1: company?.address.line1 ?? "",
    line2: company?.address.line2 ?? "",
    postalCode: company?.address.postalCode ?? "",
    city: company?.address.city ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    ice: digits(company?.ice ?? ""),
    ifNumber: company?.ifNumber ?? "",
    rcNumber: company?.rcNumber ?? "",
    rcCourt: company?.rcCourt ?? "",
    tpNumber: company?.tpNumber ?? "",
    cnssNumber: company?.cnssNumber ?? "",
    vatRegime: company?.vatRegime ?? "MONTHLY",
    vatTaxPoint: company?.vatTaxPoint ?? "RECEIPTS",
    bankName: company?.bankName ?? "",
    rib: digits(company?.rib ?? ""),
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  const iceCheck = v.ice ? validateIce(v.ice) : null;
  const iceError = issuesAt(error, "ice") ?? (iceCheck && !iceCheck.valid ? t("ice.invalid", { n: v.ice.length }) : undefined);
  const ribCheck = v.rib ? validateRib(v.rib) : null;
  const ribError = issuesAt(error, "rib") ?? (ribCheck && !ribCheck.valid ? t("rib.invalid", { n: v.rib.length }) : undefined);
  const f = (path: string) => issuesAt(error, path);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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
      vatTaxPoint: v.vatTaxPoint,
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
        toast.success(t("company.saved"));
        if (!company) router.push("/");
      } else {
        setError(res.error);
        toast.error(t("error.fixFields"));
      }
    });
  };

  const sections = [
    ["identity", t("company.identity")],
    ["legal", t("company.legal")],
    ["vat", t("company.vat")],
    ["bank", t("company.bank")],
  ] as const;

  const text = (key: keyof typeof v, label: string, extra: { ident?: boolean; path?: string; type?: string; hint?: string; list?: string } = {}) => (
    <Input
      label={label}
      aria-label={label}
      type={extra.type}
      value={String(v[key])}
      onChange={(val) => set(key, val as never)}
      isInvalid={!!f(extra.path ?? key)}
      errorMessage={f(extra.path ?? key)}
      hint={extra.hint}
      inputClassName={extra.ident ? "ident" : undefined}
      {...(extra.list ? ({ list: extra.list } as object) : {})}
    />
  );

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <Button type="submit" form="company-form" disabled={pending}>
            {t("common.save")}
          </Button>
        </WriteOnly>
      </TopbarActions>
      <form id="company-form" inert={!canWrite || undefined}  onSubmit={submit} noValidate>
        {!company && (
          <Notification
            className="mb-4"
            status="information"
            dismissible={false}
            title={t("company.firstTime")}
            description={t("company.firstTimeBody")}
          />
        )}
        <div className="mb-4 empty:hidden">
          <IssueList error={error} />
        </div>

        <div className="grid items-start gap-4 wide:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="grid gap-3 wide:sticky wide:top-6">
            <nav aria-label={t("company.sections")} className="flex flex-wrap gap-x-4 gap-y-1 wide:flex-col wide:gap-2">
              {sections.map(([id, label]) => (
                <LinkButton key={id} href={`#${id}`} variant="secondary" size="small" className="justify-start">
                  {label}
                </LinkButton>
              ))}
            </nav>
            <Card className="hidden p-4 wide:block">
              <div className="mb-2 text-caption-1-medium text-text-tertiary">{t("company.preview")}</div>
              <div className="text-body-2-regular">
                <div className="paper-display text-headline-medium text-text-primary">{v.name || "—"}</div>
                {v.legalForm && <div className="text-text-secondary">{v.legalForm}</div>}
                <div className="mt-1 text-text-secondary">
                  {v.line1}
                  {v.line1 && <br />}
                  {v.postalCode} {v.city}
                </div>
                <div className="ident mt-2 grid gap-px text-caption-1-regular text-text-primary">
                  {v.ice && <div><span className="font-sans text-text-tertiary">ICE </span>{groupDigits(v.ice, ICE_GROUPS)}</div>}
                  {v.ifNumber && <div><span className="font-sans text-text-tertiary">IF </span>{v.ifNumber}</div>}
                  {v.rcNumber && <div><span className="font-sans text-text-tertiary">RC </span>{v.rcNumber}</div>}
                  {v.tpNumber && <div><span className="font-sans text-text-tertiary">TP </span>{v.tpNumber}</div>}
                  {v.cnssNumber && <div><span className="font-sans text-text-tertiary">CNSS </span>{v.cnssNumber}</div>}
                </div>
              </div>
            </Card>
          </aside>

          <div className="grid gap-4">
            <Section id="identity" title={t("company.identity")} description={t("company.identityHint")}>
              <div className="sm:col-span-2">{text("name", t("company.name"))}</div>
              <div>
                {text("legalForm", t("company.legalForm"), { list: "legal-forms" })}
                <datalist id="legal-forms">
                  {FORMS.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </div>
              <NumberField
                label={t("company.capital")}
                aria-label={t("company.capital")}
                hint={t("company.capitalHint")}
                value={v.capital}
                onChange={(n) => set("capital", n)}
                minValue={0}
                formatOptions={{ maximumFractionDigits: 2, useGrouping: false }}
                isInvalid={!!f("capital")}
                hideSteppers
              />
              <div className="sm:col-span-2">{text("line1", t("field.address"), { path: "address.line1" })}</div>
              <div className="sm:col-span-2">{text("line2", t("field.address2"))}</div>
              {text("postalCode", t("field.postalCode"))}
              {text("city", t("field.city"), { path: "address.city" })}
              {text("phone", t("field.phone"), { type: "tel" })}
              {text("email", t("field.email"), { type: "email" })}
            </Section>

            <Section id="legal" title={t("company.legal")} description={t("company.legalHint")}>
              <Input
                label="ICE"
                aria-label="ICE"
                inputMode="numeric"
                placeholder="000000000 0000 00"
                value={groupDigits(v.ice.slice(0, 15), ICE_GROUPS)}
                onChange={(val) => set("ice", digits(val).slice(0, 15))}
                isInvalid={!!iceError}
                errorMessage={iceError}
                hint={v.ice ? t("ice.valid") : t("ice.hint")}
                inputClassName="ident"
              />
              {text("ifNumber", "IF", { ident: true })}
              {text("rcNumber", "RC", { ident: true })}
              {text("rcCourt", t("company.rcCourt"))}
              {text("tpNumber", t("company.tp"), { ident: true })}
              {text("cnssNumber", "CNSS", { ident: true })}
            </Section>

            <Section id="vat" title={t("company.vat")} description={t("company.vatHint")}>
              <Select
                label={t("company.vatRegime")}
                aria-label={t("company.vatRegime")}
                className="w-full"
                triggerClassName="w-full"
                selectedKey={v.vatRegime}
                onSelectionChange={(k) => set("vatRegime", k as typeof v.vatRegime)}
              >
                {REGIMES.map((x) => (
                  <SelectItem key={x} id={x} textValue={t(`vatRegime.${x}`)}>
                    {t(`vatRegime.${x}`)}
                  </SelectItem>
                ))}
              </Select>
              <div className="flex flex-col gap-1">
                <Select
                  label={t("company.taxPoint")}
                  aria-label={t("company.taxPoint")}
                  className="w-full"
                  triggerClassName="w-full"
                  selectedKey={v.vatTaxPoint}
                  onSelectionChange={(k) => set("vatTaxPoint", k as typeof v.vatTaxPoint)}
                >
                  {TAX_POINTS.map((x) => (
                    <SelectItem key={x} id={x} textValue={t(`taxPoint.${x}`)}>
                      {t(`taxPoint.${x}`)}
                    </SelectItem>
                  ))}
                </Select>
                <HintText>{t(`taxPoint.${v.vatTaxPoint}.hint`)}</HintText>
              </div>
            </Section>

            <Section id="bank" title={t("company.bank")} description={t("company.bankHint")}>
              {text("bankName", t("company.bankName"))}
              <Input
                label="RIB"
                aria-label="RIB"
                inputMode="numeric"
                placeholder="000 000 0000000000000000 00"
                value={groupDigits(v.rib.slice(0, 24), RIB_GROUPS)}
                onChange={(val) => set("rib", digits(val).slice(0, 24))}
                isInvalid={!!ribError}
                errorMessage={ribError}
                hint={v.rib ? t("rib.valid") : t("rib.hint")}
                inputClassName="ident"
              />
            </Section>
          </div>
        </div>
      </form>
    </div>
  );
}
