import { describe, expect, it } from "vitest";
import { computeInvoice } from "./calculator.js";
import type { Company, InvoiceInput, Party } from "./contracts.js";
import { company, customer, invoiceInput } from "./test-fixtures.js";
import { MA_2026 } from "./rules.js";
import { validateForIssue } from "./validation.js";

function run(
  over: { company?: Partial<Company>; customer?: Partial<Party>; invoice?: Partial<InvoiceInput> } = {},
) {
  const inv = { ...invoiceInput, ...over.invoice };
  const totals = computeInvoice(inv.lines, { paymentMethod: inv.paymentMethod, rules: MA_2026 });
  return validateForIssue({
    company: { ...company, ...over.company },
    customer: { ...customer, ...over.customer },
    invoice: inv,
    totals,
    rules: MA_2026,
  });
}
const rules = (issues: ReturnType<typeof run>) => issues.map((i) => i.rule);
const line = (over: Record<string, string>) => ({ ...invoiceInput.lines[0]!, ...over });

describe("validateForIssue", () => {
  it("passes a complete invoice with no issues", () => {
    expect(run()).toEqual([]);
  });

  it("MA-ICE-SELLER: missing or invalid company ICE", () => {
    expect(rules(run({ company: { ice: "" } }))).toContain("MA-ICE-SELLER");
    const bad = run({ company: { ice: "123" } }).find((i) => i.rule === "MA-ICE-SELLER");
    expect(bad).toMatchObject({ path: "company.ice", severity: "error" });
    expect(bad?.message).toContain("15 chiffres");
  });

  it("MA-IF-SELLER: missing company IF", () => {
    expect(run({ company: { ifNumber: undefined } })).toEqual([
      expect.objectContaining({ rule: "MA-IF-SELLER", severity: "error", path: "company.ifNumber" }),
    ]);
  });

  it.each(["BUSINESS", "PUBLIC"] as const)("MA-ICE-BUYER: required for %s", (type) => {
    expect(rules(run({ customer: { type, ice: undefined } }))).toContain("MA-ICE-BUYER");
    expect(rules(run({ customer: { type, ice: "abc" } }))).toContain("MA-ICE-BUYER");
    expect(rules(run({ customer: { type } }))).not.toContain("MA-ICE-BUYER");
  });

  it.each(["CONSUMER", "FOREIGN"] as const)("no buyer ICE issue for %s", (type) => {
    expect(run({ customer: { type, ice: undefined } })).toEqual([]);
  });

  it("LINE-QTY: no lines, zero or negative quantity", () => {
    expect(rules(run({ invoice: { lines: [] } }))).toContain("LINE-QTY");
    const zero = run({ invoice: { lines: [line({ quantity: "0" })] } });
    expect(zero.find((i) => i.rule === "LINE-QTY")?.path).toBe("invoice.lines.0.quantity");
    expect(rules(run({ invoice: { lines: [line({ quantity: "-1" })] } }))).toContain("LINE-QTY");
    expect(rules(run({ invoice: { lines: [line({ quantity: "0.5" })] } }))).not.toContain("LINE-QTY");
  });

  it("LINE-PRICE: negative unit price only", () => {
    const neg = run({ invoice: { lines: [line({ unitPrice: "-1" }), line({})] } });
    expect(neg.find((i) => i.rule === "LINE-PRICE")?.path).toBe("invoice.lines.0.unitPrice");
    expect(rules(run({ invoice: { lines: [line({ unitPrice: "0" }), line({})] } }))).not.toContain("LINE-PRICE");
  });

  it("VAT-RATE: rate outside the rule package", () => {
    const bad = run({ invoice: { lines: [line({ vatRate: "14" })] } });
    expect(bad.find((i) => i.rule === "VAT-RATE")?.path).toBe("invoice.lines.0.vatRate");
    expect(rules(run({ invoice: { lines: [line({ vatRate: "10" })] } }))).not.toContain("VAT-RATE");
    expect(rules(run({ invoice: { lines: [line({ vatRate: "20.0" })] } }))).not.toContain("VAT-RATE");
  });

  it("TOTAL-POSITIVE: total must be above zero", () => {
    expect(rules(run({ invoice: { lines: [line({ unitPrice: "0" })] } }))).toContain("TOTAL-POSITIVE");
    expect(rules(run())).not.toContain("TOTAL-POSITIVE");
  });

  it("CN-ORIGINAL: credit note needs the original invoice", () => {
    expect(rules(run({ invoice: { type: "CREDIT_NOTE" } }))).toContain("CN-ORIGINAL");
    const ok = run({ invoice: { type: "CREDIT_NOTE", originalInvoiceId: customer.id } });
    expect(rules(ok)).not.toContain("CN-ORIGINAL");
  });

  it("DUE-BEFORE-ISSUE", () => {
    const bad = run({ invoice: { dueDate: "2026-02-28" } });
    expect(bad.find((i) => i.rule === "DUE-BEFORE-ISSUE")).toMatchObject({ severity: "error", path: "invoice.dueDate" });
    expect(rules(run({ invoice: { dueDate: "2026-03-01" } }))).not.toContain("DUE-BEFORE-ISSUE");
  });

  it("VAT-NOT-SUBJECT: non-zero VAT for a company outside VAT", () => {
    const bad = run({ company: { vatRegime: "NOT_SUBJECT" } });
    expect(bad.filter((i) => i.rule === "VAT-NOT-SUBJECT")).toHaveLength(1);
    const ok = run({ company: { vatRegime: "NOT_SUBJECT" }, invoice: { lines: [line({ vatRate: "0" })] } });
    expect(rules(ok)).not.toContain("VAT-NOT-SUBJECT");
  });

  it("TERM-OVER-LEGAL: warning beyond 120 days, not at exactly 120", () => {
    const over = run({ invoice: { dueDate: "2026-07-01" } });
    expect(over.find((i) => i.rule === "TERM-OVER-LEGAL")).toMatchObject({ severity: "warning" });
    expect(rules(run({ invoice: { dueDate: "2026-06-29" } }))).not.toContain("TERM-OVER-LEGAL");
  });

  it.each([
    ["rcNumber", "MA-RC-SELLER"],
    ["tpNumber", "MA-TP-SELLER"],
    ["cnssNumber", "MA-CNSS-SELLER"],
  ] as const)("%s missing is a warning (%s)", (field, rule) => {
    const issues = run({ company: { [field]: undefined } });
    expect(issues).toEqual([expect.objectContaining({ rule, severity: "warning" })]);
  });

  it("CASH-STAMP: informs about stamp duty", () => {
    const issues = run({ invoice: { paymentMethod: "CASH" } });
    expect(issues).toEqual([expect.objectContaining({ rule: "CASH-STAMP", severity: "warning" })]);
  });
});
