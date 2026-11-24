"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type {
  CompanyInput,
  InvoiceInput,
  ItemInput,
  PartyInput,
  PaymentInput,
} from "@facture/core";
import { api, ApiFailure } from "./api";
import type { Result } from "./result";

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false, error: e.error };
    throw e;
  }
}

export async function setLocale(locale: "fr" | "ar") {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export const saveCompany = async (input: CompanyInput) => run(() => api.saveCompany(input));

export const createParty = async (input: PartyInput) => run(() => api.createParty(input));
export const updateParty = async (id: string, input: PartyInput) =>
  run(() => api.updateParty(id, input));
export const deleteParty = async (id: string) => run(() => api.deleteParty(id));

export const createItem = async (input: ItemInput) => run(() => api.createItem(input));
export const updateItem = async (id: string, input: ItemInput) =>
  run(() => api.updateItem(id, input));
export const deleteItem = async (id: string) => run(() => api.deleteItem(id));

export const saveInvoice = async (id: string | null, input: InvoiceInput) =>
  run(() => (id ? api.updateInvoice(id, input) : api.createInvoice(input)));
export const issueInvoice = async (id: string) => run(() => api.issueInvoice(id));
export const deleteInvoice = async (id: string) => run(() => api.deleteInvoice(id));
export const createCreditNote = async (id: string) => run(() => api.creditNote(id));
export const addPayment = async (id: string, input: PaymentInput) =>
  run(() => api.addPayment(id, input));
export const removePayment = async (id: string) => run(() => api.deletePayment(id));

export async function searchAll(q: string) {
  const term = q.trim();
  if (!term) return { invoices: [], parties: [] };
  const [invoices, parties] = await Promise.all([
    api.invoices({ q: term }).catch(() => []),
    api.parties(term).catch(() => []),
  ]);
  return {
    invoices: invoices.slice(0, 5).map((i) => ({ id: i.id, number: i.number, customerName: i.customerName, totalGross: i.totalGross })),
    parties: parties.slice(0, 5).map((p) => ({ id: p.id, name: p.name, ice: p.ice ?? null })),
  };
}
