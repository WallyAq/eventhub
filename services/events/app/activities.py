"""Published activity additions and safe removal of unused activities."""
import hashlib
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import domain
from .observability import headers as trace_headers, log_event

router = APIRouter()


class NewActivity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    activity: domain.ActivityInput
    speakers: list[domain.Speaker] = Field(default_factory=list, max_length=30)


def managed_event(conn, id, authorization):
    row = conn.execute("SELECT payload FROM events WHERE id=%s FOR UPDATE", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Evento não encontrado.")
    event = row["payload"]
    domain.event_access(event, authorization)
    return event


def require_editable(event):
    if event["status"] != "PUBLISHED":
        raise HTTPException(409, "Use o editor completo para alterar atividades de um rascunho. Eventos cancelados não podem ser alterados.")
    if datetime.fromisoformat(event["startsAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(409, "Adicione ou exclua atividades antes do início do evento.")


@router.post("/events/{id}/activities", status_code=201)
def add(id: UUID, value: NewActivity, authorization: str = Header(default=""), idempotency_key: str = Header(default="")):
    if not 8 <= len(idempotency_key) <= 100:
        raise HTTPException(400, "Informe Idempotency-Key de 8 a 100 caracteres.")
    fingerprint = hashlib.sha256(json.dumps(value.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    with domain.db() as conn:
        event = managed_event(conn, id, authorization)
        previous = conn.execute("SELECT request_hash,activity_id FROM event_activity_requests WHERE event_id=%s AND request_key=%s", (id, idempotency_key)).fetchone()
        if previous:
            if previous["request_hash"] != fingerprint:
                raise HTTPException(409, "Esta solicitação já foi utilizada para outra atividade.")
            if not any(item["id"] == str(previous["activity_id"]) for item in event["activities"]):
                raise HTTPException(409, "A atividade desta solicitação já foi excluída.")
            return {"event": event}
        require_editable(event)
        data = {key: event[key] for key in domain.EventInput.model_fields if key in event}
        data["activities"] = [{key: item_value for key, item_value in item.items() if key != "id"} for item in event["activities"]] + [value.activity.model_dump(mode="json")]
        data["speakers"] = event.get("speakers", []) + [speaker.model_dump(mode="json") for speaker in value.speakers]
        try:
            validated = domain.EventInput.model_validate(data)
        except ValidationError as error:
            raise HTTPException(422, error.errors()[0]["msg"])
        activity = {**validated.activities[-1].model_dump(mode="json"), "id": str(uuid4())}
        event["activities"].append(activity)
        event["speakers"] = data["speakers"]
        conn.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s", (json.dumps(event), id))
        conn.execute("INSERT INTO event_activity_requests(event_id,request_key,request_hash,activity_id) VALUES(%s,%s,%s,%s)", (id, idempotency_key, fingerprint, activity["id"]))
    log_event("activity.added", eventId=str(id), activityId=activity["id"])
    return {"event": event}


def close_activity(event_id, activity_id):
    request = urllib.request.Request(
        os.environ["REGISTRATIONS_URL"] + "/internal/events/" + str(event_id) + "/activities/" + str(activity_id) + "/close",
        data=b"{}", headers={"x-internal-key": os.environ["INTERNAL_API_KEY"], "content-type": "application/json", **trace_headers()}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if json.load(response).get("closed") is not True:
                raise ValueError("Activity closure was not confirmed")
    except urllib.error.HTTPError as error:
        if error.code == 409:
            try:
                detail = json.load(error).get("detail")
            except (OSError, ValueError):
                detail = None
            raise HTTPException(409, detail if isinstance(detail, str) else "Esta atividade não pode ser excluída.")
        raise HTTPException(503, "Não foi possível concluir a exclusão. Tente excluir a atividade novamente.")
    except (OSError, ValueError):
        raise HTTPException(503, "Não foi possível concluir a exclusão. Tente excluir a atividade novamente.")


@router.delete("/events/{id}/activities/{activity_id}")
def remove(id: UUID, activity_id: UUID, authorization: str = Header(default="")):
    with domain.db() as conn:
        event = managed_event(conn, id, authorization)
        if not any(item["id"] == str(activity_id) for item in event["activities"]):
            return {"event": event}
        require_editable(event)
        if len(event["activities"]) <= 1:
            raise HTTPException(409, "O evento precisa manter pelo menos uma atividade.")
        # A lost response is safe to retry: Registrations never reopens a closed inventory.
        close_activity(id, activity_id)
        log_event("activity.closed", eventId=str(id), activityId=str(activity_id))
        event["activities"] = [item for item in event["activities"] if item["id"] != str(activity_id)]
        conn.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s", (json.dumps(event), id))
    log_event("activity.removed", eventId=str(id), activityId=str(activity_id))
    return {"event": event}
