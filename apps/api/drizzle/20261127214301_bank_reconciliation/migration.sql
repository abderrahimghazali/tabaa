CREATE TABLE "bank_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"account_label" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid,
	"imported_by_name" text,
	"line_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(18,2) NOT NULL,
	"reference" text,
	"hash" text NOT NULL,
	"status" text DEFAULT 'UNMATCHED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_transaction_id" uuid;--> statement-breakpoint
CREATE INDEX "bank_transactions_import_idx" ON "bank_transactions" ("import_id","position");--> statement-breakpoint
CREATE INDEX "bank_transactions_hash_idx" ON "bank_transactions" ("tenant_id","hash");--> statement-breakpoint
CREATE INDEX "bank_transactions_date_idx" ON "bank_transactions" ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "payments_bank_idx" ON "payments" ("bank_transaction_id");--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_import_id_bank_imports_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_imports"("id") ON DELETE CASCADE;