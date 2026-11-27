import { describe, expect, it } from "vitest";
import {
  endOfMonth,
  endOfNextMonth,
  keyRateAt,
  lateDelay,
  lateFine,
  lateRatePercent,
  legalDueDate,
  monthsLate,
  parsePeriod,
  prorate,
} from "./reports.js";
import { MA_2026 } from "./rules.js";

describe("parsePeriod", () => {
  it("reads months and quarters, leap years included", () => {
    expect(parsePeriod("2026-11")).toEqual({ period: "2026-11", kind: "MONTH", from: "2026-11-01", to: "2026-11-30" });
    expect(parsePeriod("2024-02")?.to).toBe("2024-02-29");
    expect(parsePeriod("2026-02")?.to).toBe("2026-02-28");
    expect(parsePeriod("2026-Q4")).toEqual({ period: "2026-Q4", kind: "QUARTER", from: "2026-10-01", to: "2026-12-31" });
    expect(parsePeriod("2024-Q1")).toMatchObject({ from: "2024-01-01", to: "2024-03-31" });
    expect(parsePeriod("2026-Q2")).toMatchObject({ from: "2026-04-01", to: "2026-06-30" });
    expect(parsePeriod("2026-Q3")).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
  });
  it("refuses anything else", () => {
    for (const bad of ["2026-13", "2026-00", "2026-Q5", "2026-Q0", "26-01", "2026-1", "2026-11-01", "", "q1-2026"]) {
      expect(parsePeriod(bad), bad).toBeNull();
    }
  });
});

describe("month ends", () => {
  it("finds the end of the month after", () => {
    expect(endOfMonth("2026-01-15")).toBe("2026-01-31");
    expect(endOfNextMonth("2026-11-30")).toBe("2026-12-31");
    expect(endOfNextMonth("2026-12-31")).toBe("2027-01-31");
    expect(endOfNextMonth("2024-01-31")).toBe("2024-02-29");
    expect(endOfNextMonth("2026-01-31")).toBe("2026-02-28");
  });
});

describe("prorate", () => {
  it("keeps every cent of a fully settled invoice", () => {
    expect(prorate(["1.00", "1.00", "1.00"], "3.00", "1.00")).toEqual(["0.33", "0.34", "0.33"]);
    expect(prorate(["1.00", "1.00", "1.00"], "3.00", "1.00").reduce((s, v) => s + Number(v) * 100, 0)).toBe(100);
  });
  it("splits 45 000 TTC at 20 % with 75 % of the VAT withheld", () => {
    // cash 39 375 + withheld 5 625 settle the whole invoice: base 37 500, VAT 7 500
    expect(prorate(["45000.00"], "45000.00", "37500.00")).toEqual(["37500.00"]);
    expect(prorate(["45000.00"], "45000.00", "7500.00")).toEqual(["7500.00"]);
    expect(prorate(["22500.00", "22500.00"], "45000.00", "7500.00")).toEqual(["3750.00", "3750.00"]);
  });
  it("prorates a partial payment and hands the remainder to the last one", () => {
    expect(prorate(["60.00"], "120.00", "100.00")).toEqual(["50.00"]);
    const parts = prorate(["40.00", "40.00", "40.00"], "120.00", "99.99");
    expect(parts).toEqual(["33.33", "33.33", "33.33"]);
    expect(prorate(["70.00", "50.00"], "120.00", "99.99")).toEqual(["58.33", "41.66"]);
  });
  it("does not count what exceeds the gross, such as stamp duty", () => {
    expect(prorate(["100.00", "0.25"], "100.00", "83.33")).toEqual(["83.33", "0.00"]);
  });
  it("handles a zero gross and a negative part", () => {
    expect(prorate(["1.00"], "0.00", "0.00")).toEqual(["0.00"]);
    expect(prorate(["50.00", "50.00"], "100.00", "-10.01")).toEqual(["-5.01", "-5.00"]);
  });
});

describe("legalDueDate", () => {
  it("caps the agreed term at the legal maximum", () => {
    expect(legalDueDate("2026-01-10", "2026-02-10", 120)).toBe("2026-02-10");
    expect(legalDueDate("2026-01-10", "2026-12-10", 120)).toBe("2026-05-10");
    expect(legalDueDate("2024-01-01", "2025-01-01", 60)).toBe("2024-03-01");
  });
});

describe("monthsLate", () => {
  it("counts calendar months started, the delay beginning the day after the due date", () => {
    expect(monthsLate("2026-01-15", "2026-01-20")).toBe(1);
    expect(monthsLate("2026-01-15", "2026-01-16")).toBe(1);
    expect(monthsLate("2026-01-15", "2026-01-31")).toBe(1);
    expect(monthsLate("2026-01-15", "2026-02-01")).toBe(2);
    expect(monthsLate("2026-01-31", "2026-02-01")).toBe(1);
    expect(monthsLate("2026-01-31", "2026-02-28")).toBe(1);
    expect(monthsLate("2026-01-31", "2026-03-01")).toBe(2);
    expect(monthsLate("2026-12-31", "2027-01-01")).toBe(1);
    expect(monthsLate("2026-12-31", "2027-03-15")).toBe(3);
    expect(monthsLate("2024-02-28", "2024-02-29")).toBe(1);
    expect(monthsLate("2024-02-29", "2024-03-01")).toBe(1);
    expect(monthsLate("2025-02-28", "2025-03-01")).toBe(1);
    expect(monthsLate("2026-03-10", "2026-03-10")).toBe(1);
  });
});

describe("key rate and fine", () => {
  const rates = MA_2026.keyRates;
  it("looks the rate up by date", () => {
    expect(keyRateAt("2025-03-17", rates)).toBe("2.50");
    expect(keyRateAt("2025-03-18", rates)).toBe("2.25");
    expect(keyRateAt("2026-11-27", rates)).toBe("2.25");
    expect(keyRateAt("2024-06-25", rates)).toBe("2.75");
    expect(keyRateAt("2020-01-01", rates)).toBe("3.00");
    expect(keyRateAt("2026-01-01", [{ from: "2026-01-01", rate: "3.50" }])).toBe("3.50");
  });
  it("adds the increment for every month after the first", () => {
    expect(lateRatePercent("2.25", "0.85", 1)).toBe("2.25");
    expect(lateRatePercent("2.25", "0.85", 3)).toBe("3.95");
    // a delay of three months on top of the first: 2.25 + 3 x 0.85
    expect(lateRatePercent("2.25", "0.85", 4)).toBe("4.80");
  });
  it("rounds the fine to the cent", () => {
    expect(lateFine("10000.00", "4.80")).toBe("480.00");
    expect(lateFine("333.33", "2.25")).toBe("7.50");
    expect(lateFine("0.01", "2.25")).toBe("0.00");
  });
  it("uses the rate of the first month of delay, not the one at payment", () => {
    // due 10 Feb 2025: first month of delay ends 28 Feb, key rate then 2.50; paid in June (months Feb..Jun = 5)
    const d = lateDelay({ legalDue: "2025-02-10", until: "2025-06-20", amount: "1000.00", keyRates: rates, monthlyIncrement: "0.85" });
    expect(d).toEqual({ monthsLate: 5, ratePercent: "5.90", fine: "59.00" });
    // due 10 Mar 2025: first month ends 31 Mar, after the cut to 2.25 on 18 Mar
    expect(lateDelay({ legalDue: "2025-03-10", until: "2025-03-30", amount: "1000.00", keyRates: rates, monthlyIncrement: "0.85" })).toEqual({
      monthsLate: 1,
      ratePercent: "2.25",
      fine: "22.50",
    });
    // due 1 Mar: delay starts on 2 Mar, first month ends 31 Mar, rate 2.25
    expect(lateDelay({ legalDue: "2025-03-01", until: "2025-03-10", amount: "100.00", keyRates: rates, monthlyIncrement: "0.85" }).ratePercent).toBe("2.25");
  });
});
