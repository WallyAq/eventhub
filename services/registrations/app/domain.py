import json
import os
import threading
import time
import urllib.request
import urllib.error
import csv
import io
import secrets
import hashlib
import hmac
import re
from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Literal

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .observability import headers as trace_headers, trace, bind_correlation, log_event, valid_id

router = APIRouter()

def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row, options="-c statement_timeout=10000")

def remote(service, path, authorization="", body=None):
    headers = {"authorization": authorization, "x-internal-key": os.environ["INTERNAL_API_KEY"], "content-type": "application/json"}
    headers.update(trace_headers())
    try:
        req = urllib.request.Request(os.environ[service + "_URL"] + path, headers=headers, data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req, timeout=5) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (400,401,403,404,409) else 503, "Operação recusada pela dependência.")
    except (OSError, ValueError): raise HTTPException(503, "Dependência indisponível. Tente novamente.")

def actor(token): return remote("IDENTITY", "/users/me", token)["user"]

def secured(request):
    expected = os.environ.get("INTERNAL_API_KEY", "")
    if not expected or not secrets.compare_digest(request.headers.get("x-internal-key", ""), expected):
        raise HTTPException(401, "Credencial interna inválida.")

def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(43001)")
        conn.execute("""CREATE TABLE IF NOT EXISTS inventories(activity_id uuid PRIMARY KEY,event_id uuid NOT NULL,capacity int NOT NULL CHECK(capacity>0));
        CREATE TABLE IF NOT EXISTS registrations(id uuid PRIMARY KEY, activity_id uuid NOT NULL REFERENCES inventories(activity_id), user_id uuid NOT NULL,
          request_key varchar(100) NOT NULL, status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED','WAITLISTED')),
          price_cents int NOT NULL CHECK(price_cents>=0), expires_at timestamptz, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,request_key));
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_registration ON registrations(user_id,activity_id) WHERE status IN ('PENDING_PAYMENT','CONFIRMED','WAITLISTED');
        CREATE TABLE IF NOT EXISTS outbox(id uuid PRIMARY KEY, payload jsonb NOT NULL, published_at timestamptz);
        CREATE TABLE IF NOT EXISTS registration_actions(id uuid PRIMARY KEY,registration_id uuid NOT NULL REFERENCES registrations(id),
          actor_id uuid NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS payment_notification_receipts(registration_id uuid PRIMARY KEY REFERENCES registrations(id),result text NOT NULL);
        CREATE TABLE IF NOT EXISTS event_announcement_receipts(id uuid PRIMARY KEY,event_id uuid NOT NULL);
        """)

def event_message(conn, row, kind, details=None):
    message = {"id":str(uuid4()), "type":kind, "version":1, "registrationId":str(row["id"]),"userId":str(row["user_id"]), "correlationId": row["snapshot"].get("correlationId", str(row["id"])), "requestId": trace()["requestId"]}
    if details:
        message.update(details)
    log_event("outbox.enqueued", registrationId=str(row["id"]), messageId=message["id"], type=kind, correlationId=message["correlationId"])
    conn.execute("INSERT INTO outbox(id,payload) VALUES(%s,%s::jsonb)", (message["id"],json.dumps(message)))

def serialize(row):
    result = {"id":str(row["id"]),"activityId":str(row["activity_id"]),"userId":str(row["user_id"]),"status":row["status"],"priceCents":row["price_cents"],"expiresAt":row["expires_at"],"createdAt":row["created_at"],**row["snapshot"]}
    result["correlationId"] = row["snapshot"].get("correlationId", str(row["id"]))
    if os.environ.get("INTERNAL_API_KEY"):
        result["checkInCredential"] = credential(row)
    return result


def credential(row):
    message = "eventhub:check-in:v1:" + str(row["id"])
    bound = message + ":" + str(row["user_id"]) + ":" + str(row["activity_id"])
    signature = hmac.new(os.environ["INTERNAL_API_KEY"].encode(), bound.encode(), hashlib.sha256).hexdigest()
    return message + ":" + signature


def selected_price(activity, option_id, now=None):
    rates = activity.get("priceOptions", [])
    if not rates:
        if option_id is not None:
            raise HTTPException(409, "Este preço não pertence à atividade.")
        return activity["priceCents"], None
    rate = next((rate for rate in rates if rate["id"] == str(option_id)), None)
    if not rate:
        raise HTTPException(409, "Selecione um lote e categoria válidos.")
    now = now or datetime.now(timezone.utc)
    start, end = [datetime.fromisoformat(rate[key].replace("Z", "+00:00")) for key in ("startsAt", "endsAt")]
    if not start <= now < end:
        raise HTTPException(409, "Este lote não está disponível neste momento. Atualize a seleção.")
    return rate["priceCents"], rate

def lock(conn, activity):
    return conn.execute("SELECT * FROM inventories WHERE activity_id=%s FOR UPDATE", (activity,)).fetchone()

def maintain(conn, inventory, event=None):
    """Every mutation takes the inventory row lock before any registration lock."""
    expired = conn.execute("UPDATE registrations SET status='EXPIRED' WHERE activity_id=%s AND status='PENDING_PAYMENT' AND expires_at<=clock_timestamp() RETURNING *", (inventory["activity_id"],)).fetchall()
    for row in expired: event_message(conn,row,"registration.expired")
    if event and event["status"] == "CANCELLED":
        rows = conn.execute("UPDATE registrations SET status='CANCELLED',snapshot=snapshot || '{\"cancellationReason\":\"EVENT_CANCELLED\"}'::jsonb WHERE activity_id=%s AND status IN ('PENDING_PAYMENT','CONFIRMED','WAITLISTED') RETURNING *", (inventory["activity_id"],)).fetchall()
        for row in rows: event_message(conn,row,"registration.cancelled")
        return
    if not event or datetime.fromisoformat(event["startsAt"].replace("Z","+00:00")) <= datetime.now(timezone.utc): return
    count = conn.execute("SELECT count(*) AS n FROM registrations WHERE activity_id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT')", (inventory["activity_id"],)).fetchone()["n"]
    waiting = conn.execute("SELECT * FROM registrations WHERE activity_id=%s AND status='WAITLISTED' ORDER BY created_at,id LIMIT %s FOR UPDATE", (inventory["activity_id"],max(0,inventory["capacity"]-count))).fetchall()
    for row in waiting:
        updated = conn.execute("UPDATE registrations SET status=%s,expires_at=CASE WHEN price_cents>0 THEN clock_timestamp()+(%s * interval '1 second') END WHERE id=%s RETURNING *", ("PENDING_PAYMENT" if row["price_cents"] else "CONFIRMED",int(os.environ.get("RESERVATION_TTL_SECONDS","900")),row["id"])).fetchone()
        event_message(conn,updated,"registration.reserved" if row["price_cents"] else "registration.confirmed")

@router.get("/availability/events/{id}")
def availability(id: UUID):
    """Public aggregate only; reads never expire reservations or promote the queue."""
    event = remote("EVENTS", "/events/" + str(id))["event"]
    # The service credential can read private Event records, but this endpoint cannot.
    if event["status"] != "PUBLISHED":
        raise HTTPException(404, "Evento não encontrado.")
    activities = event["activities"]
    try:
        with db() as conn:
            rows = conn.execute("""SELECT i.activity_id, i.capacity,
                count(r.id) FILTER (WHERE r.status='CONFIRMED' OR
                    (r.status='PENDING_PAYMENT' AND r.expires_at>statement_timestamp())) AS occupied,
                count(r.id) FILTER (WHERE r.status='WAITLISTED') AS waiting,
                statement_timestamp() AS checked_at
                FROM inventories i LEFT JOIN registrations r ON r.activity_id=i.activity_id
                WHERE i.event_id=%s AND i.activity_id=ANY(%s::uuid[])
                GROUP BY i.activity_id, i.capacity""",
                (id, [item["id"] for item in activities])).fetchall()
    except psycopg.Error:
        raise HTTPException(503, "Disponibilidade de vagas indisponível. Tente novamente.")
    checked_at = rows[0]["checked_at"] if rows else datetime.now(timezone.utc)
    accepting = datetime.fromisoformat(event["startsAt"].replace("Z", "+00:00")) > checked_at
    by_id = {str(row["activity_id"]): row for row in rows}
    result = []
    for activity in activities:
        inventory = by_id.get(activity["id"])
        capacity = inventory["capacity"] if inventory else activity["capacity"]
        # Vacancies released by expiry belong to existing FIFO waiters before newcomers.
        allocated = inventory["occupied"] + inventory["waiting"] if inventory else 0
        result.append({"activityId": activity["id"], "capacity": capacity,
                       "availableSeats": max(0, capacity - allocated) if accepting else 0})
    return {"eventId": event["id"], "checkedAt": checked_at, "activities": result}

class Reservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventId: UUID
    activityId: UUID
    priceOptionId: UUID | None = None

@router.post("/registrations", status_code=201)
def reserve(value: Reservation, authorization: str = Header(default=""), idempotency_key: str = Header(default="")):
    user = actor(authorization)
    if not 8 <= len(idempotency_key) <= 100: raise HTTPException(400,"Informe Idempotency-Key de 8 a 100 caracteres.")
    event = remote("EVENTS", "/events/" + str(value.eventId))["event"]
    if event["status"] != "PUBLISHED" or datetime.fromisoformat(event["startsAt"].replace("Z","+00:00")) <= datetime.now(timezone.utc): raise HTTPException(409,"Inscrições encerradas.")
    activity = next((item for item in event["activities"] if item["id"] == str(value.activityId)),None)
    if not activity: raise HTTPException(404,"Atividade não encontrada.")
    with db() as conn:
        # Serializes each user's idempotency keys even across different activities.
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",(user["id"],))
        previous = conn.execute("SELECT * FROM registrations WHERE user_id=%s AND request_key=%s", (user["id"],idempotency_key)).fetchone()
        if previous:
            if str(previous["activity_id"]) != str(value.activityId): raise HTTPException(409,"Chave já utilizada para outra atividade.")
            if previous["snapshot"].get("priceOption", {}).get("id") != (str(value.priceOptionId) if value.priceOptionId else None):
                raise HTTPException(409, "Chave já utilizada para outro lote/categoria.")
            return {"registration":serialize(previous)}
        conn.execute("INSERT INTO inventories(activity_id,event_id,capacity) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING",(value.activityId,value.eventId,activity["capacity"]))
        inventory = lock(conn,value.activityId)
        price, rate = selected_price(activity, value.priceOptionId)
        maintain(conn,inventory,event)
        existing = conn.execute("SELECT * FROM registrations WHERE activity_id=%s AND user_id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT','WAITLISTED')",(value.activityId,user["id"])).fetchone()
        if existing: raise HTTPException(409,"Você já está inscrito nesta atividade.")
        count = conn.execute("SELECT count(*) AS n FROM registrations WHERE activity_id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT')",(value.activityId,)).fetchone()["n"]
        if count >= inventory["capacity"] and activity.get("waitlistEnabled", True) is False:
            raise HTTPException(409,"Atividade lotada e sem lista de espera.")
        status = "WAITLISTED" if count >= inventory["capacity"] else "PENDING_PAYMENT" if price else "CONFIRMED"
        snapshot = {"eventId":event["id"],"eventTitle":event["title"],"activity":activity,"correlationId":trace()["correlationId"]}
        if rate:
            snapshot["priceOption"] = rate
        row = conn.execute("""INSERT INTO registrations(id,activity_id,user_id,request_key,status,price_cents,expires_at,snapshot)
          VALUES(%s,%s,%s,%s,%s,%s,CASE WHEN %s='PENDING_PAYMENT' THEN clock_timestamp()+(%s * interval '1 second') END,%s::jsonb) RETURNING *""",
          (str(uuid4()),value.activityId,user["id"],idempotency_key,status,price,status,int(os.environ.get("RESERVATION_TTL_SECONDS","900")),json.dumps(snapshot))).fetchone()
        event_message(conn,row,"registration.confirmed" if status == "CONFIRMED" else "registration.reserved" if status == "PENDING_PAYMENT" else "registration.waitlisted")
    return {"registration":serialize(row)}

def owned(conn,id,user):
    row=conn.execute("SELECT * FROM registrations WHERE id=%s AND user_id=%s",(id,user)).fetchone()
    if not row: raise HTTPException(404,"Inscrição não encontrada.")
    bind_correlation(row["snapshot"].get("correlationId", str(row["id"])))
    return row

@router.get("/registrations")
def listing(authorization: str=Header(default="")):
    user=actor(authorization)
    with db() as conn: rows=conn.execute("SELECT * FROM registrations WHERE user_id=%s ORDER BY created_at DESC",(user["id"],)).fetchall()
    return {"registrations":[serialize(row) for row in rows]}

@router.get("/registrations/{id}")
def detail(id:UUID,authorization: str=Header(default="")):
    user=actor(authorization)
    with db() as conn:
        row=owned(conn,id,user["id"])
        bind_correlation(row["snapshot"].get("correlationId", str(row["id"])))
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        maintain(conn,lock(conn,row["activity_id"]),event)
        return {"registration":serialize(owned(conn,id,user["id"]))}

@router.post("/registrations/{id}/cancel")
def cancel(id:UUID,authorization: str=Header(default="")):
    user=actor(authorization)
    with db() as conn:
        row=owned(conn,id,user["id"])
        bind_correlation(row["snapshot"].get("correlationId", str(row["id"])))
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        inventory=lock(conn,row["activity_id"])
        row=owned(conn,id,user["id"])
        require_cancellable(row,event)
        updated=conn.execute("UPDATE registrations SET status='CANCELLED' WHERE id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT','WAITLISTED') RETURNING *",(id,)).fetchone()
        if updated: event_message(conn,updated,"registration.cancelled")
        maintain(conn,inventory,event)
        return {"registration":serialize(owned(conn,id,user["id"]))}

@router.get("/internal/registrations/{id}")
def internal_detail(id:UUID,request:Request):
    secured(request)
    with db() as conn:
        row=conn.execute("SELECT * FROM registrations WHERE id=%s",(id,)).fetchone()
        if not row: raise HTTPException(404,"Inscrição não encontrada.")
        bind_correlation(row["snapshot"].get("correlationId", str(row["id"])))
        return {"registration":serialize(row)}


class ResolveCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credential: str = Field(min_length=100, max_length=200)
    eventId: UUID
    activityId: UUID | None = None


@router.post("/internal/registrations/resolve-credential")
def resolve_credential(value: ResolveCredential, request: Request):
    secured(request)
    if not re.fullmatch(r"eventhub:check-in:v1:[a-f0-9-]{36}:[a-f0-9]{64}", value.credential):
        raise HTTPException(400, "QR Code de credencial inválido.")
    parts = value.credential.split(":")
    try:
        if len(parts) != 5 or parts[:3] != ["eventhub", "check-in", "v1"]:
            raise ValueError()
        registration_id = UUID(parts[3])
    except ValueError:
        raise HTTPException(400, "QR Code de credencial inválido.")
    with db() as conn:
        row = conn.execute("SELECT * FROM registrations WHERE id=%s", (registration_id,)).fetchone()
    if not row or not hmac.compare_digest(credential(row), value.credential):
        raise HTTPException(404, "Credencial não encontrada.")
    if row["snapshot"]["eventId"] != str(value.eventId) or (value.activityId and str(row["activity_id"]) != str(value.activityId)):
        raise HTTPException(409, "A credencial pertence a outro evento ou atividade.")
    return {"registration": serialize(row)}


RegistrationStatus = Literal["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "EXPIRED", "WAITLISTED"]


def require_cancellable(row, event):
    """Completed/ongoing attendance cannot be invalidated by cancelling a ticket."""
    # Unpaid reservations and waitlisted users have no attendance/certificate to
    # preserve and must still be able to leave after the activity has started.
    if row["status"] != "CONFIRMED":
        return
    starts_at = row["snapshot"]["activity"].get("startsAt", event["startsAt"])
    if datetime.fromisoformat(starts_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(409, "A inscrição só pode ser cancelada antes do início da atividade.")


def managed_event(event_id, authorization):
    # managed=true always verifies organization membership in Event, even with a service key.
    return remote("EVENTS", "/events/" + str(event_id) + "?managed=true", authorization)["event"]


def registration_filter(event, status=None, activity_id=None):
    clauses = ["i.event_id=%s"]
    values = [event["id"]]
    if status:
        clauses.append("r.status=%s")
        values.append(status)
    if activity_id:
        if not any(item["id"] == str(activity_id) for item in event["activities"]):
            raise HTTPException(404, "Atividade não encontrada neste evento.")
        clauses.append("r.activity_id=%s")
        values.append(activity_id)
    return " AND ".join(clauses), values


def event_registrations(event, limit, offset, status=None, activity_id=None, ascending=False):
    where, values = registration_filter(event, status, activity_id)
    with db() as conn:
        # One read transaction keeps the count and page on a consistent snapshot.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        total = conn.execute("SELECT count(*) AS n FROM registrations r JOIN inventories i ON i.activity_id=r.activity_id WHERE " + where, values).fetchone()["n"]
        order = "ASC" if ascending else "DESC"
        rows = conn.execute("SELECT r.* FROM registrations r JOIN inventories i ON i.activity_id=r.activity_id WHERE " + where + " ORDER BY r.created_at " + order + ",r.id LIMIT %s OFFSET %s", [*values, limit, offset]).fetchall()
    return rows, total


def participant_details(rows):
    users = {}
    result = []
    for row in rows:
        user_id = str(row["user_id"])
        if user_id not in users:
            user = remote("IDENTITY", "/internal/users/" + user_id)["user"]
            users[user_id] = {"id": user_id, "name": user["name"], "email": user["email"]}
        result.append({**serialize(row), "participant": users[user_id]})
    return result


@router.get("/organizer/events/{id}/registrations")
def organizer_listing(id: UUID, authorization: str = Header(default=""),
                      page: int = Query(default=1, ge=1, le=100000),
                      limit: int = Query(default=25, ge=1, le=100),
                      status: RegistrationStatus | None = None, activityId: UUID | None = None):
    event = managed_event(id, authorization)
    rows, total = event_registrations(event, limit, (page - 1) * limit, status, activityId)
    return {"registrations": participant_details(rows), "total": total, "page": page, "limit": limit}


def safe_csv(value):
    """Treat spreadsheet formulas as text, including whitespace-prefixed payloads."""
    value = "" if value is None else str(value)
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")) else value


@router.get("/organizer/events/{id}/registrations/export.csv")
def organizer_export(id: UUID, authorization: str = Header(default=""),
                     status: RegistrationStatus | None = None, activityId: UUID | None = None):
    event = managed_event(id, authorization)
    rows, total = event_registrations(event, 10001, 0, status, activityId)
    if total > 10000:
        raise HTTPException(409, "A exportação aceita até 10000 inscrições. Use os filtros por atividade e status.")
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["Inscrição", "Nome", "E-mail", "Atividade", "Status", "Valor (centavos)", "Criada em"])
    for item in participant_details(rows):
        writer.writerow([safe_csv(value) for value in [item["id"], item["participant"]["name"], item["participant"]["email"], item["activity"]["title"], item["status"], item["priceCents"], item["createdAt"]]])
    return Response(content="\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="inscricoes-' + str(id) + '.csv"', "Cache-Control": "no-store"})


@router.post("/organizer/registrations/{id}/cancel")
def organizer_cancel(id: UUID, authorization: str = Header(default="")):
    user = actor(authorization)
    with db() as conn:
        row = conn.execute("SELECT * FROM registrations WHERE id=%s", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Inscrição não encontrada.")
        event = managed_event(row["snapshot"]["eventId"], authorization)
        inventory = lock(conn, row["activity_id"])
        # Read again after the inventory lock to serialize cancellation/payment/promotion.
        row = conn.execute("SELECT * FROM registrations WHERE id=%s", (id,)).fetchone()
        require_cancellable(row, event)
        updated = conn.execute("UPDATE registrations SET status='CANCELLED' WHERE id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT','WAITLISTED') RETURNING *", (id,)).fetchone()
        if updated:
            event_message(conn, updated, "registration.cancelled")
            conn.execute("INSERT INTO registration_actions(id,registration_id,actor_id,action) VALUES(%s,%s,%s,'organizer.cancelled')", (str(uuid4()), id, user["id"]))
            row = updated
        maintain(conn, inventory, event)
        return {"registration": serialize(row)}


@router.get("/internal/events/{id}/registrations")
def internal_event_registrations(id: UUID, request: Request,
                                limit: int = Query(default=500, ge=1, le=500),
                                offset: int = Query(default=0, ge=0, le=1000000)):
    secured(request)
    event = remote("EVENTS", "/events/" + str(id))["event"]
    rows, total = event_registrations(event, limit, offset, ascending=True)
    return {"registrations": [serialize(row) for row in rows], "total": total, "limit": limit, "offset": offset}

class Decision(BaseModel):
    model_config=ConfigDict(extra="forbid")
    outcome:Literal["APPROVED","DECLINED","EXPIRED"]

@router.post("/internal/registrations/{id}/payment")
def payment(id:UUID,value:Decision,request:Request):
    secured(request)
    with db() as conn:
        row=conn.execute("SELECT * FROM registrations WHERE id=%s",(id,)).fetchone()
        if not row: raise HTTPException(404,"Inscrição não encontrada.")
        if row["price_cents"] <= 0: raise HTTPException(409,"Inscrição gratuita não possui pagamento.")
        bind_correlation(row["snapshot"].get("correlationId", str(row["id"])))
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        inventory=lock(conn,row["activity_id"])
        maintain(conn,inventory,event)
        row=conn.execute("SELECT * FROM registrations WHERE id=%s FOR UPDATE",(id,)).fetchone()
        if row["status"] == "PENDING_PAYMENT":
            status="CONFIRMED" if value.outcome == "APPROVED" else "EXPIRED" if value.outcome == "EXPIRED" else "CANCELLED"
            row=conn.execute("UPDATE registrations SET status=CASE WHEN expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE %s END WHERE id=%s RETURNING *",(status,id)).fetchone()
            status=row["status"]
            event_message(conn,row,{"CONFIRMED": "registration.confirmed", "EXPIRED": "registration.expired", "CANCELLED": "registration.cancelled"}[status])
            maintain(conn,inventory,event)
        if row["status"] not in ("CONFIRMED", "CANCELLED", "EXPIRED"):
            raise HTTPException(409, "Inscrição indisponível para confirmação de pagamento.")
        result = "APPROVED" if row["status"] == "CONFIRMED" else "EXPIRED" if row["status"] == "EXPIRED" or value.outcome != "DECLINED" else "DECLINED"
        receipt = conn.execute("INSERT INTO payment_notification_receipts(registration_id,result) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING registration_id", (id, result)).fetchone()
        if receipt:
            event_message(conn, row, "payment." + result.lower(), {"amountCents": row["price_cents"], "providerStatus": value.outcome,
                "registrationStatus": row["status"], "occurredAt": datetime.now(timezone.utc).isoformat()})
        return {"registration":serialize(row)}


class AnnouncementInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(max_length=5000)
    location: str = Field(max_length=240)
    streamUrl: str = Field(max_length=500)
    sessionTime: str = Field(max_length=120)


class Announcement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    eventId: UUID
    type: Literal["event.updated", "event.cancelled"]
    occurredAt: datetime
    correlationId: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9-]{1,64}$")
    event: AnnouncementInfo
    changedFields: list[Literal["title", "description", "location", "streamUrl", "sessionTime", "status"]] = Field(min_length=1, max_length=6)

    @field_validator("occurredAt")
    @classmethod
    def aware(cls, value):
        if not value.tzinfo:
            raise ValueError("Informe fuso horário.")
        return value


@router.post("/internal/events/{id}/announcements")
def announcement(id: UUID, value: Announcement, request: Request):
    secured(request)
    if id != value.eventId:
        raise HTTPException(409, "Evento da comunicação divergente.")
    event = remote("EVENTS", "/events/" + str(id))["event"]
    if event["status"] == "DRAFT" or (value.type == "event.cancelled" and event["status"] != "CANCELLED"):
        raise HTTPException(409, "Comunicação incompatível com o evento.")
    with db() as conn:
        claimed = conn.execute("INSERT INTO event_announcement_receipts(id,event_id) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING id", (value.id, id)).fetchone()
        if not claimed:
            return {"accepted": True, "duplicate": True, "queued": 0}
        # One announcement per person, even when enrolled in several activities.
        # Active registrations and those cancelled by the event remain eligible during convergence.
        result = conn.execute("""WITH recipients AS (
            SELECT DISTINCT ON (r.user_id) r.id,r.user_id FROM registrations r
            JOIN inventories i ON i.activity_id=r.activity_id WHERE i.event_id=%s AND r.created_at<=%s
            AND (r.status IN ('CONFIRMED','PENDING_PAYMENT','WAITLISTED') OR
                 (r.status='CANCELLED' AND r.snapshot->>'cancellationReason'='EVENT_CANCELLED'))
            ORDER BY r.user_id,r.created_at,r.id
        ), messages AS (SELECT gen_random_uuid() AS mid,id,user_id FROM recipients)
        INSERT INTO outbox(id,payload) SELECT mid,%s::jsonb || jsonb_build_object(
            'id',mid::text,'announcementId',%s::text,'registrationId',id::text,'userId',user_id::text,'version',1) FROM messages""",
            (id, value.occurredAt, json.dumps({"type": value.type, "eventId": str(id), "occurredAt": value.occurredAt.isoformat(),
                "event": value.event.model_dump(), "changedFields": value.changedFields, "correlationId": value.correlationId or trace()["correlationId"], "requestId": trace()["requestId"]}), str(value.id)))
        return {"accepted": True, "duplicate": False, "queued": result.rowcount}

def worker(stop):
    while not stop.wait(3):
        try:
            with db() as conn: items=conn.execute("SELECT * FROM inventories").fetchall()
            for item in items:
                event=remote("EVENTS","/events/"+str(item["event_id"]))["event"]
                with db() as conn: maintain(conn,lock(conn,item["activity_id"]),event)
        except Exception as error: print(json.dumps({"service":"registrations","worker":"maintenance","error":type(error).__name__}),flush=True)
        try:
            import pika
            credentials=pika.PlainCredentials(os.environ["RABBITMQ_USER"],os.environ["RABBITMQ_PASSWORD"])
            connection=pika.BlockingConnection(pika.ConnectionParameters(host="rabbitmq",credentials=credentials,connection_attempts=1,socket_timeout=3,blocked_connection_timeout=3))
            channel=connection.channel(); channel.exchange_declare(exchange="eventhub",exchange_type="topic",durable=True)
            channel.queue_declare(queue="notifications",durable=True)
            for kind in ("registration.#", "payment.#", "event.#"):
                channel.queue_bind(queue="notifications",exchange="eventhub",routing_key=kind)
            channel.confirm_delivery()
            with db() as conn:
                rows=conn.execute("SELECT * FROM outbox WHERE published_at IS NULL LIMIT 100 FOR UPDATE SKIP LOCKED").fetchall()
                for row in rows:
                    channel.basic_publish(exchange="eventhub",routing_key=row["payload"]["type"],body=json.dumps(row["payload"]),properties=pika.BasicProperties(delivery_mode=2,message_id=str(row["id"]),correlation_id=row["payload"].get("correlationId",row["payload"]["registrationId"]),headers={"x-correlation-id":row["payload"].get("correlationId",row["payload"]["registrationId"]),"x-request-id":row["payload"].get("requestId",str(row["id"]))}),mandatory=True)
                    log_event("outbox.published", messageId=str(row["id"]), registrationId=row["payload"]["registrationId"], correlationId=row["payload"].get("correlationId",row["payload"]["registrationId"]))
                    conn.execute("UPDATE outbox SET published_at=now() WHERE id=%s",(row["id"],))
            connection.close()
        except Exception as error: print(json.dumps({"service":"registrations","worker":"outbox","error":type(error).__name__}),flush=True)
