CREATE TABLE "invoice_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"content" bytea NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_pdfs_invoice_uq" ON "invoice_pdfs" ("invoice_id");--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ADD CONSTRAINT "invoice_pdfs_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");