CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"legal_form" text,
	"capital" numeric(18,2),
	"address" jsonb NOT NULL,
	"ice" text NOT NULL,
	"if_number" text,
	"rc_number" text,
	"rc_court" text,
	"tp_number" text,
	"cnss_number" text,
	"vat_regime" text NOT NULL,
	"vat_tax_point" text NOT NULL,
	"phone" text,
	"email" text,
	"bank_name" text,
	"rib" text,
	"default_payment_term_days" integer NOT NULL,
	"invoice_language" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" text NOT NULL,
	"number" text,
	"issue_date" date NOT NULL,
	"delivery_date" date,
	"due_date" date NOT NULL,
	"currency" text NOT NULL,
	"language" text NOT NULL,
	"payment_method" text NOT NULL,
	"reference" text,
	"notes" text,
	"original_invoice_id" uuid,
	"total_net" numeric(18,2) NOT NULL,
	"total_vat" numeric(18,2) NOT NULL,
	"total_gross" numeric(18,2) NOT NULL,
	"stamp_duty" numeric(18,2) NOT NULL,
	"amount_due" numeric(18,2) NOT NULL,
	"issued_at" timestamp with time zone,
	"lines" jsonb NOT NULL,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text NOT NULL,
	"unit_price" numeric(18,2) NOT NULL,
	"vat_rate" numeric(5,2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numbering_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_id" uuid NOT NULL,
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "numbering_uq" UNIQUE("tenant_id","company_id","series","year")
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"ice" text,
	"if_number" text,
	"address" jsonb NOT NULL,
	"email" text,
	"phone" text,
	"payment_term_days" integer
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(18,2) NOT NULL,
	"reference" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "companies_tenant_uq" ON "companies" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" ("tenant_id","company_id","number") WHERE "number" is not null;--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" ("customer_id");--> statement-breakpoint
CREATE INDEX "parties_tenant_idx" ON "parties" ("tenant_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" ("invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_parties_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "parties"("id");--> statement-breakpoint
ALTER TABLE "numbering_sequences" ADD CONSTRAINT "numbering_sequences_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");