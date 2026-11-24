export interface IdentifierCheck {
  valid: boolean;
  reason?: string;
}

const strip = (s: string) => s.replace(/\s+/g, "");

export function validateIce(ice: string): IdentifierCheck {
  return /^\d{15}$/.test(strip(ice))
    ? { valid: true }
    : { valid: false, reason: "L'ICE doit comporter 15 chiffres" };
}

export function validateRib(rib: string): IdentifierCheck {
  return /^\d{24}$/.test(strip(rib))
    ? { valid: true }
    : { valid: false, reason: "Le RIB doit comporter 24 chiffres" };
}

/** "001234567000089" -> "001234567 0000 89" */
export function formatIce(ice: string): string {
  const s = strip(ice);
  if (!/^\d{15}$/.test(s)) return ice;
  return `${s.slice(0, 9)} ${s.slice(9, 13)} ${s.slice(13)}`;
}
