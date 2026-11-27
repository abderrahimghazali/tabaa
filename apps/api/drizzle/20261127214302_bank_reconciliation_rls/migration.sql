ALTER TABLE bank_imports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bank_imports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bank_imports USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_imports TO facture_app;
--> statement-breakpoint
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bank_transactions USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_transactions TO facture_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION close_tenant(p_tenant uuid, p_now timestamptz, p_ip text, p_user_agent text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_retain date;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  IF EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant AND closed_at IS NOT NULL) THEN RETURN; END IF;
  SELECT max(retain_until) INTO v_retain FROM invoices WHERE tenant_id = p_tenant AND state = 'ISSUED';
  UPDATE tenants SET closed_at = p_now, retain_until = coalesce(v_retain, p_now::date) WHERE id = p_tenant;
  DELETE FROM sessions WHERE tenant_id = p_tenant;
  DELETE FROM mfa_challenges WHERE tenant_id = p_tenant;
  DELETE FROM invitations WHERE tenant_id = p_tenant;
  DELETE FROM bank_transactions WHERE tenant_id = p_tenant;
  DELETE FROM bank_imports WHERE tenant_id = p_tenant;
  DELETE FROM users u
    WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.tenant_id = p_tenant)
      AND NOT EXISTS (SELECT 1 FROM memberships m2 WHERE m2.user_id = u.id AND m2.tenant_id <> p_tenant);
  DELETE FROM memberships WHERE tenant_id = p_tenant;
  DELETE FROM invoices WHERE tenant_id = p_tenant AND state = 'DRAFT';
  DELETE FROM items WHERE tenant_id = p_tenant;
  DELETE FROM parties p WHERE p.tenant_id = p_tenant
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = p.id);
  UPDATE invoice_deliveries SET sent_by = NULL, sent_by_name = CASE WHEN sent_by_name IS NOT NULL THEN 'Utilisateur supprimé' ELSE NULL END
    WHERE tenant_id = p_tenant;
  UPDATE audit_events
    SET actor_name = CASE WHEN actor_name IS NOT NULL OR actor_user_id IS NOT NULL THEN 'Utilisateur supprimé' ELSE NULL END,
        actor_user_id = NULL,
        summary = CASE WHEN action IN ('auth.sign_in_failed', 'auth.password_reset_requested') OR action LIKE 'team.%' THEN NULL ELSE summary END
    WHERE tenant_id = p_tenant;
  INSERT INTO audit_events (tenant_id, actor_name, action, entity_type, entity_id, summary, ip, user_agent)
    VALUES (p_tenant, 'Utilisateur supprimé', 'tenant.closed', 'tenant', p_tenant::text, 'Espace de travail fermé', p_ip, p_user_agent);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION purge_closed_tenants(p_today date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t record;
  n integer := 0;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  FOR t IN SELECT id FROM tenants WHERE closed_at IS NOT NULL AND retain_until < p_today LOOP
    DELETE FROM bank_transactions WHERE tenant_id = t.id;
    DELETE FROM bank_imports WHERE tenant_id = t.id;
    DELETE FROM invoice_deliveries WHERE tenant_id = t.id;
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
