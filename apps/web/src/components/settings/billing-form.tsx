"use client";

import { useState, useTransition } from "react";
import { activeRules, type ApiError, type Company, type CompanyInput, type Language } from "@facture/core";
import { Button } from "@/components/base/buttons/button";
import { NumberField } from "@/components/base/number-field/number-field";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { TopbarActions } from "@/components/frame";
import { IssueList } from "@/components/ui/issue-list";
import { saveCompany } from "@/lib/actions";
import { todayIso } from "@/lib/format";
import { WriteOnly } from "@/components/app/write-only";
import { useI18n } from "@/lib/i18n-client";
import { useCanWrite } from "@/lib/me-client";
import { issuesAt } from "@/lib/result";
import { Section } from "./section";

const LANGS: Language[] = ["fr", "ar", "fr-ar"];

function toInput(c: Company, patch: Partial<CompanyInput>): CompanyInput {
  const { id: _id, ...rest } = c;
  void _id;
  return { ...rest, ...patch };
}

export function BillingForm({ company }: { company: Company }) {
  const { t } = useI18n();
  const canWrite = useCanWrite();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ApiError | null>(null);
  const today = todayIso();
  const rules = activeRules(today);
  const [term, setTerm] = useState(company.defaultPaymentTermDays);
  const [language, setLanguage] = useState<Language>(company.invoiceLanguage);
  const year = today.slice(0, 4);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveCompany(toInput(company, { defaultPaymentTermDays: Number.isNaN(term) ? 0 : term, invoiceLanguage: language }));
      if (res.ok) toast.success(t("settings.saved"));
      else {
        setError(res.error);
        toast.error(t("error.fixFields"));
      }
    });
  };

  return (
    <div>
      <TopbarActions>
        <WriteOnly>
          <Button type="submit" form="billing-form" disabled={pending}>
            {t("common.save")}
          </Button>
        </WriteOnly>
      </TopbarActions>
      <form id="billing-form" inert={!canWrite || undefined}  onSubmit={submit} noValidate className="grid max-w-3xl gap-4">
        <IssueList error={error} />
        <Section title={t("settings.billing.defaultsTitle")} description={t("settings.billing.defaultsHint")}>
          <NumberField
            label={t("company.term")}
            aria-label={t("company.term")}
            hint={t("company.termHint", { max: rules.maxPaymentTermDays })}
            value={term}
            onChange={setTerm}
            minValue={0}
            maxValue={180}
            step={1}
            formatOptions={{ maximumFractionDigits: 0 }}
            isInvalid={!!issuesAt(error, "defaultPaymentTermDays")}
          />
          <Select
            label={t("editor.language")}
            aria-label={t("editor.language")}
            className="w-full"
            triggerClassName="w-full"
            selectedKey={language}
            onSelectionChange={(k) => setLanguage(k as Language)}
          >
            {LANGS.map((l) => (
              <SelectItem key={l} id={l} textValue={t(`lang.${l}`)}>
                {t(`lang.${l}`)}
              </SelectItem>
            ))}
          </Select>
        </Section>

        <Section title={t("settings.billing.numberingTitle")} description={t("settings.billing.numberingHint")}>
          <div className="flex flex-col gap-1 rounded-2lg bg-background-secondary-default p-3">
            <span className="text-body-2-medium text-text-secondary">{t("settings.billing.numberingInvoices")}</span>
            <span className="ident text-headline-medium text-text-primary">FA-{year}-00001</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2lg bg-background-secondary-default p-3">
            <span className="text-body-2-medium text-text-secondary">{t("settings.billing.numberingCredits")}</span>
            <span className="ident text-headline-medium text-text-primary">AV-{year}-00001</span>
          </div>
          <p className="text-body-regular text-text-secondary sm:col-span-2">{t("settings.billing.numberingExplain")}</p>
        </Section>
      </form>
    </div>
  );
}
