CREATE TABLE "purchase_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(18,2) NOT NULL,
	"vat_withheld" numeric(18,2) NOT NULL,
	"tax_withheld" numeric(18,2) NOT NULL,
	"reference" text,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"number" text NOT NULL,
	"number_key" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"vat_lines" jsonb NOT NULL,
	"vat_deductible" boolean NOT NULL,
	"notes" text,
	"total_net" numeric(18,2) NOT NULL,
	"total_vat" numeric(18,2) NOT NULL,
	"total_gross" numeric(18,2) NOT NULL,
	"state" text NOT NULL,
	"rejection_reason" text,
	"disputed" boolean DEFAULT false NOT NULL,
	"disputed_at" timestamp with time zone,
	"dispute_cleared_at" timestamp with time zone,
	"supplier_snapshot" jsonb,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_by_name" text,
	"created_by" uuid,
	"created_by_name" text,
	"retain_until" date
);
--> statement-breakpoint
CREATE INDEX "purchase_payments_purchase_idx" ON "purchase_payments" ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_payments_paid_idx" ON "purchase_payments" ("tenant_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_number_uq" ON "purchases" ("tenant_id","supplier_id","number_key");--> statement-breakpoint
CREATE INDEX "purchases_issue_idx" ON "purchases" ("tenant_id","issue_date");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" ("supplier_id");--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_purchase_id_purchases_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_parties_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "parties"("id");