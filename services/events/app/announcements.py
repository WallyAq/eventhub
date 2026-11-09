"""Transactional event announcements, delivered independently of event mutations."""
import json
import os
import urllib.request
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from . import domain
from .observability import trace, trace_scope, log_event

router = APIRouter()
FIELDS = ("title", "description", "location", "streamUrl", "sessionTime")


class PublicInformation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=5000)
    location: str = Field(max_length=240)
    streamUrl: str = Field(max_length=500)
    sessionTime: str = Field(max_length=120)

    @model_validator(mode="after")
    def text(self):
        if not self.title.strip() or not self.description.strip():
            raise ValueError("Preencha título e descrição.")
        if self.streamUrl and not self.streamUrl.startswith("https://"):
            raise ValueError("Use uma plataforma HTTPS.")
        return self


def migrate():
    with domain.db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(42002)")
        conn.execute("""CREATE TABLE IF NOT EXISTS event_notification_outbox (
            id uuid PRIMARY KEY,payload jsonb NOT NULL,published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());""")


def enqueue(conn, event, kind, changed):
    payload = {"id": str(uuid4()), "eventId": event["id"], "type": kind, "occurredAt": datetime.now(timezone.utc).isoformat(),
               "correlationId":trace()["correlationId"], "requestId":trace()["requestId"], "event": {key: event.get(key, "") for key in FIELDS}, "changedFields": changed}
    conn.execute("INSERT INTO event_notification_outbox(id,payload) VALUES(%s,%s::jsonb)", (payload["id"], json.dumps(payload)))


@router.patch("/events/{id}/public-information")
def update(id: UUID, value: PublicInformation, authorization: str = Header(default="")):
    with domain.db() as conn:
        row = conn.execute("SELECT payload FROM events WHERE id=%s FOR UPDATE", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Evento não encontrado.")
        event = row["payload"]
        domain.organization(event["organizationId"], authorization)
        if event["status"] != "PUBLISHED":
            raise HTTPException(409, "Atualize as informações de um evento publicado. Rascunhos usam o editor completo.")
        if event["modality"] != "Online" and not value.location.strip():
            raise HTTPException(422, "Informe o local geral do evento.")
        if event["modality"] != "Presencial" and not value.streamUrl.startswith("https://"):
            raise HTTPException(422, "Informe a plataforma HTTPS.")
        data = value.model_dump()
        changed = [key for key in FIELDS if event.get(key, "") != data[key]]
        if changed:
            event.update(data)
            conn.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s", (json.dumps(event), id))
            enqueue(conn, event, "event.updated", changed)
    return {"event": event, "notificationsQueued": bool(changed)}


def deliver_once():
    # Locks only the outbox rows. SMTP and Notification never participate in the event transaction.
    with domain.db() as conn:
        rows = conn.execute("SELECT * FROM event_notification_outbox WHERE published_at IS NULL ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED").fetchall()
        for row in rows:
            payload = row["payload"]
            request = urllib.request.Request(os.environ["REGISTRATIONS_URL"] + "/internal/events/" + payload["eventId"] + "/announcements",
                headers={"x-internal-key": os.environ["INTERNAL_API_KEY"], "content-type": "application/json", "x-correlation-id":payload.get("correlationId",str(row["id"])), "x-request-id":payload.get("requestId",str(row["id"]))}, data=json.dumps({key:value for key,value in payload.items() if key != "requestId"}).encode())
            with urllib.request.urlopen(request, timeout=5) as response:
                result = json.load(response)
                if not result.get("accepted"):
                    raise ValueError("Announcement not accepted")
            conn.execute("UPDATE event_notification_outbox SET published_at=now() WHERE id=%s", (row["id"],))


def worker(stop):
    while not stop.wait(3):
        try:
            deliver_once()
        except Exception as error:
            print(json.dumps({"service": "events", "worker": "announcements", "error": type(error).__name__}), flush=True)
