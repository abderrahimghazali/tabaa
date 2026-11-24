import "server-only";
import { redirect } from "next/navigation";
import { apiRoot, upstreamHeaders } from "./upstream";
import {
  ApiError,
  type Company,
  type CompanyInput,
  type AuditEvent,
  type Dashboard,
  type Invoice,
  type Me,
  type InvoiceInput,
  type InvoiceSummary,
  type Item,
  type ItemInput,
  type Party,
  type PartyInput,
  type PaymentInput,
} from "@facture/core";

const BASE = `${apiRoot()}/v1`;

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}

const seg = encodeURIComponent;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      cache: "no-store",
      ...init,
      headers: await upstreamHeaders(!!init?.body),
    });
  } catch {
    throw new ApiFailure(0, { code: "UNREACHABLE", message: "API unreachable" });
  }
  if (res.status === 204) return undefined as T;
  if (res.status === 401) redirect("/session-expiree");
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw new ApiFailure(
      res.status,
      parsed.success ? parsed.data : { code: "UNKNOWN", message: `HTTP ${res.status}` },
    );
  }
  return (await res.json()) as T;
}

const body = (data: unknown) => JSON.stringify(data);
const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  me: () => call<Me>("/me"),
  company: () => call<Company | null>("/company"),
  saveCompany: (input: CompanyInput) =>
    call<Company>("/company", { method: "PUT", body: body(input) }),

  parties: (q?: string) => call<Party[]>(`/parties${qs({ q })}`),
  party: (id: string) => call<Party>(`/parties/${seg(id)}`),
  createParty: (input: PartyInput) => call<Party>("/parties", { method: "POST", body: body(input) }),
  updateParty: (id: string, input: Partial<PartyInput>) =>
    call<Party>(`/parties/${seg(id)}`, { method: "PATCH", body: body(input) }),
  deleteParty: (id: string) => call<void>(`/parties/${seg(id)}`, { method: "DELETE" }),

  items: (q?: string) => call<Item[]>(`/items${qs({ q })}`),
  createItem: (input: ItemInput) => call<Item>("/items", { method: "POST", body: body(input) }),
  updateItem: (id: string, input: Partial<ItemInput>) =>
    call<Item>(`/items/${seg(id)}`, { method: "PATCH", body: body(input) }),
  deleteItem: (id: string) => call<void>(`/items/${seg(id)}`, { method: "DELETE" }),

  invoices: (params: { state?: string; status?: string; q?: string; customerId?: string } = {}) =>
    call<InvoiceSummary[]>(`/invoices${qs(params)}`),
  invoice: (id: string) => call<Invoice>(`/invoices/${seg(id)}`),
  createInvoice: (input: InvoiceInput) =>
    call<Invoice>("/invoices", { method: "POST", body: body(input) }),
  updateInvoice: (id: string, input: InvoiceInput) =>
    call<Invoice>(`/invoices/${seg(id)}`, { method: "PATCH", body: body(input) }),
  deleteInvoice: (id: string) => call<void>(`/invoices/${seg(id)}`, { method: "DELETE" }),
  issueInvoice: (id: string) => call<Invoice>(`/invoices/${seg(id)}/issue`, { method: "POST" }),
  creditNote: (id: string) => call<Invoice>(`/invoices/${seg(id)}/credit-note`, { method: "POST" }),
  addPayment: (id: string, input: PaymentInput) =>
    call<Invoice>(`/invoices/${seg(id)}/payments`, { method: "POST", body: body(input) }),
  deletePayment: (id: string) => call<Invoice>(`/payments/${seg(id)}`, { method: "DELETE" }),
  ubl: async (id: string) => {
    const res = await fetch(`${BASE}/invoices/${seg(id)}/ubl`, { cache: "no-store", headers: await upstreamHeaders(false) });
    if (res.status === 401) redirect("/session-expiree");
    if (!res.ok) throw new ApiFailure(res.status, { code: "UBL", message: `HTTP ${res.status}` });
    return res.text();
  },

  dashboard: () => call<Dashboard>("/dashboard"),

  auditEvents: (before?: string) => call<AuditEvent[]>(`/audit-events${qs({ limit: "25", before })}`),
  exportData: async () => {
    const res = await fetch(`${BASE}/export`, { cache: "no-store", headers: await upstreamHeaders(false) });
    if (res.status === 401) redirect("/session-expiree");
    if (!res.ok) throw new ApiFailure(res.status, { code: res.status === 403 ? "FORBIDDEN" : "UNKNOWN", message: `HTTP ${res.status}` });
    return res.text();
  },
};
