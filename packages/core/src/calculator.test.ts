import { describe, expect, it } from "vitest";
import { computeInvoice, paymentStatusOf } from "./calculator.js";
import type { LineInput } from "./contracts.js";
import { MA_2026 } from "./rules.js";

const line = (quantity: string, unitPrice: string, vatRate: string, discountPercent = "0"): LineInput => ({
  description: "x",
  quantity,
  unit: "unité",
  unitPrice,
  discountPercent,
  vatRate,
});
const compute = (lines: LineInput[], paymentMethod: "TRANSFER" | "CASH" = "TRANSFER") =>
  computeInvoice(lines, { paymentMethod, rules: MA_2026 });

describe("computeInvoice", () => {
  it("rounds 3 x 33.333 at 20% half-up", () => {
    const t = compute([line("3", "33.333", "20")]);
    expect(t.lines[0]).toMatchObject({ net: "100.00", vat: "20.00", gross: "120.00" });
    expect(t.totalGross).toBe("120.00");
  });

  it.each([
    ["1", "0.025", "0.03"],
    ["1", "0.024", "0.02"],
    ["1", "2.675", "2.68"],
    ["2.5", "1.01", "2.53"],
  ])("line net %s x %s rounds half-up to %s", (q, p, net) => {
    expect(compute([line(q, p, "0")]).lines[0]?.net).toBe(net);
  });

  it("applies the discount before rounding", () => {
    const t = compute([line("2", "100", "20", "15")]);
    expect(t.lines[0]).toMatchObject({ net: "170.00", vat: "34.00", gross: "204.00" });
  });

  it("computes VAT per rate, not per line", () => {
    const t = compute([line("1", "0.02", "20"), line("1", "0.02", "20"), line("1", "0.02", "20")]);
    expect(t.lines.every((l) => l.vat === "0.00")).toBe(true);
    expect(t.breakdown).toEqual([{ rate: "20", base: "0.06", vat: "0.01" }]);
    expect(t.totalVat).toBe("0.01");
    expect(t.totalGross).toBe("0.07");
  });

  it("groups by rate, sorted descending, including rate 0", () => {
    const t = compute([line("1", "50", "0"), line("1", "100", "10"), line("1", "100", "20"), line("2", "10", "20")]);
    expect(t.breakdown).toEqual([
      { rate: "20", base: "120.00", vat: "24.00" },
      { rate: "10", base: "100.00", vat: "10.00" },
      { rate: "0", base: "50.00", vat: "0.00" },
    ]);
    expect(t.totalNet).toBe("270.00");
    expect(t.totalVat).toBe("34.00");
    expect(t.totalGross).toBe("304.00");
  });

  it("charges 0.25% stamp duty on cash payments only", () => {
    const cash = compute([line("1", "100", "20")], "CASH");
    expect(cash.stampDuty).toBe("0.30");
    expect(cash.amountDue).toBe("120.30");
    const transfer = compute([line("1", "100", "20")], "TRANSFER");
    expect(transfer.stampDuty).toBe("0.00");
    expect(transfer.amountDue).toBe("120.00");
  });

  it("rounds stamp duty half-up", () => {
    const t = compute([line("1", "10.10", "0")], "CASH");
    expect(t.stampDuty).toBe("0.03");
    expect(t.amountDue).toBe("10.13");
  });

  it("handles no lines", () => {
    const t = compute([]);
    expect(t).toMatchObject({ breakdown: [], totalNet: "0.00", amountDue: "0.00" });
  });
});

describe("paymentStatusOf", () => {
  it.each([
    ["100.00", "0", "UNPAID"],
    ["100.00", "0.00", "UNPAID"],
    ["100.00", "-5", "UNPAID"],
    ["100.00", "0.01", "PARTIALLY_PAID"],
    ["100.00", "99.99", "PARTIALLY_PAID"],
    ["100.00", "100.00", "PAID"],
    ["100.00", "150", "PAID"],
  ])("due %s paid %s -> %s", (due, paid, status) => {
    expect(paymentStatusOf(due, paid)).toBe(status);
  });
});
