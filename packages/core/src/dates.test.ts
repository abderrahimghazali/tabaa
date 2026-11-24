import { describe, expect, it } from "vitest";
import { addDays, daysUntil, defaultDueDate, isOverdue } from "./dates.js";
import { MA_2026 } from "./rules.js";

describe("defaultDueDate", () => {
  it.each([
    ["2026-01-01", undefined, "2026-03-02"],
    ["2026-01-01", 30, "2026-01-31"],
    ["2026-01-31", 30, "2026-03-02"],
    ["2026-12-15", 30, "2027-01-14"],
    ["2028-02-01", 30, "2028-03-02"],
    ["2027-02-01", 30, "2027-03-03"],
    ["2028-02-29", 0, "2028-02-29"],
    ["2026-01-01", 180, "2026-05-01"],
  ])("issue %s term %s -> %s (capped at 120 days)", (issueDate, termDays, expected) => {
    expect(defaultDueDate({ issueDate, termDays, rules: MA_2026 })).toBe(expected);
  });
});

describe("addDays", () => {
  it("is unaffected by DST transitions", () => {
    expect(addDays("2026-03-28", 7)).toBe("2026-04-04");
    expect(addDays("2026-10-20", 14)).toBe("2026-11-03");
  });
});

describe("daysUntil", () => {
  it.each([
    ["2026-01-10", "2026-01-01", 9],
    ["2026-01-01", "2026-01-10", -9],
    ["2026-03-01", "2026-02-28", 1],
    ["2028-03-01", "2028-02-28", 2],
    ["2027-01-01", "2026-01-01", 365],
    ["2028-01-01", "2027-01-01", 365],
    ["2029-01-01", "2028-01-01", 366],
    ["2026-05-05", "2026-05-05", 0],
  ])("%s from %s = %i", (date, today, n) => {
    expect(daysUntil(date, today)).toBe(n);
  });
});

describe("isOverdue", () => {
  it.each([
    ["2026-01-01", "2026-01-02", "10.00", true],
    ["2026-01-02", "2026-01-02", "10.00", false],
    ["2026-01-03", "2026-01-02", "10.00", false],
    ["2026-01-01", "2026-01-02", "0.00", false],
  ])("due %s today %s remaining %s -> %s", (due, today, remaining, expected) => {
    expect(isOverdue(due, today, remaining)).toBe(expected);
  });
});
