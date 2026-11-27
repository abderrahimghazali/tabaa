"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type {
  DeliveryKind,
  Role,
  SendInvoiceInput,
  CompanyInput,
  InviteInput,
  InvoiceInput,
  ItemInput,
  PartyInput,
  PaymentInput,
} from "@facture/core";
import { api, ApiFailure } from "./api";
import { ensureStoredPdf } from "./invoice-pdf";
import { PdfTimeout, PdfUnavailable } from "./pdf-render";
import { getT } from "./locale";
import { run } from "./run";
import type { Result } from "./result";

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

export async function loadAuditEvents(before?: string) {
  try {
    return { ok: true as const, data: await api.auditEvents(before) };
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false as const, error: e.error };
    throw e;
  }
}

export async function getSendPreview(id: string, kind: DeliveryKind) {
  try {
    return { ok: true as const, data: await api.sendPreview(id, kind) };
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false as const, error: e.error };
    throw e;
  }
}

/** Stores the invoice PDF if it is missing, then asks the API to email it. */
export async function sendInvoice(id: string, input: SendInvoiceInput): Promise<Result<Awaited<ReturnType<typeof api.sendInvoice>>>> {
  try {
    await ensureStoredPdf(id);
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false, error: e.error };
    const { t } = await getT();
    if (e instanceof PdfUnavailable) return { ok: false, error: { code: "PDF_UNAVAILABLE", message: t("pdf.unavailable") } };
    if (e instanceof PdfTimeout) return { ok: false, error: { code: "PDF_TIMEOUT", message: t("pdf.timeout") } };
    return { ok: false, error: { code: "PDF_FAILED", message: t("pdf.failed") } };
  }
  return run(() => api.sendInvoice(id, input));
}

export const inviteMember = async (input: InviteInput) => run(() => api.invite(input));
export const resendInvitation = async (id: string) => run(() => api.resendInvitation(id));
export const revokeInvitation = async (id: string) => run(() => api.revokeInvitation(id));
export const changeMemberRole = async (userId: string, role: Role) => run(() => api.changeRole(userId, role));
export const removeMember = async (userId: string) => run(() => api.removeMember(userId));
