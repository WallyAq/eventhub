"""Certificates own immutable issuance snapshots, never another domain's tables."""
import hashlib
import hmac
import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException, Path
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict

from .observability import headers as trace_headers, trace, bind_correlation, log_event, valid_id

router = APIRouter()


def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row, options="-c statement_timeout=10000")


def remote(service, path, authorization="", internal=True):
    headers = {"authorization": authorization, "accept": "application/json"}
    if internal:
        headers["x-internal-key"] = os.environ["INTERNAL_API_KEY"]
    headers.update(trace_headers())
    try:
        request = urllib.request.Request(os.environ[service + "_URL"] + path, headers=headers)
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (401, 403, 404, 409) else 503,
                            "Acesso recusado ou dependência indisponível.")
    except (OSError, ValueError, KeyError):
        raise HTTPException(503, "Não foi possível consultar os dados necessários ao certificado.")


def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(47001)")
        conn.execute("""CREATE TABLE IF NOT EXISTS certificates (
            id uuid PRIMARY KEY, registration_id uuid NOT NULL UNIQUE, user_id uuid NOT NULL,
            event_id uuid NOT NULL, activity_id uuid NOT NULL, verification_code varchar(64) NOT NULL UNIQUE,
            snapshot jsonb NOT NULL, digest char(64) NOT NULL, issued_at timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS certificates_user ON certificates(user_id, issued_at DESC);
        """)


def utc(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("A data precisa de fuso horário.")
    return parsed.astimezone(timezone.utc)


def eligibility(registration, event, attendance, now=None):
    """A check-in is evidence of attendance; completion requires the activity to end."""
    now = now or datetime.now(timezone.utc)
    if event.get("status") != "PUBLISHED":
        return "EVENT_NOT_PUBLISHED"
    if registration.get("status") != "CONFIRMED":
        return "REGISTRATION_NOT_CONFIRMED"
    activity = next((item for item in event.get("activities", [])
                     if item.get("id") == registration.get("activityId")), None)
    if not activity or event.get("id") != registration.get("eventId"):
        return "ACTIVITY_NOT_FOUND"
    try:
        start, end = utc(activity["startsAt"]), utc(activity["endsAt"])
        if end <= start:
            return "INVALID_ACTIVITY_DATES"
        if now < end:
            return "ACTIVITY_NOT_FINISHED"
        if not attendance:
            return "ATTENDANCE_REQUIRED"
        for field in ("registrationId", "userId", "eventId", "activityId"):
            expected = registration["id"] if field == "registrationId" else registration[field]
            if attendance.get(field) != expected:
                return "INVALID_ATTENDANCE"
        if not start <= utc(attendance["checkedInAt"]) <= end + timedelta(hours=24):
            return "INVALID_ATTENDANCE"
    except (KeyError, TypeError, ValueError):
        return "INVALID_ATTENDANCE"
    return None


def current(registration_id):
    registration = remote("REGISTRATIONS", "/internal/registrations/" + str(registration_id))["registration"]
    bind_correlation(registration.get("correlationId", str(registration_id)))
    log_event("registration.loaded", registrationId=str(registration_id))
    event = remote("EVENTS", "/events/" + registration["eventId"])["event"]
    attendance = remote("ATTENDANCE", "/internal/attendance/registrations/" + str(registration_id))["attendance"]
    return registration, event, attendance


def authorize(user, registration, authorization):
    if user["id"] != registration["userId"]:
        # managed=true always checks membership, including for internal service callers.
        remote("EVENTS", "/events/" + registration["eventId"] + "?managed=true", authorization)


def digest(snapshot):
    return hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def verification_url(code):
    return os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/") + "/api/certificates/verify/" + code


def serialize(row):
    return {"id": str(row["id"]), "registrationId": str(row["registration_id"]),
            **row["snapshot"], "hash": row["digest"], "verificationCode": row["verification_code"],
            "verificationUrl": verification_url(row["verification_code"])}


def get_certificate(id):
    with db() as conn:
        row = conn.execute("SELECT * FROM certificates WHERE id=%s", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Certificado não encontrado.")
    return row


def validity(row, registration, event, attendance):
    if not hmac.compare_digest(digest(row["snapshot"]), row["digest"]):
        return "INTEGRITY_CHECK_FAILED"
    if any(str(row[column]) != registration[field] for column, field in
           (("user_id", "userId"), ("event_id", "eventId"), ("activity_id", "activityId"))):
        return "REGISTRATION_MISMATCH"
    return eligibility(registration, event, attendance)


class Issue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    registrationId: UUID


@router.post("/certificates", status_code=201)
def issue(value: Issue, authorization: str = Header(default="")):
    user = remote("IDENTITY", "/users/me", authorization, internal=False)["user"]
    registration, event, attendance = current(value.registrationId)
    authorize(user, registration, authorization)
    reason = eligibility(registration, event, attendance)
    if reason:
        raise HTTPException(409, {"code": reason, "message": "Certificado exige inscrição confirmada, presença e atividade concluída."})
    subject = remote("IDENTITY", "/internal/users/" + registration["userId"])["user"]
    activity = next(item for item in event["activities"] if item["id"] == registration["activityId"])
    duration_minutes = round((utc(activity["endsAt"]) - utc(activity["startsAt"])).total_seconds() / 60, 6)
    issued = datetime.now(timezone.utc)
    snapshot = {"participantName": subject["name"], "eventId": event["id"], "eventTitle": event["title"],
                "activityId": activity["id"], "activityTitle": activity["title"],
                "organizationName": event.get("organizationName", ""),
                "startsAt": activity["startsAt"], "endsAt": activity["endsAt"],
                "durationMinutes": duration_minutes, "hours": round(duration_minutes / 60, 6),
                "attendanceId": attendance["id"], "checkedInAt": attendance["checkedInAt"],
                "issuedAt": issued.isoformat()}
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 47))", (str(value.registrationId),))
        # Re-check after waiting for the issuance lock; service boundaries still have a
        # small network race, so every verification/download also checks live state.
        latest = current(value.registrationId)
        reason = eligibility(*latest)
        if reason:
            raise HTTPException(409, {"code": reason, "message": "A inscrição deixou de atender aos requisitos."})
        row = conn.execute("SELECT * FROM certificates WHERE registration_id=%s", (value.registrationId,)).fetchone()
        if not row:
            from .templates import template_for
            snapshot["certificateTemplate"] = template_for(conn, event["id"])
            row = conn.execute("""INSERT INTO certificates
                (id,registration_id,user_id,event_id,activity_id,verification_code,snapshot,digest,issued_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s) RETURNING *""",
                (uuid4(), value.registrationId, registration["userId"], event["id"], activity["id"],
                 secrets.token_hex(32), json.dumps(snapshot), digest(snapshot), issued)).fetchone()
        elif validity(row, *latest):
            raise HTTPException(409, "O certificado existente não é mais válido.")
    return {"certificate": serialize(row)}


@router.get("/certificates")
def listing(authorization: str = Header(default="")):
    user = remote("IDENTITY", "/users/me", authorization, internal=False)["user"]
    with db() as conn:
        rows = conn.execute("SELECT * FROM certificates WHERE user_id=%s ORDER BY issued_at DESC", (user["id"],)).fetchall()
    # A listing is an issuance history; validity is asserted only by detail/verify/download.
    return {"certificates": [serialize(row) for row in rows], "validityRequiresVerification": True}


@router.get("/certificates/verify/{code}")
def verify(code: str = Path(pattern=r"^[a-f0-9]{64}$")):
    speaker = False
    with db() as conn:
        row = conn.execute("SELECT * FROM certificates WHERE verification_code=%s", (code,)).fetchone()
        if not row:
            row = conn.execute("SELECT * FROM speaker_certificates WHERE verification_code=%s", (code,)).fetchone()
            speaker = row is not None
    if not row:
        raise HTTPException(404, "Certificado não encontrado.")
    if speaker:
        from .speakers import validity as speaker_validity
        reason = speaker_validity(row, remote("EVENTS", "/events/" + str(row["event_id"]))["event"])
    else:
        reason = validity(row, *current(row["registration_id"]))
    snapshot = row["snapshot"]
    # Deliberately excludes user/registration/attendance IDs, CPF, phone and e-mail.
    return {"valid": reason is None, "reason": reason, "certificate": {
        "id": str(row["id"]), "participantName": snapshot["participantName"],
        "eventTitle": snapshot["eventTitle"], "activityTitle": snapshot["activityTitle"],
        "organizationName": snapshot["organizationName"], "hours": snapshot["hours"],
        "issuedAt": snapshot["issuedAt"], "hash": row["digest"]},
        "checkedAt": datetime.now(timezone.utc)}


def authorized_certificate(id, authorization):
    user = remote("IDENTITY", "/users/me", authorization, internal=False)["user"]
    row = get_certificate(id)
    registration, event, attendance = current(row["registration_id"])
    authorize(user, registration, authorization)
    reason = validity(row, registration, event, attendance)
    if reason:
        raise HTTPException(409, {"code": reason, "message": "Certificado sem validade atual."})
    return row


@router.get("/certificates/{id}")
def detail(id: UUID, authorization: str = Header(default="")):
    return {"certificate": serialize(authorized_certificate(id, authorization)), "valid": True}


@router.get("/certificates/{id}/download")
def download(id: UUID, authorization: str = Header(default="")):
    from .pdf import render
    row = authorized_certificate(id, authorization)
    return Response(render(serialize(row)), media_type="application/pdf", headers={
        "Content-Disposition": 'attachment; filename="certificado-' + str(row["id"]) + '.pdf"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
