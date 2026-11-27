"use client";

import Link from "next/link";
import type { WithholdingStatement } from "@facture/core";
import { csvAmount, downloadCsv } from "@/lib/csv";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { daysTo } from "@/lib/period";
import { fromCents, toCents } from "@/lib/purchase";
import { Amt, Block, IdCell, CsvButton, DataTable, DocHeader, EmptyRows, PeriodPicker, PrintButton, Sheet, Td, Th, Disclaimer } from "./ui";

type Row = WithholdingStatement["onSuppliers"]["rows"][number];

const sum = (values: string[]) => fromCents(values.reduce((n, v) => n + toCents(v), 0));

function WithholdingTable({ rows, href, party }: { rows: Row[]; href: (id: string) => string; party: string }) {
  const { t } = useI18n();
  return (
    <DataTable minWidth={900}>
      <thead>
        <tr>
          <Th>{party}</Th>
          <Th>IF / ICE</Th>
          <Th>{t("reports.col.document")}</Th>
          <Th>{t("reports.col.paidOn")}</Th>
          <Th end>{t("reports.col.net")}</Th>
          <Th end>{t("reports.col.vat")}</Th>
          <Th end>{t("reports.col.vatWithheld")}</Th>
          <Th end>{t("reports.col.taxWithheld")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.paymentId}>
            <Td className="max-w-[220px]"><span dir="auto" className="block truncate">{r.partyName}</span></Td>
            <Td><IdCell ifNumber={r.partyIf} ice={r.partyIce} /></Td>
            <Td className="whitespace-nowrap"><Link href={href(r.documentId)} className="ident text-text-primary underline-offset-2 hover:underline">{r.number}</Link></Td>
            <Td num>{fmtDate(r.paidOn)}</Td>
            <Td end><Amt v={r.totalNet} /></Td>
            <Td end><Amt v={r.totalVat} /></Td>
            <Td end><Amt v={r.vatWithheld} muted={toCents(r.vatWithheld) === 0} /></Td>
            <Td end><Amt v={r.taxWithheld} muted={toCents(r.taxWithheld) === 0} /></Td>
          </tr>
        ))}
        <tr className="font-medium">
          <Td colSpan={6}>{t("reports.total")}</Td>
          <Td end><Amt v={sum(rows.map((r) => r.vatWithheld))} /></Td>
          <Td end><Amt v={sum(rows.map((r) => r.taxWithheld))} /></Td>
        </tr>
      </tbody>
    </DataTable>
  );
}

export function WithholdingsReport({ s, today }: { s: WithholdingStatement; today: string }) {
  const { t } = useI18n();
  const left = daysTo(s.onSuppliers.remittanceDeadline, today);
  const toRemit = sum([s.onSuppliers.totalVat, s.onSuppliers.totalTax]);
  const csv = (kind: "suppliers" | "customers") => {
    const rows = kind === "suppliers" ? s.onSuppliers.rows : s.byCustomers.rows;
    downloadCsv(
      `retenues-${kind === "suppliers" ? "operees" : "subies"}-${s.period}.csv`,
      [t(kind === "suppliers" ? "reports.col.supplier" : "reports.col.customer"), "IF", "ICE", t("reports.col.document"), t("reports.col.paidOn"), t("reports.col.net"), t("reports.col.vat"), t("reports.col.vatWithheld"), t("reports.col.taxWithheld")],
      rows.map((r) => [r.partyName, r.partyIf, r.partyIce, r.number, r.paidOn, csvAmount(r.totalNet), csvAmount(r.totalVat), csvAmount(r.vatWithheld), csvAmount(r.taxWithheld)]),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <PeriodPicker period={s.period} kinds={["month", "quarter"]} />
        <PrintButton />
      </div>
      <Disclaimer />
      <Sheet>
        <DocHeader
          title={t("reports.wh.title")}
          period={s.period}
          from={s.from}
          to={s.to}
          lines={[
            [t("reports.wh.remittance"), <span key="r" className={left < 0 ? "text-text-error-primary" : undefined}>{`${t("reports.before", { date: fmtDate(s.onSuppliers.remittanceDeadline) })} · ${left >= 0 ? t("reports.inDays", { n: left }) : t("reports.overdueBy", { n: -left })}`}</span>],
          ]}
        />

        <Block
          title={t("reports.wh.onSuppliers")}
          hint={t("reports.wh.onSuppliersHint", { vat: fmtNumber(s.onSuppliers.totalVat), tax: fmtNumber(s.onSuppliers.totalTax), total: fmtNumber(toRemit) })}
          actions={s.onSuppliers.rows.length > 0 ? <CsvButton onClick={() => csv("suppliers")} label={t("reports.csv")} /> : undefined}
        >
          {s.onSuppliers.rows.length === 0 ? (
            <EmptyRows>{t("reports.wh.noSuppliers")}</EmptyRows>
          ) : (
            <WithholdingTable rows={s.onSuppliers.rows} href={(id) => `/achats/${id}`} party={t("reports.col.supplier")} />
          )}
        </Block>

        <Block
          title={t("reports.wh.byCustomers")}
          hint={t("reports.wh.byCustomersHint")}
          actions={s.byCustomers.rows.length > 0 ? <CsvButton onClick={() => csv("customers")} label={t("reports.csv")} /> : undefined}
        >
          {s.byCustomers.rows.length === 0 ? (
            <EmptyRows>{t("reports.wh.noCustomers")}</EmptyRows>
          ) : (
            <WithholdingTable rows={s.byCustomers.rows} href={(id) => `/factures/${id}`} party={t("reports.col.customer")} />
          )}
        </Block>

        <p className="text-body-regular text-text-secondary">{t("reports.wh.attestation")}</p>
      </Sheet>
    </div>
  );
}
