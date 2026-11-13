ALTER TABLE inventories ADD COLUMN closed_at timestamptz;

CREATE FUNCTION require_open_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE closed timestamptz;
BEGIN
  UPDATE inventories SET revision=revision+1 WHERE activity_id=NEW.activity_id RETURNING closed_at INTO closed;
  IF closed IS NOT NULL THEN
    RAISE EXCEPTION 'activity is closed for registrations' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registration_open_inventory BEFORE INSERT ON registrations
  FOR EACH ROW EXECUTE FUNCTION require_open_inventory();

CREATE FUNCTION preserve_inventory_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'closed inventory cannot be reopened' USING ERRCODE='23514';
  END IF;
  IF NEW.closed_at IS NOT NULL AND EXISTS(SELECT 1 FROM registrations WHERE activity_id=NEW.activity_id) THEN
    RAISE EXCEPTION 'inventory with registration history cannot be closed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_closure_guard BEFORE UPDATE ON inventories
  FOR EACH ROW EXECUTE FUNCTION preserve_inventory_closure();
