REVOKE ALL ON pending_signups, mfa_authenticators, mfa_recovery_codes, mfa_failures, mfa_challenges FROM facture_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_signups, mfa_authenticators, mfa_recovery_codes, mfa_failures, mfa_challenges TO facture_auth;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO facture_auth;
--> statement-breakpoint
ALTER TABLE mfa_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mfa_challenges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY auth_access ON mfa_challenges TO facture_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
-- True only inside the SECURITY DEFINER functions below, which run as the table owner after setting the flag.
-- The business roles can set the flag too, but they are not the owner, so the check still fails for them.
CREATE FUNCTION app_privileged() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.privileged', true), '') = 'on'
     AND current_user::text = (SELECT pg_get_userbyid(relowner)::text FROM pg_class WHERE oid = 'public.audit_events'::regclass)
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invoices_block_issued_change() RETURNS trigger AS $$
BEGIN
  IF app_privileged() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'ISSUED' THEN
    RAISE EXCEPTION 'Une facture émise est immuable (%)', OLD.number USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF app_privileged() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un paiement ne peut pas être supprimé, seulement annulé' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Un paiement annulé est immuable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.invoice_id, NEW.paid_on, NEW.method, NEW.amount, NEW.reference, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.invoice_id, OLD.paid_on, OLD.method, OLD.amount, OLD.reference, OLD.created_at) THEN
    RAISE EXCEPTION 'Un paiement est immuable, seule son annulation est possible' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF app_privileged() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Le journal d''audit est en ajout seul' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION close_tenant(p_tenant uuid, p_now timestamptz, p_ip text, p_user_agent text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_retain date;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  IF EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant AND closed_at IS NOT NULL) THEN RETURN; END IF;
  SELECT max(retain_until) INTO v_retain FROM invoices WHERE tenant_id = p_tenant AND state = 'ISSUED';
  UPDATE tenants SET closed_at = p_now, retain_until = coalesce(v_retain, p_now::date) WHERE id = p_tenant;
  DELETE FROM sessions WHERE tenant_id = p_tenant;
  DELETE FROM users u
    WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.tenant_id = p_tenant)
      AND NOT EXISTS (SELECT 1 FROM memberships m2 WHERE m2.user_id = u.id AND m2.tenant_id <> p_tenant);
  DELETE FROM memberships WHERE tenant_id = p_tenant;
  DELETE FROM invoices WHERE tenant_id = p_tenant AND state = 'DRAFT';
  DELETE FROM items WHERE tenant_id = p_tenant;
  DELETE FROM parties p WHERE p.tenant_id = p_tenant
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = p.id);
  UPDATE audit_events
    SET actor_name = CASE WHEN actor_name IS NOT NULL OR actor_user_id IS NOT NULL THEN 'Utilisateur supprimé' ELSE NULL END,
        actor_user_id = NULL,
        summary = CASE WHEN action IN ('auth.sign_in_failed', 'auth.password_reset_requested') THEN NULL ELSE summary END
    WHERE tenant_id = p_tenant;
  INSERT INTO audit_events (tenant_id, actor_name, action, entity_type, entity_id, summary, ip, user_agent)
    VALUES (p_tenant, 'Utilisateur supprimé', 'tenant.closed', 'tenant', p_tenant::text, 'Espace de travail fermé', p_ip, p_user_agent);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION purge_closed_tenants(p_today date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t record;
  n integer := 0;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  FOR t IN SELECT id FROM tenants WHERE closed_at IS NOT NULL AND retain_until < p_today LOOP
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION close_tenant(uuid, timestamptz, text, text), purge_closed_tenants(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION close_tenant(uuid, timestamptz, text, text), purge_closed_tenants(date) TO facture_auth;
