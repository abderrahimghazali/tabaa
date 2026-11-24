"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, InvoiceTotals, InvoiceType, Language, Party, PaymentMethod } from "@facture/core";
import { Cachet } from "@/components/ui/cachet";
import { currencyLabel, fmtDate, fmtNumber, groupDigits, ICE_GROUPS, RIB_GROUPS } from "@/lib/format";
import { makeT } from "@/lib/i18n";
import { statusStamp, type StatusKey } from "@/lib/status";
import { SheetFrame } from "./sheet-frame";

export type SheetModel = {
  company: Company | null;
  customer: Party | null;
  number: string | null;
  type: InvoiceType;
  status: StatusKey;
  issueDate: string;
  deliveryDate?: string;
  dueDate: string;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  language: Language;
  currency: string;
  totals: InvoiceTotals;
  words: { fr: string; ar: string };
  paidAmount?: string;
};

const fmtQty = (q: string) => fmtNumber(q).replace(/,00$/, "").replace(/(,\d)0$/, "$1");

/*
 * The sheet is a physical A4 page scaled as a whole, so it keeps its own fixed
 * paper palette (white, neutral-950 ink, neutral-500 secondary, neutral-200 rules)
 * and pixel type sizes, whatever the app theme or direction.
 */
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9.5px] font-semibold tracking-wider text-neutral-500 uppercase">{children}</div>;
}

function Ident({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="flex gap-1.5">
      <span className="w-[34px] shrink-0 text-neutral-500">{k}</span>
      <span className="ident">{v}</span>
    </div>
  );
}

function Sheet({ m, animate }: { m: SheetModel; animate: boolean }) {
  const L = m.language === "ar" ? "ar" : "fr";
  const t = makeT(L);
  const c = m.company;
  const isCredit = m.type === "CREDIT_NOTE";
  const title = isCredit ? t("sheet.creditNote") : m.type === "DEPOSIT" ? t("sheet.deposit") : t("sheet.invoice");
  const stamp = m.status;
  const showFr = m.language !== "ar";
  const showAr = m.language !== "fr";
  const footerName = c ? `${c.name}` : "Tabaa";
  const lines = m.totals.lines;
  const hasVatLines = m.totals.breakdown.length > 0;

  return (
    <div
      dir={L === "ar" ? "rtl" : "ltr"}
      lang={L}
      className="relative flex min-h-[1123px] w-[794px] flex-col bg-white px-[48px] pt-[48px] pb-[36px] text-[12px] leading-[18px] text-neutral-950 border border-neutral-200 shadow-lg"
      style={{ fontFamily: L === "ar" ? "var(--font-plex-ar), var(--font-inter)" : "var(--font-inter)" }}
    >
      <div className="flex justify-between gap-8">
        <div className="min-w-0">
          <div className="paper-display text-[20px] leading-[24px]">{c?.name ?? "—"}</div>
          {c?.legalForm && <div className="text-neutral-500">{c.legalForm}</div>}
          {c && (
            <div className="mt-1 text-neutral-500">
              {c.address.line1}
              {c.address.line2 ? `, ${c.address.line2}` : ""}
              <br />
              {c.address.postalCode} {c.address.city}
            </div>
          )}
          <div className="mt-3 space-y-px text-[11px] leading-[16px]">
            <Ident k="ICE" v={c?.ice ? groupDigits(c.ice, ICE_GROUPS) : undefined} />
            <Ident k="IF" v={c?.ifNumber} />
            <Ident k="RC" v={c?.rcNumber ? `${c.rcNumber}${c.rcCourt ? ` · ${c.rcCourt}` : ""}` : undefined} />
            <Ident k="TP" v={c?.tpNumber} />
            <Ident k="CNSS" v={c?.cnssNumber} />
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="paper-display text-[28px] leading-[32px] uppercase">{title}</div>
          <div className="mt-1 text-[14px] font-medium">
            {m.number ? <span className="ident">{m.number}</span> : <span className="text-[11px] font-normal text-neutral-500">{t("sheet.numberPending")}</span>}
          </div>
          <div className="mt-3 space-y-px text-[11px] leading-[16px] text-neutral-500">
            <div>
              {t("sheet.issueDate")} <span className="num text-neutral-950">{fmtDate(m.issueDate)}</span>
            </div>
            {m.deliveryDate && (
              <div>
                {t("sheet.deliveryDate")} <span className="num text-neutral-950">{fmtDate(m.deliveryDate)}</span>
              </div>
            )}
            <div>
              {t("sheet.dueDate")} <span className="num text-neutral-950">{fmtDate(m.dueDate)}</span>
            </div>
            {m.reference && (
              <div>
                {t("sheet.reference")} <span className="num text-neutral-950">{m.reference}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[8px] border border-neutral-200 p-4">
        <Label>{t("sheet.billedTo")}</Label>
        {m.customer ? (
          <div className="mt-1.5 flex justify-between gap-6">
            <div>
              <div className="text-[14px] font-semibold">{m.customer.name}</div>
              <div className="text-neutral-500">
                {m.customer.address.line1}
                {m.customer.address.line2 ? `, ${m.customer.address.line2}` : ""}
                <br />
                {m.customer.address.postalCode} {m.customer.address.city}
              </div>
            </div>
            <div className="space-y-px text-[11px] leading-[16px]">
              <Ident k="ICE" v={m.customer.ice ? groupDigits(m.customer.ice, ICE_GROUPS) : undefined} />
              <Ident k="IF" v={m.customer.ifNumber} />
            </div>
          </div>
        ) : (
          <div className="mt-1.5 text-neutral-500">{t("sheet.noCustomer")}</div>
        )}
      </div>

      <table className="mt-7 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-b border-neutral-950 text-[9.5px] tracking-wider text-neutral-500 uppercase">
            <th className="py-2 text-start font-semibold">{t("sheet.description")}</th>
            <th className="w-[48px] py-2 text-end font-semibold">{t("sheet.qty")}</th>
            <th className="w-[84px] py-2 text-end font-semibold">{t("sheet.unitPrice")}</th>
            <th className="w-[48px] py-2 text-end font-semibold">{t("sheet.discount")}</th>
            <th className="w-[44px] py-2 text-end font-semibold">{t("sheet.vat")}</th>
            <th className="w-[92px] py-2 text-end font-semibold">{t("sheet.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr className="border-b border-neutral-200">
              <td colSpan={6} className="py-3 text-neutral-500">
                {t("sheet.noLines")}
              </td>
            </tr>
          )}
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="py-2 pe-3">{l.description}</td>
              <td className="num py-2 text-end whitespace-nowrap">
                {fmtQty(l.quantity)}
                <span className="text-[10px] text-neutral-500"> {l.unit}</span>
              </td>
              <td className="num py-2 text-end">{fmtNumber(l.unitPrice)}</td>
              <td className="num py-2 text-end text-neutral-500">
                {Number(l.discountPercent) > 0 ? `${fmtQty(l.discountPercent)} %` : ""}
              </td>
              <td className="num py-2 text-end">{Number(l.vatRate)} %</td>
              <td className="num py-2 text-end font-medium">{fmtNumber(l.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="relative mt-7 grid grid-cols-[1fr_300px] gap-8">
        <div className="space-y-4 text-[11px] leading-[16px]">
          <div>
            <Label>{t("sheet.amountInWords")}</Label>
            <div className="mt-1 space-y-1">
              {showFr && <p>{m.words.fr}</p>}
              {showAr && (
                <p dir="rtl" lang="ar" style={{ fontFamily: "var(--font-plex-ar), var(--font-inter)" }} className="text-[12px]">
                  {m.words.ar}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label>{t("sheet.payment")}</Label>
            <div className="mt-1 space-y-px">
              <div>
                {t(`pm.${m.paymentMethod}`)} · {t("sheet.dueBy")} <span className="num">{fmtDate(m.dueDate)}</span>
              </div>
              {c?.bankName && <div className="text-neutral-500">{c.bankName}</div>}
              {c?.rib && (
                <div>
                  RIB <span className="ident">{groupDigits(c.rib, RIB_GROUPS)}</span>
                </div>
              )}
            </div>
          </div>
          {m.notes && (
            <div>
              <Label>{t("sheet.notes")}</Label>
              <p className="mt-1 whitespace-pre-line text-neutral-500">{m.notes}</p>
            </div>
          )}
        </div>

        <div className="text-[11.5px]">
          {hasVatLines && (
            <table className="mb-3 w-full text-[10.5px]">
              <thead>
                <tr className="text-[9.5px] tracking-wider text-neutral-500 uppercase">
                  <th className="pb-1 text-start font-semibold">{t("sheet.vatRate")}</th>
                  <th className="pb-1 text-end font-semibold">{t("sheet.base")}</th>
                  <th className="pb-1 text-end font-semibold">{t("sheet.vat")}</th>
                </tr>
              </thead>
              <tbody>
                {m.totals.breakdown.map((b) => (
                  <tr key={b.rate} className="border-t border-neutral-200">
                    <td className="num py-1">{Number(b.rate)} %</td>
                    <td className="num py-1 text-end">{fmtNumber(b.base)}</td>
                    <td className="num py-1 text-end">{fmtNumber(b.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="space-y-1">
            <Row k={t("sheet.totalNet")} v={m.totals.totalNet} />
            <Row k={t("sheet.totalVat")} v={m.totals.totalVat} />
            <Row k={t("sheet.totalGross")} v={m.totals.totalGross} strong />
            {Number(m.totals.stampDuty) > 0 && <Row k={t("sheet.stampDuty")} v={m.totals.stampDuty} />}
          </dl>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-neutral-950 pt-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t("sheet.amountDue")}</span>
            <span className="inline-flex items-baseline gap-1 text-[18px] font-medium whitespace-nowrap">
              <span className="num">{fmtNumber(m.totals.amountDue)}</span>
              <span className="text-[12px] text-neutral-500">{currencyLabel(L, m.currency)}</span>
            </span>
          </div>
        </div>

        <div className="absolute end-[28px] top-[calc(100%+8px)]">
          <Cachet
            size={172}
            tone={statusStamp[stamp]}
            dashed={stamp === "draft"}
            animate={animate}
            word={t(`stamp.${stamp}`)}
            top={c?.name ?? "Tabaa"}
            bottom={c?.address.city ?? "Maroc"}
            sub={stamp === "draft" ? undefined : fmtDate(m.issueDate)}
            rtl={L === "ar"}
          />
        </div>
      </div>

      <div className="mt-auto pt-40 text-center text-[10px] leading-[15px] text-neutral-500">
        <div className="border-t border-neutral-200 pt-3">
          {footerName}
          {c?.legalForm ? ` · ${c.legalForm}` : ""}
          {c?.capital ? ` · ${t("sheet.capital")} ${fmtNumber(c.capital)} ${m.currency === "MAD" ? "DH" : m.currency}` : ""}
          {c ? ` · ${c.address.line1}, ${c.address.city}` : ""}
          {c?.phone ? ` · ${c.phone}` : ""}
          {c?.email ? ` · ${c.email}` : ""}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "font-semibold" : "text-neutral-500"}`}>
      <dt>{k}</dt>
      <dd className="num">{fmtNumber(v)}</dd>
    </div>
  );
}

export function InvoiceSheet({ model }: { model: SheetModel }) {
  const [pressKey, setPressKey] = useState(0);
  const prev = useRef(model.status);

  useEffect(() => {
    if (prev.current !== model.status && model.status !== "draft") setPressKey((k) => k + 1);
    prev.current = model.status;
  }, [model.status]);

  return (
    <SheetFrame>
      <Sheet key={pressKey} m={model} animate={pressKey > 0} />
    </SheetFrame>
  );
}
