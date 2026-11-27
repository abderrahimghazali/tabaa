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
