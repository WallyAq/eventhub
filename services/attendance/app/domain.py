"""Attendance owns presence records; all other domain data comes through APIs."""
import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()


def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row,
                           options="-c statement_timeout=10000")


def remote(service, path, authorization="", body=None):
    headers = {"authorization": authorization, "x-internal-key": os.environ["INTERNAL_API_KEY"]}
    try:
        headers["content-type"] = "application/json"
        req = urllib.request.Request(os.environ[service + "_URL"] + path, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (400, 401, 403, 404, 409) else 503,
                            "Operação recusada pela dependência.")
    except (OSError, ValueError):
        raise HTTPException(503, "Dependência indisponível. Tente novamente.")


def actor(authorization):
    return remote("IDENTITY", "/users/me", authorization)["user"]


def secured(request):
    expected = os.environ.get("INTERNAL_API_KEY", "")
    actual = request.headers.get("x-internal-key", "")
    if not expected or not secrets.compare_digest(actual, expected):
        raise HTTPException(401, "Credencial interna inválida.")


def event_detail(event_id, authorization="", managed=False):
    suffix = "?managed=true" if managed else ""
    return remote("EVENTS", "/events/" + str(event_id) + suffix, authorization)["event"]


def registration_detail(registration_id):
    return remote("REGISTRATIONS", "/internal/registrations/" + str(registration_id))["registration"]


def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(46001)")
        conn.execute("""CREATE TABLE IF NOT EXISTS attendance (
          id uuid PRIMARY KEY,registration_id uuid NOT NULL UNIQUE,event_id uuid NOT NULL,
          activity_id uuid NOT NULL,user_id uuid NOT NULL,marked_by uuid NOT NULL,
          checked_in_at timestamptz NOT NULL DEFAULT now(),snapshot jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now());
          CREATE INDEX IF NOT EXISTS attendance_event_activity ON attendance(event_id,activity_id);
          """)


def serialize(row):
    if row is None:
        return None
    return {"id": str(row["id"]), "registrationId": str(row["registration_id"]),
            "eventId": str(row["event_id"]), "activityId": str(row["activity_id"]),
            "userId": str(row["user_id"]), "markedBy": str(row["marked_by"]),
            "checkedInAt": row["checked_in_at"], "createdAt": row["created_at"],
            **row["snapshot"]}


def eligible_activity(registration, event, now=None):
    if registration["eventId"] != event["id"] or event["status"] != "PUBLISHED":
        raise HTTPException(409, "O evento não está disponível para credenciamento.")
    if registration["status"] != "CONFIRMED":
        raise HTTPException(409, "Somente inscrições confirmadas podem registrar presença.")
    activity = next((item for item in event["activities"] if item["id"] == registration["activityId"]), None)
    if not activity:
        raise HTTPException(409, "Atividade não encontrada no evento.")
    starts_at = datetime.fromisoformat(activity["startsAt"].replace("Z", "+00:00"))
    ends_at = datetime.fromisoformat(activity["endsAt"].replace("Z", "+00:00"))
    now = now or datetime.now(timezone.utc)
    if now < starts_at:
        raise HTTPException(409, "A presença pode ser registrada a partir do início da atividade.")
    if now > ends_at + timedelta(hours=24):
        raise HTTPException(409, "O prazo para registrar presença terminou 24 horas após a atividade.")
    return activity


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    registrationId: UUID


class CredentialInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventId: UUID
    activityId: UUID | None = None
    credential: str = Field(min_length=100, max_length=200)


@router.post("/attendance/credentials/resolve")
def resolve(value: CredentialInput, authorization: str = Header(default="")):
    event = event_detail(value.eventId, authorization, managed=True)
    registration = remote("REGISTRATIONS", "/internal/registrations/resolve-credential", body=value.model_dump(mode="json"))["registration"]
    eligible_activity(registration, event)
    user = remote("IDENTITY", "/internal/users/" + registration["userId"])["user"]
    return {"registration": {**registration, "participant": {"name": user["name"], "email": user["email"]}}, "attendance": attendance_for(registration["id"])}


@router.post("/attendance/check-ins")
def check_in(value: CheckIn, authorization: str = Header(default="")):
    user = actor(authorization)
    registration = registration_detail(value.registrationId)
    event = event_detail(registration["eventId"], authorization, managed=True)
    # Authorization and current status precede idempotent reads; revoked memberships never bypass them.
    if event["status"] != "PUBLISHED" or registration["status"] != "CONFIRMED":
        raise HTTPException(409, "Somente inscrições confirmadas em eventos publicados podem registrar presença.")
    with db() as conn:
        previous = conn.execute("SELECT * FROM attendance WHERE registration_id=%s", (value.registrationId,)).fetchone()
        if previous:
            return {"attendance": serialize(previous)}
        activity = eligible_activity(registration, event)
        snapshot = {"eventTitle": event["title"], "activityTitle": activity["title"]}
        # Unique registration_id is the cross-request idempotency boundary.
        row = conn.execute("""INSERT INTO attendance(id,registration_id,event_id,activity_id,user_id,marked_by,snapshot)
            VALUES(%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(registration_id) DO NOTHING RETURNING *""",
                           (str(uuid4()), value.registrationId, event["id"], activity["id"], registration["userId"], user["id"], json.dumps(snapshot))).fetchone()
        if row is None:
            row = conn.execute("SELECT * FROM attendance WHERE registration_id=%s", (value.registrationId,)).fetchone()
        return {"attendance": serialize(row)}


def attendance_for(registration_id):
    with db() as conn:
        return serialize(conn.execute("SELECT * FROM attendance WHERE registration_id=%s", (registration_id,)).fetchone())


@router.get("/attendance/registrations/{id}")
def detail(id: UUID, authorization: str = Header(default="")):
    user = actor(authorization)
    registration = registration_detail(id)
    if registration["userId"] != user["id"]:
        event_detail(registration["eventId"], authorization, managed=True)
    return {"attendance": attendance_for(id)}


@router.get("/internal/attendance/registrations/{id}")
def internal_detail(id: UUID, request: Request):
    secured(request)
    return {"attendance": attendance_for(id)}


def event_attendance(event_id, limit, offset, activity_id=None, ascending=False):
    where = "event_id=%s"
    values = [event_id]
    if activity_id:
        where += " AND activity_id=%s"
        values.append(activity_id)
    with db() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        total = conn.execute("SELECT count(*) AS n FROM attendance WHERE " + where, values).fetchone()["n"]
        order = "ASC" if ascending else "DESC"
        rows = conn.execute("SELECT * FROM attendance WHERE " + where + " ORDER BY checked_in_at " + order + ",id LIMIT %s OFFSET %s", [*values, limit, offset]).fetchall()
    return [serialize(row) for row in rows], total


@router.get("/organizer/events/{id}/attendance")
def organizer_listing(id: UUID, authorization: str = Header(default=""),
                      page: int = Query(default=1, ge=1, le=100000),
                      limit: int = Query(default=25, ge=1, le=100), activityId: UUID | None = None):
    event = event_detail(id, authorization, managed=True)
    if activityId and not any(item["id"] == str(activityId) for item in event["activities"]):
        raise HTTPException(404, "Atividade não encontrada neste evento.")
    rows, total = event_attendance(id, limit, (page - 1) * limit, activityId)
    return {"attendance": rows, "total": total, "page": page, "limit": limit}


@router.get("/internal/attendance/events/{id}")
def internal_event_listing(id: UUID, request: Request,
                           limit: int = Query(default=500, ge=1, le=500),
                           offset: int = Query(default=0, ge=0, le=1000000)):
    secured(request)
    event_detail(id)
    rows, total = event_attendance(id, limit, offset, ascending=True)
    return {"attendance": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/health")
def health():
    return {"service": "attendance", "status": "ok"}


@router.get("/ready")
def ready():
    try:
        with db() as conn:
            conn.execute("SELECT 1")
        return {"service": "attendance", "status": "ready", "database": "ok"}
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service": "attendance", "status": "unavailable"})
