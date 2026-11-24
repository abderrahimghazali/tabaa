import { computeInvoice } from "./calculator.js";
import type { Company, Invoice, InvoiceInput, LineInput, Party } from "./contracts.js";
import { MA_2026 } from "./rules.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const company: Company = {
  id: uuid(1),
  name: "Atlas & Fils SARL",
  address: { line1: "12 rue Hassan II", city: "Casablanca", postalCode: "20000", country: "MA" },
  ice: "001234567000089",
  ifNumber: "12345678",
  rcNumber: "98765",
  tpNumber: "11223344",
  cnssNumber: "5566778",
  vatRegime: "MONTHLY",
  vatTaxPoint: "RECEIPTS",
  rib: "011780000012345678901234",
  defaultPaymentTermDays: 60,
  invoiceLanguage: "fr",
};

export const customer: Party = {
  id: uuid(2),
  kind: "CUSTOMER",
  type: "BUSINESS",
  name: "Client <Test> SA",
  ice: "002345678000012",
  ifNumber: "87654321",
  address: { line1: "5 avenue Mohammed V", city: "Rabat", country: "MA" },
};

export const lines: LineInput[] = [
  { description: "Prestation \"conseil\" & audit", quantity: "2", unit: "unité", unitPrice: "500", discountPercent: "10", vatRate: "20" },
  { description: "Livre", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0", vatRate: "0" },
];

export const invoiceInput: InvoiceInput = {
  type: "INVOICE",
  customerId: customer.id,
  issueDate: "2026-03-01",
  dueDate: "2026-04-30",
  currency: "MAD",
  paymentMethod: "TRANSFER",
  lines,
};

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const paymentMethod = overrides.paymentMethod ?? "TRANSFER";
  const totals = computeInvoice(overrides.lines ?? lines, { paymentMethod, rules: MA_2026 });
  return {
    ...invoiceInput,
    id: uuid(3),
    number: "2026-0001",
    state: "ISSUED",
    dueDate: "2026-04-30",
    language: "fr",
    totals,
    amountInWords: { fr: "mille dirhams", ar: "ألف درهم" },
    paidAmount: "0.00",
    paymentStatus: "UNPAID",
    overdue: false,
    issuedAt: null,
    customer,
    payments: [],
    ...overrides,
  };
}
