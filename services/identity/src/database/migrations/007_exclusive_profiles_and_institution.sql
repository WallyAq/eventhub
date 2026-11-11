-- Refuse to reinterpret legacy PARTICIPANT accounts with administrative links.
-- Operators must review the read-only preflight and explicitly classify them.
DO $$
DECLARE conflicts jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(x)) INTO conflicts FROM (
    SELECT u.id AS user_id, u.role, count(m.user_id) AS institution_count,
      array_agg(m.organization_id) FILTER (WHERE m.user_id IS NOT NULL) AS institution_ids
    FROM users u LEFT JOIN organization_members m ON m.user_id=u.id
    GROUP BY u.id,u.role
    HAVING count(m.user_id)>1 OR (u.role='PARTICIPANT' AND count(m.user_id)>0)
      OR (u.role='ORGANIZER' AND count(m.user_id)<>1)
      OR u.role NOT IN ('PARTICIPANT','ORGANIZER')
    ORDER BY u.id LIMIT 100
  ) x;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Profile/institution preflight failed; no data changed'
      USING DETAIL=conflicts::text,
      HINT='Run node src/database/access-preflight.js; review explicit resolutions before retrying migration 007.';
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('PARTICIPANT','ORGANIZER'));
-- One institution per organizer; intentionally no unique organization_id index.
ALTER TABLE organization_members ADD CONSTRAINT organizer_one_institution UNIQUE(user_id);

CREATE FUNCTION enforce_account_institution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_id uuid; account_role text; memberships integer;
BEGIN
  IF TG_TABLE_NAME='users' THEN account_id:=COALESCE(NEW.id,OLD.id);
  ELSE account_id:=COALESCE(NEW.user_id,OLD.user_id); END IF;
  SELECT role INTO account_role FROM users WHERE id=account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO memberships FROM organization_members WHERE user_id=account_id;
  IF (account_role='PARTICIPANT' AND memberships<>0)
    OR (account_role='ORGANIZER' AND memberships<>1) THEN
    RAISE EXCEPTION 'Account profile and institutional membership are incompatible'
      USING ERRCODE='23514', CONSTRAINT='account_institution_consistency';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER account_institution_users
  AFTER INSERT OR UPDATE ON users DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_account_institution();
CREATE CONSTRAINT TRIGGER account_institution_members
  AFTER INSERT OR UPDATE OR DELETE ON organization_members DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_account_institution();

CREATE FUNCTION preserve_institution_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id<>OLD.user_id OR NEW.organization_id<>OLD.organization_id THEN
    RAISE EXCEPTION 'Institutional links cannot be transferred by updating identifiers'
      USING ERRCODE='23514', CONSTRAINT='institution_link_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER institution_link_immutable BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION preserve_institution_link();
