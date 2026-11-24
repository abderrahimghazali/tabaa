import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "./api";

export const getCompany = cache(() => api.company());

export async function requireCompany() {
  const company = await getCompany();
  if (!company) redirect("/parametres/entreprise");
  return company;
}

export const getDashboard = cache(() => api.dashboard());

export const getMe = cache(() => api.me());
