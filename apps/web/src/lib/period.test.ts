import { describe, expect, it } from "vitest";
import { daysTo, formatPeriod, lastFinished, parsePeriod, periodEnd, shiftPeriod } from "./period";

describe("periods", () => {
  it("parses and formats months and quarters", () => {
    expect(parsePeriod("2026-11")).toEqual({ kind: "month", year: 2026, month: 11 });
    expect(parsePeriod("2026-Q4")).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
    expect(formatPeriod(parsePeriod("2026-03")!)).toBe("2026-03");
    expect(formatPeriod(parsePeriod("2026-Q1")!)).toBe("2026-Q1");
  });
  it.each(["", "2026", "2026-13", "2026-00", "2026-Q5", "26-11", "2026-1"])("rejects %j", (s) => expect(parsePeriod(s)).toBeNull());
  it("shifts across year boundaries", () => {
    expect(formatPeriod(shiftPeriod(parsePeriod("2026-01")!, -1))).toBe("2025-12");
    expect(formatPeriod(shiftPeriod(parsePeriod("2026-12")!, 1))).toBe("2027-01");
    expect(formatPeriod(shiftPeriod(parsePeriod("2026-Q1")!, -1))).toBe("2025-Q4");
    expect(formatPeriod(shiftPeriod(parsePeriod("2026-Q4")!, 1))).toBe("2027-Q1");
  });
  it("ends on the last day", () => {
    expect(periodEnd(parsePeriod("2026-02")!)).toBe("2026-02-28");
    expect(periodEnd(parsePeriod("2028-02")!)).toBe("2028-02-29");
    expect(periodEnd(parsePeriod("2026-Q4")!)).toBe("2026-12-31");
  });
  it("finds the last finished period", () => {
    expect(formatPeriod(lastFinished("month", "2026-11-27"))).toBe("2026-10");
    expect(formatPeriod(lastFinished("month", "2026-01-02"))).toBe("2025-12");
    expect(formatPeriod(lastFinished("quarter", "2026-11-27"))).toBe("2026-Q3");
    expect(formatPeriod(lastFinished("quarter", "2026-01-15"))).toBe("2025-Q4");
  });
  it("counts days", () => {
    expect(daysTo("2026-12-31", "2026-11-27")).toBe(34);
    expect(daysTo("2026-11-20", "2026-11-27")).toBe(-7);
  });
});
