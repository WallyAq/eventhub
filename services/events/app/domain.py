"""Event owns schedules and immutable published capacity/prices."""
import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Literal

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

router = APIRouter()

def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row, options="-c statement_timeout=5000")

def remote(url, token):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": token}), timeout=4) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (401,403,404) else 503, "Acesso não autorizado ou dependência indisponível.")
    except (OSError, ValueError):
        raise HTTPException(503, "Serviço de identidade indisponível.")

def actor(authorization):
    return remote(os.environ["IDENTITY_URL"] + "/users/me", authorization)["user"]

def organization(id, authorization):
    return remote(os.environ["IDENTITY_URL"] + "/organizations/" + str(UUID(str(id))), authorization)["organization"]

class ActivityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=160)
    startsAt: datetime
    endsAt: datetime
    location: str = Field(min_length=2, max_length=240)
    responsible: str = Field(min_length=2, max_length=120)
    capacity: int = Field(strict=True, ge=1, le=100000)
    priceCents: int = Field(strict=True, ge=0, le=10000000)
    kind: Literal["Curso", "Minicurso", "Workshop", "Palestra"] = "Workshop"
    description: str = Field(default="", max_length=5000)
    waitlistEnabled: bool = Field(default=True, strict=True)
    speakerId: UUID | None = None

    @field_validator("description")
    @classmethod
    def description_text(cls, value):
        if value and not value.strip():
            raise ValueError("A descrição da atividade não pode conter somente espaços.")
        return value

class Speaker(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    institution: str = Field(max_length=160)
    id: UUID | None = None
    degree: str = Field(default="", max_length=100)
    email: str = Field(default="", max_length=254)
    biography: str = Field(default="", max_length=400)

    @field_validator("email")
    @classmethod
    def contact_email(cls, value):
        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Informe um e-mail de contato válido.")
        return value

    @field_validator("name", "biography")
    @classmethod
    def nonblank_text(cls, value):
        if value and not value.strip():
            raise ValueError("Nome e biografia não podem conter somente espaços.")
        return value

class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organizationId: UUID
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=5000)
    category: str = Field(min_length=2, max_length=80)
    hours: int = Field(strict=True, ge=1, le=10000)
    modality: Literal["Presencial", "Híbrido", "Online"]
    location: str = Field(max_length=240)
    streamUrl: str = Field(max_length=500)
    startsAt: datetime
    endsAt: datetime
    sessionTime: str = Field(max_length=120)
    featured: bool = False
    speakers: list[Speaker] = Field(default_factory=list, max_length=30)
    activities: list[ActivityInput] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def dates(self):
        if not self.title.strip() or not self.description.strip():
            raise ValueError("Preencha título e descrição.")
        if not self.startsAt.tzinfo or not self.endsAt.tzinfo or self.endsAt <= self.startsAt:
            raise ValueError("Datas devem ter fuso horário e término posterior ao início.")
        if self.modality != "Online" and not self.location.strip():
            raise ValueError("Informe o local presencial.")
        if self.modality != "Presencial" and not self.streamUrl.startswith("https://"):
            raise ValueError("Informe uma plataforma HTTPS.")
        speakers = {}
        for speaker in self.speakers:
            if speaker.id is not None:
                if speaker.id in speakers:
                    raise ValueError("Identificadores de palestrantes não podem se repetir.")
                speakers[speaker.id] = speaker
        for item in self.activities:
            if not item.startsAt.tzinfo or not item.endsAt.tzinfo or not (self.startsAt <= item.startsAt < item.endsAt <= self.endsAt):
                raise ValueError("Atividades devem ocorrer dentro do período do evento.")
            if item.speakerId is not None:
                if item.speakerId not in speakers:
                    raise ValueError("O palestrante da atividade deve pertencer ao evento.")
                item.responsible = speakers[item.speakerId].name
        return self

def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(42001)")
        conn.execute("CREATE TABLE IF NOT EXISTS events (id uuid PRIMARY KEY, organization_id uuid NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','CANCELLED')), payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())")

def get_event(id):
    with db() as conn:
        row = conn.execute("SELECT payload FROM events WHERE id=%s", (id,)).fetchone()
    if not row: raise HTTPException(404, "Evento não encontrado.")
    return row["payload"]

def internal(request):
    return bool(os.environ.get("INTERNAL_API_KEY")) and request.headers.get("x-internal-key") == os.environ["INTERNAL_API_KEY"]


def public_event(event):
    """Contact email is available only in explicitly authorized managed views."""
    return {**event, "speakers": [
        {key: value for key, value in speaker.items() if key != "email"}
        for speaker in event.get("speakers", [])
    ]}

@router.get("/events")
def listing(managed: bool = False, authorization: str = Header(default="")):
    with db() as conn:
        if managed:
            orgs = remote(os.environ["IDENTITY_URL"] + "/organizations", authorization)["organizations"]
            ids = [str(item["id"]) for item in orgs]
            rows = conn.execute("SELECT payload FROM events WHERE organization_id::text=ANY(%s) ORDER BY created_at DESC", (ids,)).fetchall()
        else:
            rows = conn.execute("SELECT payload FROM events WHERE status='PUBLISHED' ORDER BY created_at DESC").fetchall()
    return {"events": [row["payload"] if managed else public_event(row["payload"]) for row in rows]}

@router.get("/events/{id}")
def detail(id: UUID, request: Request, authorization: str = Header(default=""), managed: bool = False):
    event = get_event(id)
    if managed or (event["status"] != "PUBLISHED" and not internal(request)):
        organization(event["organizationId"], authorization)
    return {"event": event if managed else public_event(event)}

def save(value, authorization, id=None):
    org = organization(value.organizationId, authorization)
    payload = value.model_dump(mode="json")
    payload.update(id=str(id or uuid4()), status="DRAFT", organizationName=org["name"])
    for item in payload["activities"]: item["id"] = str(uuid4())
    with db() as conn:
        if id:
            current = conn.execute("SELECT payload FROM events WHERE id=%s FOR UPDATE", (id,)).fetchone()
            if not current: raise HTTPException(404, "Evento não encontrado.")
            organization(current["payload"]["organizationId"], authorization)
            if current["payload"]["status"] != "DRAFT": raise HTTPException(409, "Somente rascunhos podem ser editados. Capacidade e preço publicados são fixos.")
            if current["payload"]["organizationId"] != str(value.organizationId): raise HTTPException(400, "Não é possível transferir a organização.")
            conn.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s", (json.dumps(payload), id))
        else:
            conn.execute("INSERT INTO events(id,organization_id,status,payload) VALUES (%s,%s,'DRAFT',%s::jsonb)", (payload["id"],value.organizationId,json.dumps(payload)))
    return {"event": payload}

@router.post("/events", status_code=201)
def create(value: EventInput, authorization: str = Header(default="")):
    return save(value, authorization)

@router.put("/events/{id}")
def update(id: UUID, value: EventInput, authorization: str = Header(default="")):
    return save(value, authorization, id)

@router.post("/events/{id}/{action}")
def transition(id: UUID, action: Literal["publish", "cancel"], authorization: str = Header(default="")):
    with db() as conn:
        row = conn.execute("SELECT payload FROM events WHERE id=%s FOR UPDATE", (id,)).fetchone()
        if not row: raise HTTPException(404, "Evento não encontrado.")
        event = row["payload"]
        organization(event["organizationId"], authorization)
        if action == "publish":
            if event["status"] == "CANCELLED": raise HTTPException(409, "Evento cancelado não pode ser publicado.")
            if datetime.fromisoformat(event["startsAt"].replace("Z","+00:00")) <= datetime.now(timezone.utc): raise HTTPException(400, "Publique antes do início do evento.")
        event["status"] = "PUBLISHED" if action == "publish" else "CANCELLED"
        conn.execute("UPDATE events SET status=%s,payload=%s::jsonb WHERE id=%s", (event["status"],json.dumps(event),id))
    return {"event": event}
