import json
import os
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Literal

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict

router = APIRouter()

def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row, options="-c statement_timeout=10000")

def remote(service, path, authorization="", body=None):
    headers = {"authorization": authorization, "x-internal-key": os.environ["INTERNAL_API_KEY"], "content-type": "application/json"}
    try:
        req = urllib.request.Request(os.environ[service + "_URL"] + path, headers=headers, data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req, timeout=5) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (400,401,403,404,409) else 503, "Operação recusada pela dependência.")
    except (OSError, ValueError): raise HTTPException(503, "Dependência indisponível. Tente novamente.")

def actor(token): return remote("IDENTITY", "/users/me", token)["user"]

def secured(request):
    if request.headers.get("x-internal-key") != os.environ["INTERNAL_API_KEY"]: raise HTTPException(401, "Credencial interna inválida.")

def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(43001)")
        conn.execute("""CREATE TABLE IF NOT EXISTS inventories(activity_id uuid PRIMARY KEY,event_id uuid NOT NULL,capacity int NOT NULL CHECK(capacity>0));
        CREATE TABLE IF NOT EXISTS registrations(id uuid PRIMARY KEY, activity_id uuid NOT NULL REFERENCES inventories(activity_id), user_id uuid NOT NULL,
          request_key varchar(100) NOT NULL, status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED','WAITLISTED')),
          price_cents int NOT NULL CHECK(price_cents>=0), expires_at timestamptz, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,request_key));
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_registration ON registrations(user_id,activity_id) WHERE status IN ('PENDING_PAYMENT','CONFIRMED','WAITLISTED');
        CREATE TABLE IF NOT EXISTS outbox(id uuid PRIMARY KEY, payload jsonb NOT NULL, published_at timestamptz);
        """)

def event_message(conn, row, kind):
    message = {"id":str(uuid4()), "type":kind, "version":1, "registrationId":str(row["id"]),"userId":str(row["user_id"])}
    conn.execute("INSERT INTO outbox(id,payload) VALUES(%s,%s::jsonb)", (message["id"],json.dumps(message)))

def serialize(row):
    return {"id":str(row["id"]),"activityId":str(row["activity_id"]),"userId":str(row["user_id"]),"status":row["status"],"priceCents":row["price_cents"],"expiresAt":row["expires_at"],"createdAt":row["created_at"],**row["snapshot"]}

def lock(conn, activity):
    return conn.execute("SELECT * FROM inventories WHERE activity_id=%s FOR UPDATE", (activity,)).fetchone()

def maintain(conn, inventory, event=None):
    """Every mutation takes the inventory row lock before any registration lock."""
    expired = conn.execute("UPDATE registrations SET status='EXPIRED' WHERE activity_id=%s AND status='PENDING_PAYMENT' AND expires_at<=clock_timestamp() RETURNING *", (inventory["activity_id"],)).fetchall()
    for row in expired: event_message(conn,row,"registration.expired")
    if event and event["status"] == "CANCELLED":
        rows = conn.execute("UPDATE registrations SET status='CANCELLED' WHERE activity_id=%s AND status IN ('PENDING_PAYMENT','CONFIRMED','WAITLISTED') RETURNING *", (inventory["activity_id"],)).fetchall()
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
            return {"registration":serialize(previous)}
        conn.execute("INSERT INTO inventories(activity_id,event_id,capacity) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING",(value.activityId,value.eventId,activity["capacity"]))
        inventory = lock(conn,value.activityId)
        maintain(conn,inventory,event)
        existing = conn.execute("SELECT * FROM registrations WHERE activity_id=%s AND user_id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT','WAITLISTED')",(value.activityId,user["id"])).fetchone()
        if existing: raise HTTPException(409,"Você já está inscrito nesta atividade.")
        count = conn.execute("SELECT count(*) AS n FROM registrations WHERE activity_id=%s AND status IN ('CONFIRMED','PENDING_PAYMENT')",(value.activityId,)).fetchone()["n"]
        if count >= inventory["capacity"] and activity.get("waitlistEnabled", True) is False:
            raise HTTPException(409,"Atividade lotada e sem lista de espera.")
        status = "WAITLISTED" if count >= inventory["capacity"] else "PENDING_PAYMENT" if activity["priceCents"] else "CONFIRMED"
        snapshot = {"eventId":event["id"],"eventTitle":event["title"],"activity":activity}
        row = conn.execute("""INSERT INTO registrations(id,activity_id,user_id,request_key,status,price_cents,expires_at,snapshot)
          VALUES(%s,%s,%s,%s,%s,%s,CASE WHEN %s='PENDING_PAYMENT' THEN clock_timestamp()+(%s * interval '1 second') END,%s::jsonb) RETURNING *""",
          (str(uuid4()),value.activityId,user["id"],idempotency_key,status,activity["priceCents"],status,int(os.environ.get("RESERVATION_TTL_SECONDS","900")),json.dumps(snapshot))).fetchone()
        event_message(conn,row,"registration.confirmed" if status == "CONFIRMED" else "registration.reserved" if status == "PENDING_PAYMENT" else "registration.waitlisted")
    return {"registration":serialize(row)}

def owned(conn,id,user):
    row=conn.execute("SELECT * FROM registrations WHERE id=%s AND user_id=%s",(id,user)).fetchone()
    if not row: raise HTTPException(404,"Inscrição não encontrada.")
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
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        maintain(conn,lock(conn,row["activity_id"]),event)
        return {"registration":serialize(owned(conn,id,user["id"]))}

@router.post("/registrations/{id}/cancel")
def cancel(id:UUID,authorization: str=Header(default="")):
    user=actor(authorization)
    with db() as conn:
        row=owned(conn,id,user["id"])
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        inventory=lock(conn,row["activity_id"])
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
        return {"registration":serialize(row)}

class Decision(BaseModel):
    model_config=ConfigDict(extra="forbid")
    outcome:Literal["APPROVED","DECLINED","EXPIRED"]

@router.post("/internal/registrations/{id}/payment")
def payment(id:UUID,value:Decision,request:Request):
    secured(request)
    with db() as conn:
        row=conn.execute("SELECT * FROM registrations WHERE id=%s",(id,)).fetchone()
        if not row: raise HTTPException(404,"Inscrição não encontrada.")
        event=remote("EVENTS","/events/"+row["snapshot"]["eventId"])["event"]
        inventory=lock(conn,row["activity_id"])
        maintain(conn,inventory,event)
        row=conn.execute("SELECT * FROM registrations WHERE id=%s FOR UPDATE",(id,)).fetchone()
        if row["status"] == "PENDING_PAYMENT":
            status="CONFIRMED" if value.outcome == "APPROVED" else "EXPIRED" if value.outcome == "EXPIRED" else "CANCELLED"
            row=conn.execute("UPDATE registrations SET status=CASE WHEN expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE %s END WHERE id=%s RETURNING *",(status,id)).fetchone()
            status=row["status"]
            event_message(conn,row,"registration.confirmed" if status == "CONFIRMED" else "registration.cancelled")
            maintain(conn,inventory,event)
        return {"registration":serialize(row)}

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
            channel.queue_bind(queue="notifications",exchange="eventhub",routing_key="registration.#")
            channel.confirm_delivery()
            with db() as conn:
                rows=conn.execute("SELECT * FROM outbox WHERE published_at IS NULL LIMIT 100 FOR UPDATE SKIP LOCKED").fetchall()
                for row in rows:
                    channel.basic_publish(exchange="eventhub",routing_key=row["payload"]["type"],body=json.dumps(row["payload"]),properties=pika.BasicProperties(delivery_mode=2,message_id=str(row["id"])),mandatory=True)
                    conn.execute("UPDATE outbox SET published_at=now() WHERE id=%s",(row["id"],))
            connection.close()
        except Exception as error: print(json.dumps({"service":"registrations","worker":"outbox","error":type(error).__name__}),flush=True)
