ALTER TABLE invoice_pdfs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_pdfs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoice_pdfs USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
REVOKE ALL ON invoice_pdfs FROM facture_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON invoice_pdfs TO facture_app;
--> statement-breakpoint
CREATE FUNCTION invoice_pdfs_append_only() RETURNS trigger AS $$
BEGIN
  IF app_privileged() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Le PDF d''une facture émise est immuable' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoice_pdfs_immutable BEFORE UPDATE OR DELETE ON invoice_pdfs FOR EACH ROW EXECUTE FUNCTION invoice_pdfs_append_only();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION purge_closed_tenants(p_today date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t record;
  n integer := 0;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  FOR t IN SELECT id FROM tenants WHERE closed_at IS NOT NULL AND retain_until < p_today LOOP
    DELETE FROM invoice_pdfs WHERE tenant_id = t.id;
    DELETE FROM payments WHERE tenant_id = t.id;
    DELETE FROM invoices WHERE tenant_id = t.id;
    DELETE FROM numbering_sequences WHERE tenant_id = t.id;
    DELETE FROM parties WHERE tenant_id = t.id;
    DELETE FROM items WHERE tenant_id = t.id;
    DELETE FROM companies WHERE tenant_id = t.id;
    DELETE FROM audit_events WHERE tenant_id = t.id;
    DELETE FROM tenants WHERE id = t.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
