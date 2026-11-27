// Regulatory values are data with an effective date, never constants in logic.
// Values below are unverified against the official texts:
// confirm with an expert-comptable before production use.
export interface RulePackage {
  id: string;
  effectiveFrom: string;
  vatRates: string[];
  defaultPaymentTermDays: number;
  maxPaymentTermDays: number;
  stampDutyRate: string;
  // Years kept after the end of the invoice's calendar year. To be confirmed with the accountant.
  retentionYears: number;
  // Cash paid to one supplier above these amounts is not deductible (CGI art. 11-II and 106-II).
  cashLimitPerDay: string;
  cashLimitPerMonth: string;
  // Law 69-21, fine for late payment to suppliers: the central bank key rate in force at the end
  // of the first month of delay, plus this increment per further month started. Percent.
  latePaymentMonthlyIncrement: string;
  // Bank Al-Maghrib key rate history, percent, oldest first. Dates are board meeting dates
  // as reported by the press: check against bkam.ma before filing anything.
  keyRates: { from: string; rate: string }[];
}

export const MA_2026: RulePackage = {
  id: "ma-2026",
  effectiveFrom: "2026-01-01",
  vatRates: ["20", "10", "0"],
  defaultPaymentTermDays: 60,
  maxPaymentTermDays: 120,
  stampDutyRate: "0.0025",
  retentionYears: 10,
  cashLimitPerDay: "5000",
  cashLimitPerMonth: "50000",
  latePaymentMonthlyIncrement: "0.85",
  keyRates: [
    { from: "2023-03-21", rate: "3.00" },
    { from: "2024-06-25", rate: "2.75" },
    { from: "2024-12-17", rate: "2.50" },
    { from: "2025-03-18", rate: "2.25" },
  ],
};

const PACKAGES = [MA_2026];

export function activeRules(date: string): RulePackage {
  const match = PACKAGES.filter((p) => p.effectiveFrom <= date).at(-1);
  return match ?? MA_2026;
}
