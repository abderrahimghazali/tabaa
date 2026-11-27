CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"invited_by" uuid,
	"invited_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"to" text[] NOT NULL,
	"cc" text[] NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attach_ubl" boolean NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" uuid,
	"sent_by_name" text
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_uq" ON "invitations" ("tenant_id","email") WHERE "accepted_at" is null and "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_deliveries_invoice_idx" ON "invoice_deliveries" ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_deliveries_tenant_sent_idx" ON "invoice_deliveries" ("tenant_id","sent_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id");