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
  IF (NEW.id, NEW.tenant_id, NEW.invoice_id, NEW.paid_on, NEW.method, NEW.amount, NEW.vat_withheld, NEW.tax_withheld, NEW.reference, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.invoice_id, OLD.paid_on, OLD.method, OLD.amount, OLD.vat_withheld, OLD.tax_withheld, OLD.reference, OLD.created_at) THEN
    RAISE EXCEPTION 'Un paiement est immuable, seule son annulation est possible' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
