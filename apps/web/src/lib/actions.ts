"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type {
  PurchaseInput,
  PurchasePaymentInput,
  BankImportInput,
  BankMatchInput,
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
import { sub } from "./format";
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

export const importBank = async (input: BankImportInput) => run(() => api.importBank(input));
export const deleteBankImport = async (id: string) => run(() => api.deleteBankImport(id));
export const matchBankLine = async (id: string, input: BankMatchInput) => run(() => api.bankMatch(id, input));
export const unmatchBankLine = async (id: string) => run(() => api.bankUnmatch(id));
export const ignoreBankLine = async (id: string) => run(() => api.bankIgnore(id));
export const unignoreBankLine = async (id: string) => run(() => api.bankUnignore(id));

/** Issued invoices that still have something due, for the matching panel. */
export async function loadOpenInvoices() {
  try {
    const all = await api.invoices({ state: "ISSUED" });
    return {
      ok: true as const,
      data: all
        .filter((i) => i.type !== "CREDIT_NOTE" && i.paymentStatus !== "PAID")
        .map((i) => ({ id: i.id, number: i.number ?? "", customerName: i.customerName, dueDate: i.dueDate, remaining: sub(i.amountDue, i.paidAmount) }))
        .filter((i) => Number(i.remaining) > 0),
    };
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false as const, error: e.error };
    throw e;
  }
}

export const savePurchase = async (id: string | null, input: PurchaseInput) =>
  run(() => (id ? api.updatePurchase(id, input) : api.createPurchase(input)));
export const deletePurchase = async (id: string) => run(() => api.deletePurchase(id));
export const approvePurchase = async (id: string) => run(() => api.approvePurchase(id));
export const rejectPurchase = async (id: string, reason: string) => run(() => api.rejectPurchase(id, reason));
export const reopenPurchase = async (id: string) => run(() => api.reopenPurchase(id));
export const disputePurchase = async (id: string, disputed: boolean) => run(() => api.disputePurchase(id, disputed));
export const payPurchase = async (id: string, input: PurchasePaymentInput) => run(() => api.payPurchase(id, input));
export const voidPurchasePayment = async (id: string, paymentId: string) => run(() => api.voidPurchasePayment(id, paymentId));

/** Looks for an existing invoice of this supplier with the same number, to link from a DUPLICATE refusal. */
export async function findPurchaseByNumber(supplierId: string, number: string) {
  try {
    const list = await api.purchases({ supplierId, q: number.trim(), pageSize: "20" });
    const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();
    const hit = list.items.find((p) => norm(p.number) === norm(number));
    return hit ? { id: hit.id, number: hit.number } : null;
  } catch (e) {
    if (e instanceof ApiFailure) return null;
    throw e;
  }
}
