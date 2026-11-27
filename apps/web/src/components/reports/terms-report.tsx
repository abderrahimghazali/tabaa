"use client";

import Link from "next/link";
import type { PaymentTermsStatement } from "@facture/core";
import { Money } from "@/components/app/money";
import { Button } from "@/components/base/buttons/button";
import { csvAmount, downloadCsv } from "@/lib/csv";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { daysTo } from "@/lib/period";
import { fromCents, toCents } from "@/lib/purchase";
import { Amt, AppliedAmount, IdCell, pct, Block, CsvButton, DataTable, DocHeader, EmptyRows, Notices, PeriodPicker, PrintButton, Sheet, Td, Th, Disclaimer, useQuery } from "./ui";

const sum = (values: string[]) => fromCents(values.reduce((n, v) => n + toCents(v), 0));

export function TermsReport({ s, today, keyRate }: { s: PaymentTermsStatement; today: string; keyRate: string }) {
  const { t, locale } = useI18n();
  const query = useQuery();
  const left = daysTo(s.filingDeadline, today);
  const csv = () =>
    downloadCsv(
      `delais-paiement-${s.period}.csv`,
      [t("reports.col.supplier"), "IF", "ICE", t("reports.col.invoice"), t("reports.col.issueDate"), t("reports.col.gross"), t("reports.terms.legalDue"), t("reports.terms.lateAmount"), t("reports.terms.settledOn"), t("reports.terms.months"), t("reports.terms.rate"), t("reports.terms.fine"), t("reports.col.method"), t("reports.col.reference")],
      s.rows.map((r) => [r.supplierName, r.supplierIf, r.supplierIce, r.number, r.issueDate, csvAmount(r.totalGross), r.legalDueDate, csvAmount(r.lateAmount), r.settledOn ?? t("reports.terms.unpaid"), r.monthsLate, csvAmount(r.ratePercent), csvAmount(r.fine), r.method ? t(`pm.${r.method}`) : "", r.reference]),
    );

  const stat = (label: string, value: React.ReactNode, tone?: "danger") => (
    <div className="min-w-0 rounded-2xl border border-border-button-default bg-background-primary-default p-4 max-sm:p-3 print:rounded-none print:p-2">
      <div className="text-body-regular text-text-secondary max-sm:text-caption-1-medium">{label}</div>
      <div className={tone === "danger" ? "mt-1 text-title-2-medium text-text-error-primary" : "mt-1 text-title-2-medium text-text-primary"}>{value}</div>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <PeriodPicker period={s.period} kinds={["quarter"]} />
        <PrintButton />
      </div>
      <Disclaimer />
      <Sheet>
        <DocHeader
          title={t("reports.terms.title")}
          period={s.period}
          from={s.from}
          to={s.to}
          lines={[[t("reports.deadline"), <span key="d" className={left < 0 ? "text-text-error-primary" : undefined}>{`${t("reports.before", { date: fmtDate(s.filingDeadline) })} · ${left >= 0 ? t("reports.inDays", { n: left }) : t("reports.overdueBy", { n: -left })}`}</span>]]}
        />
        <Notices items={s.notices.map((n) => t(`reports.terms.notice.${n}` as Key))} />

        <section className="grid grid-cols-2 gap-3 max-sm:gap-2 wide:grid-cols-4">
          {stat(t("reports.terms.count"), <span className="num">{s.totals.count}</span>)}
          {stat(t("reports.terms.unpaidLate"), <Money value={s.totals.unpaidLate} locale={locale} />)}
          {stat(t("reports.terms.paidLate"), <Money value={s.totals.paidLate} locale={locale} />)}
          {stat(t("reports.terms.fineEstimated"), <Money value={s.totals.fine} locale={locale} />, Number(s.totals.fine) > 0 ? "danger" : undefined)}
        </section>

        <Block title={t("reports.terms.rowsTitle")} actions={s.rows.length > 0 ? <CsvButton onClick={csv} label={t("reports.csv")} /> : undefined}>
          {s.rows.length === 0 ? (
            <EmptyRows>{t("reports.terms.noRows")}</EmptyRows>
          ) : (
            <DataTable minWidth={1120}>
              <thead>
                <tr>
                  <Th>{t("reports.col.supplier")}</Th>
                  <Th>IF / ICE</Th>
                  <Th>{t("reports.col.invoice")}</Th>
                  <Th>{t("reports.col.issueDate")}</Th>
                  <Th end>{t("reports.col.gross")}</Th>
                  <Th>{t("reports.terms.legalDue")}</Th>
                  <Th end>{t("reports.terms.lateAmount")}</Th>
                  <Th>{t("reports.terms.settledOn")}</Th>
                  <Th end>{t("reports.terms.months")}</Th>
                  <Th end>{t("reports.terms.rate")}</Th>
                  <Th end>{t("reports.terms.fine")}</Th>
                  <Th>{t("reports.col.payment")}</Th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={`${r.purchaseId}-${r.settledOn ?? "u"}-${i}`}>
                    <Td className="max-w-[200px]"><span dir="auto" className="block truncate">{r.supplierName}</span></Td>
                    <Td><IdCell ifNumber={r.supplierIf} ice={r.supplierIce} /></Td>
                    <Td className="whitespace-nowrap"><Link href={`/achats/${r.purchaseId}`} className="ident text-text-primary underline-offset-2 hover:underline">{r.number}</Link></Td>
                    <Td num>{fmtDate(r.issueDate)}</Td>
                    <Td end><Amt v={r.totalGross} /></Td>
                    <Td num>{fmtDate(r.legalDueDate)}</Td>
                    <Td end><Amt v={r.lateAmount} /></Td>
                    <Td num>{r.settledOn ? fmtDate(r.settledOn) : <span className="text-text-error-primary">{t("reports.terms.unpaid")}</span>}</Td>
                    <Td end num>{r.monthsLate}</Td>
                    <Td end num>{pct(r.ratePercent)}</Td>
                    <Td end><Amt v={r.fine} /></Td>
                    <Td className="whitespace-nowrap">{r.method ? t(`pm.${r.method}`) : ""}{r.reference && <span dir="ltr" className="ident text-text-secondary"> · {r.reference}</span>}</Td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <Td colSpan={6}>{t("reports.total")}</Td>
                  <Td end><Amt v={sum(s.rows.map((r) => r.lateAmount))} /></Td>
                  <Td colSpan={3} />
                  <Td end><Amt v={s.totals.fine} /></Td>
                  <Td />
                </tr>
              </tbody>
            </DataTable>
          )}
        </Block>

        {s.disputed.length > 0 && (
          <Block title={t("reports.terms.disputedTitle")} hint={t("reports.terms.disputedHint")}>
            <DataTable minWidth={520}>
              <thead>
                <tr>
                  <Th>{t("reports.col.supplier")}</Th>
                  <Th>{t("reports.col.invoice")}</Th>
                  <Th end>{t("col.remaining")}</Th>
                </tr>
              </thead>
              <tbody>
                {s.disputed.map((d) => (
                  <tr key={d.purchaseId}>
                    <Td><span dir="auto">{d.supplierName}</span></Td>
                    <Td className="whitespace-nowrap"><Link href={`/achats/${d.purchaseId}`} className="ident text-text-primary underline-offset-2 hover:underline">{d.number}</Link></Td>
                    <Td end><Amt v={d.amountDue} /></Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Block>
        )}

        <Block title={t("reports.terms.ratesTitle")} hint={t("reports.terms.ratesHint", { inc: s.monthlyIncrement.replace(".", ",") })}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <DataTable minWidth={320}>
              <thead>
                <tr>
                  <Th>{t("reports.terms.ratesFrom")}</Th>
                  <Th end>{t("reports.terms.ratesRate")}</Th>
                </tr>
              </thead>
              <tbody>
                {s.keyRates.map((k) => (
                  <tr key={k.from}>
                    <Td num>{fmtDate(k.from)}</Td>
                    <Td end num>{pct(k.rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="grid content-start gap-2 print:hidden">
              <AppliedAmount label={t("reports.terms.override")} name="keyRate" value={keyRate} hint={t("reports.terms.overrideHint")} />
              {keyRate && <Button size="small" variant="secondary" onClick={() => query({ keyRate: null })} className="justify-self-start">{t("reports.terms.overrideReset")}</Button>}
            </div>
          </div>
          <p className="rounded-2xl bg-background-secondary-default px-4 py-3 text-body-regular text-text-secondary">{t("reports.terms.caveat")}</p>
        </Block>

        <section className="grid gap-1 text-body-regular text-text-secondary">
          <h3 className="text-body-medium text-text-primary">{t("reports.terms.whoTitle")}</h3>
          <p>{t("reports.terms.who")}</p>
        </section>
      </Sheet>
    </div>
  );
}
