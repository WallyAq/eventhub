"""Explicit administrative plan only; never guesses a responsible organizer."""
import json
import sys
from uuid import UUID
from .domain import db
from .access_preflight import identity


def apply_plan(plan):
    if not isinstance(plan, list) or not plan:
        raise ValueError("An explicit non-empty resolution plan is required")
    seen = set()
    for item in plan:
        if not isinstance(item, dict) or set(item) != {"eventId", "organizationId", "ownerUserId", "reason"}:
            raise ValueError("Invalid resolution fields")
        for key in ("eventId", "organizationId", "ownerUserId"):
            if str(UUID(item[key])) != item[key]:
                raise ValueError("Use canonical UUIDs")
        if item["eventId"] in seen or not isinstance(item["reason"], str) or len(item["reason"].strip()) < 10:
            raise ValueError("Duplicate event or missing review reason")
        seen.add(item["eventId"])
        user = identity(item["ownerUserId"])
        if user.get("role") != "ORGANIZER" or user.get("organizationId") != item["organizationId"]:
            raise ValueError("Responsible must be an organizer of the specified institution")
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(42001)")
        conn.execute("LOCK TABLE events IN SHARE ROW EXCLUSIVE MODE")
        applied = conn.execute("SELECT to_regclass('event_schema_migrations') AS name").fetchone()["name"]
        if applied and conn.execute("SELECT 1 FROM event_schema_migrations WHERE name='001_event_responsibility.sql'").fetchone():
            raise ValueError("Legacy ownership classification is only available before the responsibility migration")
        conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_user_id uuid")
        conn.execute("""CREATE TABLE IF NOT EXISTS event_ownership_resolutions (
            event_id uuid PRIMARY KEY REFERENCES events(id),organization_id uuid NOT NULL,owner_user_id uuid NOT NULL,
            reason text NOT NULL,resolved_at timestamptz NOT NULL DEFAULT now())""")
        for item in plan:
            row = conn.execute("SELECT organization_id,owner_user_id,payload,status FROM events WHERE id=%s FOR UPDATE", (item["eventId"],)).fetchone()
            if not row or str(row["organization_id"]) != item["organizationId"] or row["owner_user_id"] is not None:
                raise ValueError("Plan does not match an existing event without a responsible: " + item["eventId"])
            payload = row["payload"]
            if payload.get("id") != item["eventId"] or payload.get("organizationId") != item["organizationId"] or payload.get("status") != row["status"] or payload.get("ownerUserId"):
                raise ValueError("Resolve event structural conflicts explicitly before assigning responsibility")
            payload["ownerUserId"] = item["ownerUserId"]
            conn.execute("INSERT INTO event_ownership_resolutions(event_id,organization_id,owner_user_id,reason) VALUES(%s,%s,%s,%s)",
                (item["eventId"],item["organizationId"],item["ownerUserId"],item["reason"].strip()))
            conn.execute("UPDATE events SET owner_user_id=%s,payload=%s::jsonb WHERE id=%s", (item["ownerUserId"],json.dumps(payload),item["eventId"]))
    return {"classified": len(plan), "dataRemoved": False}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("Usage: python -m app.resolve_legacy_responsibility /path/reviewed-plan.json")
    with open(sys.argv[1], encoding="utf-8") as source:
        print(json.dumps(apply_plan(json.load(source))))
