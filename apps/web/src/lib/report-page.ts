import "server-only";
import { redirect } from "next/navigation";
import { getCompany } from "./data";
import { todayIso } from "./format";
import { formatPeriod, lastFinished, parsePeriod, type Period } from "./period";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** The requested period, or the last finished one of the kind this statement is about. Invalid values are replaced in the URL. */
export async function resolvePeriod(sp: Record<string, string | string[] | undefined>, base: string, defaultKind: "regime" | Period["kind"], allowed: readonly Period["kind"][]) {
  const today = todayIso();
  const asked = one(sp.period);
  const parsed = parsePeriod(asked);
  if (parsed && allowed.includes(parsed.kind)) return { period: formatPeriod(parsed), today, one };
  let kind: Period["kind"] = defaultKind === "regime" ? "month" : defaultKind;
  if (defaultKind === "regime") {
    const company = await getCompany().catch(() => null);
    if (company?.vatRegime === "QUARTERLY") kind = "quarter";
  }
  if (asked !== undefined && parsed) {
    // A period of the wrong kind for this statement: keep its year and move to the right unit.
    kind = allowed[0]!;
  }
  const fallback = formatPeriod(lastFinished(allowed.includes(kind) ? kind : allowed[0]!, today));
  if (asked !== undefined) redirect(`${base}?period=${fallback}`);
  return { period: fallback, today, one };
}
