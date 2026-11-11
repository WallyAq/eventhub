-- A row lock alone does not invalidate an older REPEATABLE READ snapshot.
-- Updating the inventory revision makes concurrent writers conflict at every
-- PostgreSQL isolation level (40001 at RR/serializable; serialized reads at RC).
ALTER TABLE inventories ADD COLUMN revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION enforce_registration_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inventory inventories%ROWTYPE; occupied bigint;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.user_id<>OLD.user_id
      OR NEW.price_cents<>OLD.price_cents OR NEW.request_key<>OLD.request_key) THEN
    RAISE EXCEPTION 'registration identity, price and request key are immutable' USING ERRCODE='23514';
  END IF;
  UPDATE inventories SET revision=revision+1 WHERE activity_id=NEW.activity_id RETURNING * INTO inventory;
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
