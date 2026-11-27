import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "./api";
import { apiRoot, upstreamHeaders } from "./upstream";

export const getCompany = cache(() => api.company());

export async function requireCompany() {
  const company = await getCompany();
  if (!company) redirect("/parametres/entreprise");
  return company;
}

export const getDashboard = cache(() => api.dashboard());

export const getMe = cache(() => api.me());

/** Bank lines waiting for a match, for the sidebar badge and the dashboard. */
export const getBankToMatch = cache(async () => (await api.bankTransactions({ status: "UNMATCHED", pageSize: "1" })).counts.UNMATCHED);

/** The signed-in user's email, or null when signed out. Never redirects: used by public pages. */
export async function signedInEmail(): Promise<string | null> {
  try {
    const res = await fetch(`${apiRoot()}/v1/me`, { cache: "no-store", headers: await upstreamHeaders(false) });
    if (!res.ok) return null;
    const me = (await res.json()) as { user?: { email?: string } };
    return me.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Purchase invoices waiting for an approval, for the sidebar badge and the dashboard. */
export const getPurchaseOverview = cache(async () => (await api.purchases({ pageSize: "1" })).overview);
