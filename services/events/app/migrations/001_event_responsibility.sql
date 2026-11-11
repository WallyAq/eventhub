ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_user_id uuid;
DO $$
DECLARE conflicts jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(x)) INTO conflicts FROM (
    SELECT id,organization_id,owner_user_id FROM events
    WHERE owner_user_id IS NULL OR payload->>'ownerUserId' IS DISTINCT FROM owner_user_id::text
      OR payload->>'organizationId' IS DISTINCT FROM organization_id::text
      OR payload->>'id' IS DISTINCT FROM id::text OR payload->>'status' IS DISTINCT FROM status
    ORDER BY id LIMIT 100
  ) x;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Event responsibility preflight failed; no data changed'
      USING DETAIL=conflicts::text,
        HINT='Run python -m app.access_preflight; provide a reviewed explicit ownership plan before retrying.';
  END IF;
END $$;
ALTER TABLE events ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT event_payload_identity CHECK(
  payload->>'id' IS NOT DISTINCT FROM id::text
  AND payload->>'organizationId' IS NOT DISTINCT FROM organization_id::text
  AND payload->>'ownerUserId' IS NOT DISTINCT FROM owner_user_id::text
  AND payload->>'status' IS NOT DISTINCT FROM status);
CREATE INDEX events_responsible_institution ON events(owner_user_id,organization_id);
CREATE FUNCTION preserve_event_responsibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_user_id<>OLD.owner_user_id OR NEW.organization_id<>OLD.organization_id THEN
    RAISE EXCEPTION 'Event institution and responsibility are immutable through updates'
      USING ERRCODE='23514', CONSTRAINT='event_responsibility_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_responsibility_immutable BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION preserve_event_responsibility();
