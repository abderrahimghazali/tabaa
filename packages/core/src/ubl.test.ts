import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { company, makeInvoice } from "./test-fixtures.js";
import { buildUbl } from "./ubl.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false });
const parse = (xml: string) => parser.parse(xml);
const arr = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

describe("buildUbl invoice", () => {
  const xml = buildUbl({ company, invoice: makeInvoice({ deliveryDate: "2026-02-27", notes: "Merci" }) });
  const doc = parse(xml).Invoice;

  it("is well-formed", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
  });

  it("carries header values in schema order", () => {
    expect(Object.keys(doc).filter((k) => !k.startsWith("@_")).slice(0, 8)).toEqual([
      "UBLVersionID", "ID", "IssueDate", "DueDate", "InvoiceTypeCode", "Note", "DocumentCurrencyCode", "AccountingSupplierParty",
    ]);
    expect(doc.UBLVersionID).toBe("2.1");
    expect(doc.ID).toBe("2026-0001");
    expect(doc.IssueDate).toBe("2026-03-01");
    expect(doc.DueDate).toBe("2026-04-30");
    expect(doc.InvoiceTypeCode).toBe("380");
    expect(doc.DocumentCurrencyCode).toBe("MAD");
    expect(doc.Note).toEqual(["Merci", "mille dirhams"]);
    expect(doc.Delivery.ActualDeliveryDate).toBe("2026-02-27");
  });

  it("identifies supplier and customer", () => {
    const s = doc.AccountingSupplierParty.Party;
    const ids = Object.fromEntries(arr(s.PartyIdentification).map((p: any) => [p.ID["@_schemeID"], p.ID["#text"]]));
    expect(ids).toEqual({
      "MA:ICE": "001234567000089",
      "MA:IF": "12345678",
      "MA:RC": "98765",
      "MA:TP": "11223344",
      "MA:CNSS": "5566778",
    });
    expect(s.PartyName.Name).toBe("Atlas & Fils SARL");
    expect(s.PartyTaxScheme.TaxScheme.ID).toBe("VAT");
    expect(s.PartyLegalEntity.CompanyID).toBe("001234567000089");
    expect(doc.AccountingCustomerParty.Party.PartyName.Name).toBe("Client <Test> SA");
  });

  it("escapes special characters", () => {
    expect(xml).toContain("Atlas &amp; Fils SARL");
    expect(xml).toContain("Client &lt;Test&gt; SA");
    expect(xml).toContain("Prestation &quot;conseil&quot; &amp; audit");
  });

  it("has payment means, tax and monetary totals", () => {
    expect(doc.PaymentMeans.PaymentMeansCode).toBe("30");
    expect(doc.PaymentMeans.PayeeFinancialAccount.ID).toBe("011780000012345678901234");
    const subtotals = arr(doc.TaxTotal.TaxSubtotal) as any[];
    expect(subtotals.map((t) => [t.TaxCategory.ID, t.TaxCategory.Percent])).toEqual([["S", "20"], ["E", "0"]]);
    expect(doc.TaxTotal.TaxAmount["#text"]).toBe("180.00");
    expect(doc.TaxTotal.TaxAmount["@_currencyID"]).toBe("MAD");
    const m = doc.LegalMonetaryTotal;
    expect(m.LineExtensionAmount["#text"]).toBe("1000.00");
    expect(m.TaxInclusiveAmount["#text"]).toBe("1180.00");
    expect(m.PayableAmount["#text"]).toBe("1180.00");
  });

  it("emits invoice lines with unit code", () => {
    const l = arr(doc.InvoiceLine) as any[];
    expect(l).toHaveLength(2);
    expect(l[0].InvoicedQuantity["@_unitCode"]).toBe("C62");
    expect(l[0].LineExtensionAmount["#text"]).toBe("900.00");
    expect(l[0].Item.ClassifiedTaxCategory.ID).toBe("S");
    expect(l[0].Price.PriceAmount["#text"]).toBe("500");
    expect(l[1].Item.ClassifiedTaxCategory.ID).toBe("E");
  });

  it("uses 386 for deposits and 10 plus a stamp charge for cash", () => {
    const dep = parse(buildUbl({ company, invoice: makeInvoice({ type: "DEPOSIT", paymentMethod: "CASH" }) })).Invoice;
    expect(dep.InvoiceTypeCode).toBe("386");
    expect(dep.PaymentMeans.PaymentMeansCode).toBe("10");
    expect(dep.LegalMonetaryTotal.ChargeTotalAmount["#text"]).toBe("2.95");
    expect(dep.LegalMonetaryTotal.PayableAmount["#text"]).toBe("1182.95");
  });

  it("omits optional supplier identifiers and RIB when absent", () => {
    const bare = { ...company, rcNumber: undefined, tpNumber: undefined, cnssNumber: undefined, rib: undefined };
    const out = buildUbl({ company: bare, invoice: makeInvoice() });
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).not.toContain("MA:RC");
    expect(out).not.toContain("PayeeFinancialAccount");
  });
});

describe("buildUbl credit note", () => {
  const xml = buildUbl({
    company,
    invoice: makeInvoice({ type: "CREDIT_NOTE", number: "AV-2026-0001" }),
    originalNumber: "2026-0001",
  });
  const doc = parse(xml).CreditNote;

  it("is well-formed with the CreditNote root", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
  });

  it("has type code 381, no DueDate, and a billing reference", () => {
    expect(doc.CreditNoteTypeCode).toBe("381");
    expect(doc.InvoiceTypeCode).toBeUndefined();
    expect(doc.DueDate).toBeUndefined();
    expect(doc.ID).toBe("AV-2026-0001");
    expect(doc.BillingReference.InvoiceDocumentReference.ID).toBe("2026-0001");
  });

  it("uses CreditNoteLine and CreditedQuantity", () => {
    const l = arr(doc.CreditNoteLine) as any[];
    expect(l).toHaveLength(2);
    expect(l[0].CreditedQuantity["@_unitCode"]).toBe("C62");
    expect(doc.InvoiceLine).toBeUndefined();
  });
});
