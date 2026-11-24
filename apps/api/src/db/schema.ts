import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Address, InvoiceTotals, LineInput, Party } from '@facture/core';

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
    lines: jsonb('lines').$type<LineInput[]>().notNull(),
    snapshot: jsonb('snapshot').$type<{ customer: Party; totals: InvoiceTotals }>(),
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
