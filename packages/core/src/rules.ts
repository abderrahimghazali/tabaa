// Regulatory values are data with an effective date, never constants in logic.
// Values below come from SPEC-MAROC.md section 2 and are marked [V] there:
// confirm with an expert-comptable before production use.
export interface RulePackage {
  id: string;
  effectiveFrom: string;
  vatRates: string[];
  defaultPaymentTermDays: number;
  maxPaymentTermDays: number;
  stampDutyRate: string;
}

export const MA_2026: RulePackage = {
  id: "ma-2026",
  effectiveFrom: "2026-01-01",
  vatRates: ["20", "10", "0"],
  defaultPaymentTermDays: 60,
  maxPaymentTermDays: 120,
  stampDutyRate: "0.0025",
};

const PACKAGES = [MA_2026];

export function activeRules(date: string): RulePackage {
  const match = PACKAGES.filter((p) => p.effectiveFrom <= date).at(-1);
  return match ?? MA_2026;
}
