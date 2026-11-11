"""Read-only structural and cross-service responsibility audit; emits identifiers only."""
import json
import os
import urllib.request
from .domain import db


def identity(user_id):
    request = urllib.request.Request(os.environ["IDENTITY_URL"] + "/internal/users/" + str(user_id),
        headers={"x-internal-key": os.environ["INTERNAL_API_KEY"]})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)["user"]


def preflight():
    with db() as conn:
        has_owner = conn.execute("SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='owner_user_id'").fetchone()
        rows = conn.execute("SELECT id,organization_id,status,payload" + (",owner_user_id" if has_owner else "") + " FROM events ORDER BY id").fetchall()
    conflicts, cache = [], {}
    for row in rows:
        reasons = []
        payload = row["payload"]
        owner = str(row.get("owner_user_id") or "")
        if not owner:
            reasons.append("missing_responsible")
        if payload.get("organizationId") != str(row["organization_id"]) or payload.get("id") != str(row["id"]) or payload.get("status") != row["status"]:
            reasons.append("payload_identity_mismatch")
        if owner and payload.get("ownerUserId") != owner:
            reasons.append("payload_responsible_mismatch")
        if owner:
            try:
                if owner not in cache:
                    cache[owner] = identity(owner)
                user = cache[owner]
                if user.get("role") != "ORGANIZER" or user.get("organizationId") != str(row["organization_id"]):
                    reasons.append("responsible_institution_mismatch")
            except Exception:
                reasons.append("responsible_identity_unverified")
        if reasons:
            conflicts.append({"eventId": str(row["id"]), "organizationId": str(row["organization_id"]), "ownerUserId": owner or None, "reasons": reasons})
    return {"service": "events", "compatible": not conflicts, "eventCount": len(rows), "conflicts": conflicts}


if __name__ == "__main__":
    print(json.dumps(preflight(), indent=2))
