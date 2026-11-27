ALTER TABLE "companies" ADD COLUMN "vat_basis" text DEFAULT 'CASH' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "vat_withheld" numeric(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tax_withheld" numeric(18,2) DEFAULT '0' NOT NULL;