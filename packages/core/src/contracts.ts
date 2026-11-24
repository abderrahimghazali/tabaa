import { z } from "zod";

// Amounts travel as decimal strings so no float ever touches money.
export const Decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Id = z.uuid();

export const Address = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().min(1),
  country: z.string().length(2).default("MA"),
});
export type Address = z.infer<typeof Address>;

export const Language = z.enum(["fr", "ar", "fr-ar"]);
export type Language = z.infer<typeof Language>;

export const VatRegime = z.enum(["MONTHLY", "QUARTERLY", "NOT_SUBJECT"]);
export const VatTaxPoint = z.enum(["RECEIPTS", "DEBITS"]);

export const CompanyInput = z.object({
  name: z.string().min(1),
  legalForm: z.string().optional(),
  capital: Decimal.optional(),
  address: Address,
  ice: z.string(),
  ifNumber: z.string().optional(),
  rcNumber: z.string().optional(),
  rcCourt: z.string().optional(),
  tpNumber: z.string().optional(),
  cnssNumber: z.string().optional(),
  vatRegime: VatRegime.default("MONTHLY"),
  vatTaxPoint: VatTaxPoint.default("RECEIPTS"),
  phone: z.string().optional(),
  email: z.email().optional(),
  bankName: z.string().optional(),
  rib: z.string().optional(),
  defaultPaymentTermDays: z.number().int().min(0).max(180).default(60),
  invoiceLanguage: Language.default("fr"),
});
export type CompanyInput = z.infer<typeof CompanyInput>;
export const Company = CompanyInput.extend({ id: Id });
export type Company = z.infer<typeof Company>;

export const PartyKind = z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]);
export const PartyType = z.enum(["BUSINESS", "PUBLIC", "CONSUMER", "FOREIGN"]);
export type PartyType = z.infer<typeof PartyType>;

export const PartyInput = z.object({
  kind: PartyKind.default("CUSTOMER"),
  type: PartyType.default("BUSINESS"),
  name: z.string().min(1),
  ice: z.string().optional(),
  ifNumber: z.string().optional(),
  address: Address,
  email: z.email().optional(),
  phone: z.string().optional(),
  paymentTermDays: z.number().int().min(0).max(180).optional(),
});
export type PartyInput = z.infer<typeof PartyInput>;
export const Party = PartyInput.extend({ id: Id });
export type Party = z.infer<typeof Party>;

export const ItemInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("unité"),
  unitPrice: Decimal,
  vatRate: Decimal,
});
export type ItemInput = z.infer<typeof ItemInput>;
export const Item = ItemInput.extend({ id: Id });
export type Item = z.infer<typeof Item>;

export const PaymentMethod = z.enum([
  "TRANSFER",
  "CHEQUE",
  "BILL_OF_EXCHANGE",
  "CASH",
  "CARD",
  "DIRECT_DEBIT",
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const InvoiceType = z.enum(["INVOICE", "CREDIT_NOTE", "DEPOSIT"]);
export type InvoiceType = z.infer<typeof InvoiceType>;
export const InvoiceState = z.enum(["DRAFT", "ISSUED"]);
export type InvoiceState = z.infer<typeof InvoiceState>;
export const PaymentStatus = z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const LineInput = z.object({
  description: z.string().min(1),
  quantity: Decimal,
  unit: z.string().default("unité"),
  unitPrice: Decimal,
  discountPercent: Decimal.default("0"),
  vatRate: Decimal,
});
export type LineInput = z.infer<typeof LineInput>;

export const ComputedLine = LineInput.extend({
  net: Decimal,
  vat: Decimal,
  gross: Decimal,
});
export type ComputedLine = z.infer<typeof ComputedLine>;

export const TaxBreakdown = z.object({
  rate: Decimal,
  base: Decimal,
  vat: Decimal,
});
export type TaxBreakdown = z.infer<typeof TaxBreakdown>;

export const InvoiceTotals = z.object({
  lines: z.array(ComputedLine),
  breakdown: z.array(TaxBreakdown),
  totalNet: Decimal,
  totalVat: Decimal,
  totalGross: Decimal,
  stampDuty: Decimal,
  amountDue: Decimal,
});
export type InvoiceTotals = z.infer<typeof InvoiceTotals>;

export const InvoiceInput = z.object({
  type: InvoiceType.default("INVOICE"),
  customerId: Id,
  issueDate: IsoDate,
  deliveryDate: IsoDate.optional(),
  dueDate: IsoDate.optional(),
  currency: z.string().length(3).default("MAD"),
  language: Language.optional(),
  paymentMethod: PaymentMethod.default("TRANSFER"),
  reference: z.string().optional(),
  notes: z.string().optional(),
  originalInvoiceId: Id.optional(),
  lines: z.array(LineInput).min(1),
});
export type InvoiceInput = z.infer<typeof InvoiceInput>;

export const Payment = z.object({
  id: Id,
  invoiceId: Id,
  paidOn: IsoDate,
  method: PaymentMethod,
  amount: Decimal,
  reference: z.string().optional(),
});
export type Payment = z.infer<typeof Payment>;
export const PaymentInput = Payment.omit({ id: true, invoiceId: true });
export type PaymentInput = z.infer<typeof PaymentInput>;

export const Invoice = InvoiceInput.extend({
  id: Id,
  number: z.string().nullable(),
  state: InvoiceState,
  dueDate: IsoDate,
  language: Language,
  totals: InvoiceTotals,
  amountInWords: z.object({ fr: z.string(), ar: z.string() }),
  paidAmount: Decimal,
  paymentStatus: PaymentStatus,
  overdue: z.boolean(),
  issuedAt: z.string().nullable(),
  customer: Party,
  payments: z.array(Payment),
});
export type Invoice = z.infer<typeof Invoice>;

export const InvoiceSummary = Invoice.pick({
  id: true,
  number: true,
  type: true,
  state: true,
  issueDate: true,
  dueDate: true,
  currency: true,
  paidAmount: true,
  paymentStatus: true,
  overdue: true,
}).extend({
  customerName: z.string(),
  totalGross: Decimal,
  amountDue: Decimal,
});
export type InvoiceSummary = z.infer<typeof InvoiceSummary>;

export const Dashboard = z.object({
  outstanding: Decimal,
  overdue: Decimal,
  collectedThisMonth: Decimal,
  invoicedThisMonth: Decimal,
  vatCollectedThisMonth: Decimal,
  draftCount: z.number().int(),
  // Unpaid issued invoices, ordered by due date: drives the due-date timeline.
  receivables: z.array(InvoiceSummary),
  recentPayments: z.array(
    Payment.extend({ invoiceNumber: z.string(), customerName: z.string() }),
  ),
  invoicedLastMonth: Decimal,
  collectedLastMonth: Decimal,
  unpaidCount: z.number().int(),
  overdueCount: z.number().int(),
  customerCount: z.number().int(),
  // Mean days from issue to full payment, over invoices fully paid in the last 90 days.
  averageDaysToPay: z.number().nullable(),
  // Last 6 calendar months including the current one, oldest first.
  monthly: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), invoiced: Decimal, collected: Decimal })),
  // Remaining amounts on issued invoices, bucketed by days past the due date.
  aging: z.object({ notDue: Decimal, d1to30: Decimal, d31to60: Decimal, d61to90: Decimal, over90: Decimal }),
  // Top 5 by amount invoiced over the last 12 months.
  topCustomers: z.array(z.object({ customerId: Id, name: z.string(), invoiced: Decimal, outstanding: Decimal })),
  recentInvoices: z.array(InvoiceSummary),
});
export type Dashboard = z.infer<typeof Dashboard>;

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  issues: z
    .array(z.object({ path: z.string(), rule: z.string(), message: z.string() }))
    .optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const Role = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export type Role = z.infer<typeof Role>;

const Password = z.string().min(10).max(128);

export const SignUpInput = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  password: Password,
  companyName: z.string().min(1).max(160),
});
export type SignUpInput = z.infer<typeof SignUpInput>;

export const SignInInput = z.object({ email: z.email(), password: z.string().min(1) });
export type SignInInput = z.infer<typeof SignInInput>;

export const ForgotPasswordInput = z.object({ email: z.email() });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({ token: z.string().min(1), password: Password });
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

export const Me = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.email() }),
  tenant: z.object({ id: Id, name: z.string() }),
  role: Role,
});
export type Me = z.infer<typeof Me>;
