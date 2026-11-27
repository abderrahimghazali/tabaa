import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Address, Company, InvoiceTotals, LineInput, Party, PurchaseVatLine } from '@facture/core';

const base = {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const companies = pgTable(
  'companies',
  {
    ...base,
    name: text('name').notNull(),
    legalForm: text('legal_form'),
    capital: money('capital'),
    address: jsonb('address').$type<Address>().notNull(),
    ice: text('ice').notNull(),
    ifNumber: text('if_number'),
    rcNumber: text('rc_number'),
    rcCourt: text('rc_court'),
    tpNumber: text('tp_number'),
    cnssNumber: text('cnss_number'),
    vatRegime: text('vat_regime').notNull(),
    vatBasis: text('vat_basis').notNull().default('CASH'),
    vatTaxPoint: text('vat_tax_point').notNull(),
    phone: text('phone'),
    email: text('email'),
    bankName: text('bank_name'),
    rib: text('rib'),
    defaultPaymentTermDays: integer('default_payment_term_days').notNull(),
    invoiceLanguage: text('invoice_language').notNull(),
  },
  (t) => [uniqueIndex('companies_tenant_uq').on(t.tenantId)],
);

export const parties = pgTable(
  'parties',
  {
    ...base,
    kind: text('kind').notNull(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    ice: text('ice'),
    ifNumber: text('if_number'),
    address: jsonb('address').$type<Address>().notNull(),
    email: text('email'),
    phone: text('phone'),
    paymentTermDays: integer('payment_term_days'),
  },
  (t) => [index('parties_tenant_idx').on(t.tenantId)],
);

export const items = pgTable('items', {
  ...base,
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit').notNull(),
  unitPrice: money('unit_price').notNull(),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
});

export const invoices = pgTable(
  'invoices',
  {
    ...base,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => parties.id),
    type: text('type').notNull(),
    state: text('state').notNull(),
    number: text('number'),
    issueDate: date('issue_date', { mode: 'string' }).notNull(),
    deliveryDate: date('delivery_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    currency: text('currency').notNull(),
    language: text('language').notNull(),
    paymentMethod: text('payment_method').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    originalInvoiceId: uuid('original_invoice_id'),
    totalNet: money('total_net').notNull(),
    totalVat: money('total_vat').notNull(),
    totalGross: money('total_gross').notNull(),
    stampDuty: money('stamp_duty').notNull(),
    amountDue: money('amount_due').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    retainUntil: date('retain_until', { mode: 'string' }),
    lines: jsonb('lines').$type<LineInput[]>().notNull(),
    snapshot: jsonb('snapshot').$type<{ customer: Party; totals: InvoiceTotals; seller: Company }>(),
  },
  (t) => [
    uniqueIndex('invoices_number_uq')
      .on(t.tenantId, t.companyId, t.number)
      .where(sql`${t.number} is not null`),
    index('invoices_customer_idx').on(t.customerId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    ...base,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    method: text('method').notNull(),
    amount: money('amount').notNull(),
    vatWithheld: money('vat_withheld').notNull().default('0'),
    taxWithheld: money('tax_withheld').notNull().default('0'),
    reference: text('reference'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by'),
    // No foreign key: a voided payment is immutable, so it must keep pointing at the line even if the import goes.
    bankTransactionId: uuid('bank_transaction_id'),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId), index('payments_bank_idx').on(t.bankTransactionId)],
);

export const numberingSequences = pgTable(
  'numbering_sequences',
  {
    ...base,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    series: text('series').notNull(),
    year: integer('year').notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (t) => [unique('numbering_uq').on(t.tenantId, t.companyId, t.series, t.year)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  retainUntil: date('retain_until', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique('memberships_user_tenant_uq').on(t.userId, t.tenantId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull(),
    mfa: text('mfa'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    fingerprint: text('fingerprint'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId, t.purpose), index('email_tokens_expires_idx').on(t.expiresAt)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    actorUserId: uuid('actor_user_id'),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    summary: text('summary'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_events_tenant_idx').on(t.tenantId, t.createdAt)],
);

export const pendingSignups = pgTable('pending_signups', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  companyName: text('company_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mfaAuthenticators = pgTable('mfa_authenticators', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  confirmed: boolean('confirmed').notNull(),
  pendingSecret: text('pending_secret'),
  lastUsedStep: integer('last_used_step'),
});

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.codeHash] })],
);

export const mfaFailures = pgTable(
  'mfa_failures',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('mfa_failures_user_idx').on(t.userId, t.failedAt)],
);

export const mfaChallenges = pgTable('mfa_challenges', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const invoicePdfs = pgTable(
  'invoice_pdfs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    content: bytea('content').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [uniqueIndex('invoice_pdfs_invoice_uq').on(t.invoiceId)],
);

export const invoiceDeliveries = pgTable(
  'invoice_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    kind: text('kind').notNull(),
    to: text('to').array().notNull(),
    cc: text('cc').array().notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    attachUbl: boolean('attach_ubl').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    sentBy: uuid('sent_by'),
    sentByName: text('sent_by_name'),
  },
  (t) => [index('invoice_deliveries_invoice_idx').on(t.invoiceId), index('invoice_deliveries_tenant_sent_idx').on(t.tenantId, t.sentAt)],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by'),
    invitedByName: text('invited_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('invitations_open_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index('invitations_tenant_idx').on(t.tenantId, t.createdAt),
  ],
);

export const bankImports = pgTable('bank_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  fileName: text('file_name').notNull(),
  accountLabel: text('account_label').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  importedBy: uuid('imported_by'),
  importedByName: text('imported_by_name'),
  lineCount: integer('line_count').notNull(),
  duplicateCount: integer('duplicate_count').notNull(),
});

export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    importId: uuid('import_id')
      .notNull()
      .references(() => bankImports.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    label: text('label').notNull(),
    amount: money('amount').notNull(),
    reference: text('reference'),
    hash: text('hash').notNull(),
    status: text('status').notNull().default('UNMATCHED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bank_transactions_import_idx').on(t.importId, t.position),
    index('bank_transactions_hash_idx').on(t.tenantId, t.hash),
    index('bank_transactions_date_idx').on(t.tenantId, t.date),
  ],
);

export const purchases = pgTable(
  'purchases',
  {
    ...base,
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => parties.id),
    number: text('number').notNull(),
    // Lower case, no whitespace: the duplicate check compares this.
    numberKey: text('number_key').notNull(),
    issueDate: date('issue_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    vatLines: jsonb('vat_lines').$type<PurchaseVatLine[]>().notNull(),
    vatDeductible: boolean('vat_deductible').notNull(),
    notes: text('notes'),
    totalNet: money('total_net').notNull(),
    totalVat: money('total_vat').notNull(),
    totalGross: money('total_gross').notNull(),
    state: text('state').notNull(),
    rejectionReason: text('rejection_reason'),
    disputed: boolean('disputed').notNull().default(false),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    disputeClearedAt: timestamp('dispute_cleared_at', { withTimezone: true }),
    supplierSnapshot: jsonb('supplier_snapshot').$type<{ name: string; ice: string | null; ifNumber: string | null }>(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by'),
    approvedByName: text('approved_by_name'),
    createdBy: uuid('created_by'),
    createdByName: text('created_by_name'),
    retainUntil: date('retain_until', { mode: 'string' }),
  },
  (t) => [
    uniqueIndex('purchases_number_uq').on(t.tenantId, t.supplierId, t.numberKey),
    index('purchases_issue_idx').on(t.tenantId, t.issueDate),
    index('purchases_supplier_idx').on(t.supplierId),
  ],
);

export const purchasePayments = pgTable(
  'purchase_payments',
  {
    ...base,
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    method: text('method').notNull(),
    // Cash actually paid to the supplier; the withholdings go to the Treasury.
    amount: money('amount').notNull(),
    vatWithheld: money('vat_withheld').notNull(),
    taxWithheld: money('tax_withheld').notNull(),
    reference: text('reference'),
    createdBy: uuid('created_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by'),
  },
  (t) => [index('purchase_payments_purchase_idx').on(t.purchaseId), index('purchase_payments_paid_idx').on(t.tenantId, t.paidOn)],
);
