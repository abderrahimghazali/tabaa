ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON audit_events FROM facture_app, facture_auth;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_events TO facture_app, facture_auth;
--> statement-breakpoint
CREATE POLICY tenant_read ON audit_events FOR SELECT TO facture_app USING (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_write ON audit_events FOR INSERT TO facture_app WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE POLICY auth_read ON audit_events FOR SELECT TO facture_auth USING (true);
--> statement-breakpoint
CREATE POLICY auth_write ON audit_events FOR INSERT TO facture_auth WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en ajout seul' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY auth_access ON sessions TO facture_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
REVOKE UPDATE, DELETE ON payments FROM facture_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON payments TO facture_app;
--> statement-breakpoint
GRANT UPDATE (voided_at, voided_by, updated_at) ON payments TO facture_app;
--> statement-breakpoint
CREATE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
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
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();
