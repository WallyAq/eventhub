"""Idempotent automatic issuance for opted-in, completed speaker activities."""
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from . import domain
from .templates import managed, template_for

router = APIRouter()


def migrate():
    with domain.db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(47003)")
        conn.execute("""CREATE TABLE IF NOT EXISTS speaker_certificates (
            id uuid PRIMARY KEY,event_id uuid NOT NULL,activity_id uuid NOT NULL,speaker_id uuid NOT NULL,
            snapshot jsonb NOT NULL,digest char(64) NOT NULL,verification_code char(64) NOT NULL UNIQUE,
            issued_at timestamptz NOT NULL,UNIQUE(event_id,activity_id,speaker_id));""")


def serialize(row):
    return {"id": str(row["id"]), **row["snapshot"], "hash": row["digest"],
        "verificationUrl": domain.verification_url(row["verification_code"]), "verificationCode": row["verification_code"]}


def validity(row, event):
    import hmac
    if not hmac.compare_digest(domain.digest(row["snapshot"]), row["digest"]):
        return "INTEGRITY_CHECK_FAILED"
    activity = next((a for a in event["activities"] if a["id"] == str(row["activity_id"])), None)
    if event["status"] != "PUBLISHED":
        return "EVENT_NOT_PUBLISHED"
    if not activity or activity.get("speakerId") != str(row["speaker_id"]):
        return "SPEAKER_NOT_LINKED"
    if not any(s.get("id") == str(row["speaker_id"]) for s in event["speakers"]):
        return "SPEAKER_NOT_LINKED"
    if domain.utc(activity["endsAt"]) > datetime.now(timezone.utc):
        return "ACTIVITY_NOT_FINISHED"
    return None


def issue_event(event_id):
    # Re-read authoritative state after locking; the candidate list is only a hint.
    with domain.db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 48))", (str(event_id),))
        event = domain.remote("EVENTS", "/events/" + str(event_id))["event"]
        if event["status"] != "PUBLISHED" or not event.get("autoSpeakerCertificates"):
            return 0
        existing = {(str(row["activity_id"]), str(row["speaker_id"])) for row in conn.execute(
            "SELECT activity_id,speaker_id FROM speaker_certificates WHERE event_id=%s", (event_id,)).fetchall()}
        template, count = None, 0
        people = {s.get("id"): s for s in event["speakers"]}
        for activity in event["activities"]:
            speaker = people.get(activity.get("speakerId"))
            if not speaker or domain.utc(activity["endsAt"]) > datetime.now(timezone.utc):
                continue
            if (activity["id"], speaker["id"]) in existing:
                continue
            if template is None:
                template = template_for(conn, event_id)
            duration = (domain.utc(activity["endsAt"]) - domain.utc(activity["startsAt"])).total_seconds() / 60
            issued = datetime.now(timezone.utc)
            snapshot = {"certificateKind": "SPEAKER", "participantName": speaker["name"], "eventId": event["id"],
                "eventTitle": event["title"], "activityId": activity["id"], "activityTitle": activity["title"],
                "speakerId": speaker["id"], "organizationName": event["organizationName"], "hours": round(duration / 60, 6),
                "durationMinutes": duration, "startsAt": activity["startsAt"], "endsAt": activity["endsAt"],
                "issuedAt": issued.isoformat(), "certificateTemplate": template}
            row = conn.execute("""INSERT INTO speaker_certificates
                (id,event_id,activity_id,speaker_id,snapshot,digest,verification_code,issued_at)
                VALUES(%s,%s,%s,%s,%s::jsonb,%s,%s,%s) ON CONFLICT(event_id,activity_id,speaker_id) DO NOTHING RETURNING id""",
                (uuid4(), event["id"], activity["id"], speaker["id"], json.dumps(snapshot), domain.digest(snapshot), secrets.token_hex(32), issued)).fetchone()
            count += int(row is not None)
    return count


def worker(stop):
    while not stop.wait(30):
        try:
            offset = 0
            while not stop.is_set():
                events = domain.remote("EVENTS", "/internal/certificate-events?offset=" + str(offset))["events"]
                for event in events:
                    if stop.is_set():
                        return
                    try:
                        issue_event(event["id"])
                    except Exception as error:
                        print(json.dumps({"service": "certificates", "worker": "speakers", "error": type(error).__name__}), flush=True)
                if len(events) < 50:
                    break
                offset += 50
        except Exception as error:
            print(json.dumps({"service": "certificates", "worker": "speakers", "error": type(error).__name__}), flush=True)


@router.get("/organizer/events/{id}/speaker-certificates")
def listing(id: UUID, authorization: str = Header(default="")):
    event = managed(id, authorization)
    with domain.db() as conn:
        rows = conn.execute("SELECT * FROM speaker_certificates WHERE event_id=%s ORDER BY issued_at DESC", (id,)).fetchall()
    return {"certificates": [{**{k: v for k, v in serialize(r).items() if k != "certificateTemplate"},
                              "valid": validity(r, event) is None} for r in rows]}


@router.post("/organizer/events/{id}/speaker-certificates")
def generate(id: UUID, authorization: str = Header(default="")):
    event = managed(id, authorization)
    if event["status"] != "PUBLISHED" or not event.get("autoSpeakerCertificates"):
        raise HTTPException(409, "Ative a emissão automática no rascunho e publique o evento.")
    return {"issued": issue_event(id)}


@router.get("/speaker-certificates/{id}/download")
def download(id: UUID, authorization: str = Header(default="")):
    from .pdf import render
    with domain.db() as conn:
        row = conn.execute("SELECT * FROM speaker_certificates WHERE id=%s", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Certificado não encontrado.")
    event = managed(row["event_id"], authorization)
    if validity(row, event):
        raise HTTPException(409, "Certificado sem validade atual.")
    return Response(render(serialize(row)), media_type="application/pdf", headers={"Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="certificado-palestrante-' + str(id) + '.pdf"'})
