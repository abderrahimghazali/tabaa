"use client";

import Link from "next/link";
import type { VatStatement } from "@facture/core";
import { Money } from "@/components/app/money";
import { csvAmount, downloadCsv } from "@/lib/csv";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import type { Key } from "@/lib/i18n";
import { daysTo } from "@/lib/period";
import { fromCents, toCents } from "@/lib/purchase";
import { Amt, AppliedAmount, IdCell, pct, Block, CsvButton, DataTable, DocHeader, EmptyRows, Notices, PeriodPicker, PrintButton, Result, Sheet, Td, Th, Disclaimer } from "./ui";

const sum = (values: string[]) => fromCents(values.reduce((n, v) => n + toCents(v), 0));

export function VatReport({ s, today }: { s: VatStatement; today: string }) {
  const { t, locale } = useI18n();
  const left = daysTo(s.filingDeadline, today);
  const deadline = `${t("reports.before", { date: fmtDate(s.filingDeadline) })} · ${left >= 0 ? t("reports.inDays", { n: left }) : t("reports.overdueBy", { n: -left })}`;
  const due = toCents(s.vatDue) > 0;
  const credit = toCents(s.creditCarriedForward) > 0;
  const prevCredit = s.previousCredit;
  const file = (kind: string) => `tva-${s.period}-${kind}.csv`;

  const salesCsv = () =>
    downloadCsv(
      file("chiffre-affaires"),
      [t("reports.col.invoice"), t("reports.col.date"), t("reports.col.customer"), t("reports.col.rate"), t("reports.col.base"), t("reports.col.vat")],
      s.sales.map((r) => [r.number, r.date, r.customerName, csvAmount(r.vatRate), csvAmount(r.base), csvAmount(r.vat)]),
    );
  const dedCsv = () =>
    downloadCsv(
      file("deductions"),
      [t("reports.col.invoice"), t("reports.col.issueDate"), t("reports.col.supplier"), "IF", "ICE", t("reports.col.description"), t("reports.col.category"), t("reports.col.rate"), t("reports.col.base"), t("reports.col.vat"), t("reports.col.method"), t("reports.col.paidOn"), t("reports.col.reference")],
      s.deductions.map((r) => [r.number, r.issueDate, r.supplierName, r.supplierIf, r.supplierIce, r.description, t(`pcat.${r.category}`), csvAmount(r.vatRate), csvAmount(r.base), csvAmount(r.vat), t(`pm.${r.method}`), r.paidOn, r.reference]),
    );

  const money = (v: string) => <Money value={v} locale={locale} />;
  const row = (label: string, base: string | null, vat: string | null, opts: { strong?: boolean; indent?: boolean } = {}) => (
    <tr key={label} className={opts.strong ? "bg-background-secondary-default/60 font-medium" : undefined}>
      <Td className={opts.indent ? "ps-6" : undefined}>{label}</Td>
      <Td end>{base === null ? <span className="text-text-tertiary">—</span> : <Amt v={base} />}</Td>
      <Td end>{vat === null ? <span className="text-text-tertiary">—</span> : <Amt v={vat} />}</Td>
    </tr>
  );
  const group = (label: string) => (
    <tr key={label}>
      <td colSpan={3} className="border-t border-separator-border bg-background-secondary-default px-3 py-1.5 text-caption-1-medium text-text-secondary print:px-1.5">{label}</td>
    </tr>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <PeriodPicker period={s.period} kinds={["month", "quarter"]} />
        <PrintButton />
      </div>
      <Disclaimer />
      <Sheet>
        <DocHeader
          title={t("reports.vat.title")}
          period={s.period}
          from={s.from}
          to={s.to}
          lines={[
            [t("reports.vat.basis"), <span key="b">{t(`vatBasis.${s.basis}` as Key)}</span>],
            [t("reports.deadline"), <span key="d" className={left < 0 ? "text-text-error-primary" : undefined}>{deadline}</span>],
          ]}
        />
        <Notices items={s.notices.map((n) => t(`reports.vat.notice.${n}` as Key))} />

        <Block title={t("reports.vat.summary")} hint={t("reports.vat.summaryHint")}>
          <DataTable minWidth={520}>
            <thead>
              <tr>
                <Th>{t("reports.col.label")}</Th>
                <Th end>{t("reports.col.base")}</Th>
                <Th end>{t("reports.col.vat")}</Th>
              </tr>
            </thead>
            <tbody>
              {group(t("reports.vat.collected"))}
              {s.collected.byRate.map((r) => row(t("reports.vat.atRate", { rate: r.vatRate }), r.base, r.vat, { indent: true }))}
              {row(t("reports.vat.exempt"), s.collected.exemptBase, null, { indent: true })}
              {row(t("reports.vat.totalCollected"), s.collected.totalBase, s.collected.totalVat, { strong: true })}
              {group(t("reports.vat.deductible"))}
              {row(t("pcat.SERVICES"), s.deductible.services.base, s.deductible.services.vat, { indent: true })}
              {row(t("pcat.GOODS"), s.deductible.goods.base, s.deductible.goods.vat, { indent: true })}
              {row(t("pcat.FIXED_ASSET"), s.deductible.fixedAssets.base, s.deductible.fixedAssets.vat, { indent: true })}
              {row(t("reports.vat.totalDeductible"), null, s.deductible.totalVat, { strong: true })}
              {group(t("reports.vat.adjustments"))}
              {row(t("reports.vat.withheld"), null, s.withheldByCustomers)}
              <tr>
                <Td>{t("reports.vat.previousCredit")}</Td>
                <Td />
                <Td end>
                  <span className="hidden print:inline"><Amt v={prevCredit} /></span>
                  <span className="inline-block print:hidden">
                    <AppliedAmount bare label={t("reports.vat.previousCredit")} name="previousCredit" value={Number(prevCredit) === 0 ? "" : prevCredit} />
                  </span>
                </Td>
              </tr>
            </tbody>
          </DataTable>
          <p className="text-caption-1-regular text-text-secondary">{t("reports.vat.formula")}</p>
          <Result
            tone={due ? "due" : credit ? "credit" : "neutral"}
            label={due ? t("reports.vat.due") : credit ? t("reports.vat.credit") : t("reports.vat.zero")}
            value={money(due ? s.vatDue : credit ? s.creditCarriedForward : "0.00")}
            note={credit ? t("reports.vat.creditNote") : undefined}
          />
        </Block>

        <Block title={t("reports.vat.salesDetail")} hint={t("reports.vat.salesHint", { basis: t(`vatBasis.${s.basis}` as Key) })} actions={s.sales.length > 0 ? <CsvButton onClick={salesCsv} label={t("reports.csv")} /> : undefined}>
          {s.sales.length === 0 ? (
            <EmptyRows>{t("reports.vat.noSales")}</EmptyRows>
          ) : (
            <DataTable minWidth={720}>
              <thead>
                <tr>
                  <Th>{t("reports.col.invoice")}</Th>
                  <Th>{t("reports.col.date")}</Th>
                  <Th>{t("reports.col.customer")}</Th>
                  <Th end>{t("reports.col.rate")}</Th>
                  <Th end>{t("reports.col.base")}</Th>
                  <Th end>{t("reports.col.vat")}</Th>
                </tr>
              </thead>
              <tbody>
                {s.sales.map((r, i) => (
                  <tr key={`${r.invoiceId}-${r.vatRate}-${i}`}>
                    <Td className="whitespace-nowrap"><Link href={`/factures/${r.invoiceId}`} className="ident text-text-primary underline-offset-2 hover:underline">{r.number}</Link></Td>
                    <Td num>{fmtDate(r.date)}</Td>
                    <Td className="max-w-[260px]"><span dir="auto" className="block truncate">{r.customerName}</span></Td>
                    <Td end num>{pct(r.vatRate)}</Td>
                    <Td end><Amt v={r.base} /></Td>
                    <Td end><Amt v={r.vat} /></Td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <Td colSpan={4}>{t("reports.total")}</Td>
                  <Td end><Amt v={sum(s.sales.map((r) => r.base))} /></Td>
                  <Td end><Amt v={sum(s.sales.map((r) => r.vat))} /></Td>
                </tr>
              </tbody>
            </DataTable>
          )}
        </Block>

        <Block title={t("reports.vat.deductionsDetail")} hint={t("reports.vat.deductionsHint")} actions={s.deductions.length > 0 ? <CsvButton onClick={dedCsv} label={t("reports.csv")} /> : undefined}>
          {s.deductions.length === 0 ? (
            <EmptyRows>{t("reports.vat.noDeductions")}</EmptyRows>
          ) : (
            <DataTable minWidth={1000}>
              <thead>
                <tr>
                  <Th>{t("reports.col.invoice")}</Th>
                  <Th>{t("reports.col.issueDate")}</Th>
                  <Th>{t("reports.col.supplier")}</Th>
                  <Th>IF / ICE</Th>
                  <Th>{t("reports.col.description")}</Th>
                  <Th end>{t("reports.col.rate")}</Th>
                  <Th end>{t("reports.col.base")}</Th>
                  <Th end>{t("reports.col.vat")}</Th>
                  <Th>{t("reports.col.payment")}</Th>
                  <Th>{t("reports.col.reference")}</Th>
                </tr>
              </thead>
              <tbody>
                {s.deductions.map((r, i) => (
                  <tr key={`${r.purchaseId}-${r.paidOn}-${r.vatRate}-${i}`}>
                    <Td className="whitespace-nowrap"><Link href={`/achats/${r.purchaseId}`} className="ident text-text-primary underline-offset-2 hover:underline">{r.number}</Link></Td>
                    <Td num>{fmtDate(r.issueDate)}</Td>
                    <Td className="max-w-[200px]"><span dir="auto" className="block truncate">{r.supplierName}</span></Td>
                    <Td><IdCell ifNumber={r.supplierIf} ice={r.supplierIce} /></Td>
                    <Td className="max-w-[220px]"><span dir="auto" className="block truncate">{r.description}</span></Td>
                    <Td end num>{pct(r.vatRate)}</Td>
                    <Td end><Amt v={r.base} /></Td>
                    <Td end><Amt v={r.vat} /></Td>
                    <Td className="whitespace-nowrap">{t(`pm.${r.method}`)} <span className="num text-text-secondary">· {fmtDate(r.paidOn)}</span></Td>
                    <Td><span dir="ltr" className="ident">{r.reference ?? ""}</span></Td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <Td colSpan={6}>{t("reports.total")}</Td>
                  <Td end><Amt v={sum(s.deductions.map((r) => r.base))} /></Td>
                  <Td end><Amt v={sum(s.deductions.map((r) => r.vat))} /></Td>
                  <Td colSpan={2} />
                </tr>
              </tbody>
            </DataTable>
          )}
        </Block>
      </Sheet>
    </div>
  );
}

