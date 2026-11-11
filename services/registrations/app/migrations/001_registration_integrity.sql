-- Preflight aborts the transaction rather than changing historical registrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM inventories i JOIN registrations r USING(activity_id)
      WHERE r.status IN ('CONFIRMED','PENDING_PAYMENT') GROUP BY i.activity_id,i.capacity
      HAVING count(*) > i.capacity) THEN
    RAISE EXCEPTION 'registration preflight: inventory over capacity; audit and resolve before deployment';
  END IF;
  IF EXISTS (SELECT 1 FROM registrations r JOIN inventories i USING(activity_id)
      WHERE r.snapshot->>'eventId' IS DISTINCT FROM i.event_id::text
         OR r.snapshot->'activity'->>'id' IS DISTINCT FROM r.activity_id::text
         OR (r.status='PENDING_PAYMENT' AND (r.price_cents<=0 OR r.expires_at IS NULL))
         OR (r.status='CONFIRMED' AND r.price_cents>0 AND NOT EXISTS
             (SELECT 1 FROM payment_notification_receipts p WHERE p.registration_id=r.id AND p.result='APPROVED'))) THEN
    RAISE EXCEPTION 'registration preflight: invalid snapshot/reservation or paid confirmation without approved receipt';
  END IF;
END $$;

ALTER TABLE registrations ADD CONSTRAINT registration_pending_payment_valid
  CHECK(status<>'PENDING_PAYMENT' OR (price_cents>0 AND expires_at IS NOT NULL));
ALTER TABLE payment_notification_receipts ADD CONSTRAINT payment_receipt_result
  CHECK(result IN ('APPROVED','DECLINED','EXPIRED'));
CREATE TABLE payment_decisions (
  registration_id uuid PRIMARY KEY REFERENCES registrations(id),
  outcome text NOT NULL CHECK(outcome IN ('APPROVED','DECLINED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_inventory_status ON registrations(activity_id,status);
CREATE INDEX registration_unpublished_outbox ON outbox(id) WHERE published_at IS NULL;

CREATE FUNCTION enforce_registration_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inventory inventories%ROWTYPE; occupied bigint;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.user_id<>OLD.user_id
      OR NEW.price_cents<>OLD.price_cents OR NEW.request_key<>OLD.request_key) THEN
    RAISE EXCEPTION 'registration identity, price and request key are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO inventory FROM inventories WHERE activity_id=NEW.activity_id FOR UPDATE;
  IF NEW.snapshot->>'eventId' IS DISTINCT FROM inventory.event_id::text
      OR NEW.snapshot->'activity'->>'id' IS DISTINCT FROM NEW.activity_id::text THEN
    RAISE EXCEPTION 'registration snapshot does not match inventory' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO occupied FROM registrations WHERE activity_id=NEW.activity_id
    AND status IN ('CONFIRMED','PENDING_PAYMENT');
  IF occupied>inventory.capacity THEN
    RAISE EXCEPTION 'activity capacity exceeded' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status<>OLD.status AND NOT (
      (OLD.status='WAITLISTED' AND NEW.status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED')) OR
      (OLD.status='PENDING_PAYMENT' AND NEW.status IN ('CONFIRMED','CANCELLED','EXPIRED')) OR
      (OLD.status='CONFIRMED' AND NEW.status='CANCELLED')) THEN
    RAISE EXCEPTION 'invalid registration state transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registration_inventory_guard AFTER INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION enforce_registration_inventory();

CREATE FUNCTION enforce_inventory_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.activity_id<>OLD.activity_id OR NEW.event_id<>OLD.event_id THEN
    RAISE EXCEPTION 'inventory identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.capacity<(SELECT count(*) FROM registrations WHERE activity_id=NEW.activity_id
      AND status IN ('CONFIRMED','PENDING_PAYMENT')) THEN
    RAISE EXCEPTION 'capacity below occupied seats' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_capacity_guard BEFORE UPDATE ON inventories
  FOR EACH ROW EXECUTE FUNCTION enforce_inventory_capacity();

CREATE FUNCTION enforce_paid_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration registrations%ROWTYPE; target uuid;
BEGIN
  IF TG_TABLE_NAME='registrations' THEN target=NEW.id;
  ELSE target=OLD.registration_id; END IF;
  SELECT * INTO registration FROM registrations WHERE id=target;
  IF registration.status='CONFIRMED' AND registration.price_cents>0 AND NOT EXISTS
      (SELECT 1 FROM payment_notification_receipts WHERE registration_id=target AND result='APPROVED') THEN
    RAISE EXCEPTION 'paid registration requires approved payment receipt' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER paid_confirmation_guard AFTER INSERT OR UPDATE ON registrations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_paid_confirmation();
CREATE CONSTRAINT TRIGGER approved_receipt_guard AFTER DELETE OR UPDATE ON payment_notification_receipts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_paid_confirmation();
