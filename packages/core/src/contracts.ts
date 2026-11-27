import { z } from "zod";

// Amounts travel as decimal strings so no float ever touches money.
export const Decimal = z.string().regex(/^-?\d{1,13}(\.\d{1,6})?$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Id = z.uuid();

export const Address = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().min(1).max(100),
  country: z.string().length(2).default("MA"),
});
export type Address = z.infer<typeof Address>;

export const Language = z.enum(["fr", "ar", "fr-ar"]);
export type Language = z.infer<typeof Language>;

export const VatRegime = z.enum(["MONTHLY", "QUARTERLY", "NOT_SUBJECT"]);
export const VatTaxPoint = z.enum(["RECEIPTS", "DEBITS"]);

export const CompanyInput = z.object({
  name: z.string().min(1).max(200),
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
  name: z.string().min(1).max(200),
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
  name: z.string().min(1).max(200),
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
  description: z.string().min(1).max(500),
  quantity: Decimal,
  unit: z.string().max(20).default("unité"),
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
  reference: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  originalInvoiceId: Id.optional(),
  lines: z.array(LineInput).min(1).max(200),
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

export const DeliveryKind = z.enum(["INVOICE", "REMINDER"]);
export type DeliveryKind = z.infer<typeof DeliveryKind>;

// One email sent to the customer about an issued invoice.
export const InvoiceDelivery = z.object({
  id: Id,
  kind: DeliveryKind,
  to: z.array(z.email()),
  cc: z.array(z.email()),
  subject: z.string(),
  sentAt: z.string(),
  sentByName: z.string().nullable(),
});
export type InvoiceDelivery = z.infer<typeof InvoiceDelivery>;

export const SendInvoiceInput = z.object({
  kind: DeliveryKind.default("INVOICE"),
  to: z.array(z.email()).min(1).max(5),
  cc: z.array(z.email()).max(5).default([]),
  subject: z.string().min(1).max(200),
  message: z.string().max(4000).default(""),
  attachUbl: z.boolean().default(false),
});
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

// What the send dialog is prefilled with.
export const SendInvoicePreview = z.object({
  to: z.array(z.email()),
  subject: z.string(),
  message: z.string(),
});
export type SendInvoicePreview = z.infer<typeof SendInvoicePreview>;

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
  // The company as it was when the invoice was issued; the live company for drafts.
  seller: Company.nullable(),
  payments: z.array(Payment),
  deliveries: z.array(InvoiceDelivery),
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
  lastSentAt: z.string().nullable(),
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

// ACCOUNTANT is the external accountant: reads everything and exports, changes nothing.
export const Role = z.enum(["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT", "VIEWER"]);
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
  mfaEnabled: z.boolean(),
  // Every workspace this user belongs to, the active one included.
  memberships: z.array(z.object({ tenantId: Id, tenantName: z.string(), role: Role })),
});
export type Me = z.infer<typeof Me>;

export const AuditEvent = z.object({
  id: Id,
  at: z.string(),
  actorName: z.string().nullable(),
  // Dotted verb, e.g. "auth.sign_in", "auth.sign_in_failed", "invoice.issued", "payment.voided", "company.updated".
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  summary: z.string().nullable(),
  ip: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const SignUpAccepted = z.object({ status: z.literal("PENDING_VERIFICATION") });
export type SignUpAccepted = z.infer<typeof SignUpAccepted>;

export const VerifyEmailInput = z.object({ token: z.string().min(1) });
export type VerifyEmailInput = z.infer<typeof VerifyEmailInput>;

// Sign-in either completes, or asks for the second factor.
export const MfaRequired = z.object({ mfaRequired: z.literal(true) });
export const SignInResult = z.union([Me, MfaRequired]);
export type SignInResult = z.infer<typeof SignInResult>;

const TotpCode = z.string().regex(/^\d{6}$/);

// Exactly one of the two.
export const MfaVerifyInput = z
  .object({ code: TotpCode.optional(), recoveryCode: z.string().min(8).max(40).optional() })
  .refine((v) => (v.code ? 1 : 0) + (v.recoveryCode ? 1 : 0) === 1);
export type MfaVerifyInput = z.infer<typeof MfaVerifyInput>;

export const MfaSetup = z.object({ secret: z.string(), otpauthUrl: z.string() });
export type MfaSetup = z.infer<typeof MfaSetup>;

export const MfaEnableInput = z.object({ code: TotpCode });
export type MfaEnableInput = z.infer<typeof MfaEnableInput>;

export const RecoveryCodes = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof RecoveryCodes>;

// Re-authentication for sensitive actions: the password, plus a code when two-factor is on.
export const Reauth = z.object({ password: z.string().min(1), code: TotpCode.optional() });
export type Reauth = z.infer<typeof Reauth>;

export const CloseTenantInput = Reauth.extend({ confirmName: z.string().min(1) });
export type CloseTenantInput = z.infer<typeof CloseTenantInput>;

export const TeamMember = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.email(),
  role: Role,
  joinedAt: z.string(),
  mfaEnabled: z.boolean(),
  isYou: z.boolean(),
});
export type TeamMember = z.infer<typeof TeamMember>;

export const Invitation = z.object({
  id: Id,
  email: z.email(),
  role: Role,
  invitedByName: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invitation = z.infer<typeof Invitation>;

export const Team = z.object({ members: z.array(TeamMember), invitations: z.array(Invitation) });
export type Team = z.infer<typeof Team>;

export const InviteInput = z.object({ email: z.email(), role: Role });
export type InviteInput = z.infer<typeof InviteInput>;

export const ChangeRoleInput = z.object({ role: Role });
export type ChangeRoleInput = z.infer<typeof ChangeRoleInput>;

// Shown on the invitation page before accepting.
export const InvitationPreview = z.object({
  tenantName: z.string(),
  email: z.email(),
  role: Role,
  inviterName: z.string().nullable(),
  accountExists: z.boolean(),
});
export type InvitationPreview = z.infer<typeof InvitationPreview>;

// `name` and `password` are required when no account exists for the invited email.
export const AcceptInvitationInput = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(10).max(128).optional(),
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInput>;

export const SwitchTenantInput = z.object({ tenantId: Id });
export type SwitchTenantInput = z.infer<typeof SwitchTenantInput>;
