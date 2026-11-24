CREATE TABLE "mfa_authenticators" (
	"user_id" uuid PRIMARY KEY,
	"secret" text NOT NULL,
	"confirmed" boolean NOT NULL,
	"pending_secret" text,
	"last_used_step" integer
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_failures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mfa_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"failed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"user_id" uuid,
	"code_hash" text,
	CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY("user_id","code_hash")
);
--> statement-breakpoint
CREATE TABLE "pending_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"company_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retain_until" date;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "retain_until" date;--> statement-breakpoint
CREATE INDEX "mfa_failures_user_idx" ON "mfa_failures" ("user_id","failed_at");--> statement-breakpoint
ALTER TABLE "mfa_authenticators" ADD CONSTRAINT "mfa_authenticators_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mfa_failures" ADD CONSTRAINT "mfa_failures_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;