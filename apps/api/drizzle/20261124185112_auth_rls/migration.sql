DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'facture_auth') THEN
    CREATE ROLE facture_auth LOGIN PASSWORD 'facture_auth';
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO facture_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, email_tokens TO facture_auth;
--> statement-breakpoint
GRANT SELECT, INSERT ON tenants, memberships TO facture_auth;
--> statement-breakpoint
REVOKE ALL ON users, sessions, email_tokens FROM facture_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON tenants, memberships FROM facture_app;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants FOR SELECT TO facture_app USING (id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships FOR SELECT TO facture_app USING (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE POLICY auth_access ON tenants TO facture_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_access ON memberships TO facture_auth USING (true) WITH CHECK (true);
