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
import type { Address, Company, InvoiceTotals, LineInput, Party } from '@facture/core';

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
    reference: text('reference'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by'),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId)],
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
