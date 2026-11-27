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
// When VAT becomes due: on payment received (the default regime) or on invoicing (on option).
export const VatBasis = z.enum(["CASH", "ACCRUAL"]);
export type VatBasis = z.infer<typeof VatBasis>;
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
  vatBasis: VatBasis.default("CASH"),
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
  // Cash received. What settles the invoice is amount + vatWithheld + taxWithheld.
  amount: Decimal,
  // Withheld by the customer and paid to the Treasury on the company's behalf: a tax credit, not a discount.
  vatWithheld: Decimal.default("0"),
  taxWithheld: Decimal.default("0"),
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

// Bank statement import and reconciliation. The browser parses the bank's file
// and sends normalised lines; the file itself never reaches the server.
export const BankLineInput = z.object({
  date: IsoDate,
  label: z.string().min(1).max(300),
  // Signed: positive is money received, negative is money paid out.
  amount: Decimal,
  reference: z.string().max(100).optional(),
});
export type BankLineInput = z.infer<typeof BankLineInput>;

export const BankImportInput = z.object({
  fileName: z.string().min(1).max(200),
  accountLabel: z.string().max(100).default(""),
  lines: z.array(BankLineInput).min(1).max(2000),
});
export type BankImportInput = z.infer<typeof BankImportInput>;

export const BankImport = z.object({
  id: Id,
  fileName: z.string(),
  accountLabel: z.string(),
  importedAt: z.string(),
  importedByName: z.string().nullable(),
  lineCount: z.number().int(),
  // Lines already present from an earlier import, skipped.
  duplicateCount: z.number().int(),
  matchedCount: z.number().int(),
});
export type BankImport = z.infer<typeof BankImport>;

export const BankTransactionStatus = z.enum(["UNMATCHED", "MATCHED", "IGNORED"]);
export type BankTransactionStatus = z.infer<typeof BankTransactionStatus>;

// An open invoice the server thinks this line could pay, best first.
export const BankSuggestion = z.object({
  invoiceId: Id,
  number: z.string(),
  customerName: z.string(),
  dueDate: IsoDate,
  amountDue: Decimal,
  // Why it is suggested: the invoice number is in the label, the amount equals what is due, the customer name is in the label.
  reasons: z.array(z.enum(["NUMBER", "AMOUNT", "CUSTOMER"])).min(1),
});
export type BankSuggestion = z.infer<typeof BankSuggestion>;

export const BankTransaction = z.object({
  id: Id,
  importId: Id,
  accountLabel: z.string(),
  date: IsoDate,
  label: z.string(),
  amount: Decimal,
  reference: z.string().nullable(),
  status: BankTransactionStatus,
  // Payments recorded from this line (empty unless MATCHED).
  allocations: z.array(
    z.object({ paymentId: Id, invoiceId: Id, number: z.string(), customerName: z.string(), amount: Decimal }),
  ),
  // Only for UNMATCHED lines with a positive amount; at most 5.
  suggestions: z.array(BankSuggestion),
});
export type BankTransaction = z.infer<typeof BankTransaction>;

export const BankTransactionList = z.object({
  items: z.array(BankTransaction),
  total: z.number().int(),
  counts: z.object({ UNMATCHED: z.number().int(), MATCHED: z.number().int(), IGNORED: z.number().int() }),
});
export type BankTransactionList = z.infer<typeof BankTransactionList>;

export const BankMatchInput = z.object({
  method: PaymentMethod.default("TRANSFER"),
  allocations: z.array(z.object({ invoiceId: Id, amount: Decimal })).min(1).max(20),
});
export type BankMatchInput = z.infer<typeof BankMatchInput>;

// Purchase invoices (factures d'achat): what suppliers bill the company.
// GOODS and SERVICES are non-capitalised purchases; FIXED_ASSET is an immobilisation.
// The split follows the deductible-VAT lines of the periodic VAT return.
export const PurchaseCategory = z.enum(["GOODS", "SERVICES", "FIXED_ASSET"]);
export type PurchaseCategory = z.infer<typeof PurchaseCategory>;

export const PurchaseState = z.enum(["TO_APPROVE", "APPROVED", "REJECTED"]);
export type PurchaseState = z.infer<typeof PurchaseState>;

// Amounts as printed on the supplier's invoice, one line per VAT rate.
export const PurchaseVatLine = z.object({ vatRate: Decimal, net: Decimal, vat: Decimal });
export type PurchaseVatLine = z.infer<typeof PurchaseVatLine>;

export const PurchaseInput = z.object({
  supplierId: Id,
  // The supplier's own invoice number.
  number: z.string().min(1).max(60),
  issueDate: IsoDate,
  dueDate: IsoDate,
  category: PurchaseCategory.default("SERVICES"),
  description: z.string().min(1).max(300),
  vatLines: z.array(PurchaseVatLine).min(1).max(5),
  // False when the VAT cannot be recovered (no right to deduct, non-conforming invoice).
  vatDeductible: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
});
export type PurchaseInput = z.infer<typeof PurchaseInput>;

// A payment to the supplier. What settles the invoice is amount + vatWithheld + taxWithheld:
// withholdings are paid to the Treasury on the supplier's behalf, they are not a discount.
export const PurchasePaymentInput = z.object({
  paidOn: IsoDate,
  method: PaymentMethod,
  amount: Decimal,
  vatWithheld: Decimal.default("0"),
  taxWithheld: Decimal.default("0"),
  reference: z.string().max(100).optional(),
});
export type PurchasePaymentInput = z.infer<typeof PurchasePaymentInput>;

export const PurchasePayment = PurchasePaymentInput.extend({ id: Id, settled: Decimal });
export type PurchasePayment = z.infer<typeof PurchasePayment>;

// Non-blocking findings shown to the person approving.
export const PurchaseWarning = z.enum([
  "SUPPLIER_ICE_MISSING",
  "SUPPLIER_IF_MISSING",
  // Due date later than the longest term the rules allow, counted from the issue date.
  "TERM_TOO_LONG",
  // Cash paid to this supplier above the daily or monthly limit for deductibility.
  "CASH_LIMIT",
]);
export type PurchaseWarning = z.infer<typeof PurchaseWarning>;

export const Purchase = PurchaseInput.extend({
  id: Id,
  // Frozen when the invoice is approved; live from the supplier record before that.
  supplier: z.object({ name: z.string(), ice: z.string().nullable(), ifNumber: z.string().nullable() }),
  currency: z.literal("MAD"),
  state: PurchaseState,
  rejectionReason: z.string().nullable(),
  // In dispute with the supplier: stays unpaid without counting as late.
  disputed: z.boolean(),
  totalNet: Decimal,
  totalVat: Decimal,
  totalGross: Decimal,
  paidAmount: Decimal,
  amountDue: Decimal,
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]),
  overdue: z.boolean(),
  payments: z.array(PurchasePayment),
  warnings: z.array(PurchaseWarning),
  createdByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
});
export type Purchase = z.infer<typeof Purchase>;

export const PurchaseSummary = Purchase.pick({
  id: true,
  number: true,
  issueDate: true,
  dueDate: true,
  category: true,
  state: true,
  disputed: true,
  totalGross: true,
  amountDue: true,
  paymentStatus: true,
  overdue: true,
}).extend({ supplierId: Id, supplierName: z.string(), warningCount: z.number().int() });
export type PurchaseSummary = z.infer<typeof PurchaseSummary>;

export const PurchaseList = z.object({
  items: z.array(PurchaseSummary),
  total: z.number().int(),
  // Whole workspace, ignoring the list's filters.
  overview: z.object({
    toApprove: z.number().int(),
    unpaidTotal: Decimal,
    overdueTotal: Decimal,
    overdueCount: z.number().int(),
    dueWithin7Days: Decimal,
  }),
});
export type PurchaseList = z.infer<typeof PurchaseList>;

export const RejectPurchaseInput = z.object({ reason: z.string().min(1).max(500) });
export type RejectPurchaseInput = z.infer<typeof RejectPurchaseInput>;

export const DisputePurchaseInput = z.object({ disputed: z.boolean() });
export type DisputePurchaseInput = z.infer<typeof DisputePurchaseInput>;

// Reports. A period is a month "2026-11" or a quarter "2026-Q4".
export const ReportPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/);
export type ReportPeriod = z.infer<typeof ReportPeriod>;

const BaseVat = z.object({ base: Decimal, vat: Decimal });

// Preparation of the periodic VAT return. A working paper, not the return itself.
export const VatStatement = z.object({
  period: ReportPeriod,
  from: IsoDate,
  to: IsoDate,
  basis: VatBasis,
  // Last day to file and pay online: end of the month after the period.
  filingDeadline: IsoDate,
  collected: z.object({
    byRate: z.array(BaseVat.extend({ vatRate: Decimal })),
    // Turnover at 0 %.
    exemptBase: Decimal,
    totalBase: Decimal,
    totalVat: Decimal,
  }),
  deductible: z.object({
    services: BaseVat,
    goods: BaseVat,
    fixedAssets: BaseVat,
    totalVat: Decimal,
  }),
  // VAT withheld by customers on payments of the period: already paid to the Treasury for the company.
  withheldByCustomers: Decimal,
  // Credit carried over from the previous return, as given by the caller.
  previousCredit: Decimal,
  // collected - deductible - withheldByCustomers - previousCredit: one of the two is zero.
  vatDue: Decimal,
  creditCarriedForward: Decimal,
  sales: z.array(
    z.object({
      invoiceId: Id,
      number: z.string(),
      customerName: z.string(),
      // Payment date on a cash basis, issue date on an accrual basis.
      date: IsoDate,
      vatRate: Decimal,
      base: Decimal,
      vat: Decimal,
    }),
  ),
  // The "relevé de déductions": one row per purchase payment and VAT rate.
  deductions: z.array(
    z.object({
      purchaseId: Id,
      number: z.string(),
      issueDate: IsoDate,
      supplierName: z.string(),
      supplierIf: z.string().nullable(),
      supplierIce: z.string().nullable(),
      description: z.string(),
      category: PurchaseCategory,
      vatRate: Decimal,
      base: Decimal,
      vat: Decimal,
      paidOn: IsoDate,
      method: PaymentMethod,
      reference: z.string().nullable(),
    }),
  ),
  // What makes the figures incomplete or worth a second look.
  notices: z.array(z.enum(["NOT_SUBJECT", "PERIOD_MISMATCH", "PERIOD_NOT_OVER", "PURCHASES_TO_APPROVE", "CASH_LIMIT"])),
});
export type VatStatement = z.infer<typeof VatStatement>;

const WithholdingRow = z.object({
  paymentId: Id,
  documentId: Id,
  number: z.string(),
  partyName: z.string(),
  partyIf: z.string().nullable(),
  partyIce: z.string().nullable(),
  paidOn: IsoDate,
  // Amounts of the document the payment relates to.
  totalNet: Decimal,
  totalVat: Decimal,
  vatWithheld: Decimal,
  taxWithheld: Decimal,
});

export const WithholdingStatement = z.object({
  period: ReportPeriod,
  from: IsoDate,
  to: IsoDate,
  // Withheld from suppliers on payments of the period: to pay to the Treasury.
  onSuppliers: z.object({
    rows: z.array(WithholdingRow),
    totalVat: Decimal,
    totalTax: Decimal,
    // End of the month after the period's last month.
    remittanceDeadline: IsoDate,
  }),
  // Withheld by customers: credits to claim on the company's own returns.
  byCustomers: z.object({ rows: z.array(WithholdingRow), totalVat: Decimal, totalTax: Decimal }),
});
export type WithholdingStatement = z.infer<typeof WithholdingStatement>;

// Late payments to suppliers (law 69-21): preparation of the quarterly declaration.
export const PaymentTermsStatement = z.object({
  period: ReportPeriod,
  from: IsoDate,
  to: IsoDate,
  filingDeadline: IsoDate,
  // The central bank key rates used, as dated data from the rule package or the caller's override.
  keyRates: z.array(z.object({ from: IsoDate, rate: Decimal })),
  monthlyIncrement: Decimal,
  rows: z.array(
    z.object({
      purchaseId: Id,
      number: z.string(),
      issueDate: IsoDate,
      supplierName: z.string(),
      supplierIf: z.string().nullable(),
      supplierIce: z.string().nullable(),
      totalGross: Decimal,
      // Latest date the law allows: the agreed due date, capped at the legal maximum from the issue date.
      legalDueDate: IsoDate,
      // The part settled after legalDueDate or still unpaid at the end of the period.
      lateAmount: Decimal,
      // Null while still unpaid at the end of the period.
      settledOn: IsoDate.nullable(),
      // Months of delay started, counted to settledOn or to the end of the period.
      monthsLate: z.number().int(),
      ratePercent: Decimal,
      fine: Decimal,
      status: z.enum(["PAID_LATE", "UNPAID"]),
      method: PaymentMethod.nullable(),
      reference: z.string().nullable(),
    }),
  ),
  // Left out of the fine: invoices in dispute.
  disputed: z.array(z.object({ purchaseId: Id, number: z.string(), supplierName: z.string(), amountDue: Decimal })),
  totals: z.object({ unpaidLate: Decimal, paidLate: Decimal, fine: Decimal, count: z.number().int() }),
  notices: z.array(z.enum(["PERIOD_NOT_QUARTER", "PERIOD_NOT_OVER", "PURCHASES_TO_APPROVE", "KEY_RATE_OVERRIDDEN"])),
});
export type PaymentTermsStatement = z.infer<typeof PaymentTermsStatement>;
