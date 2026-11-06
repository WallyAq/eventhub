"""Organizer-owned certificate presentation. Uploaded images never become URLs."""
import base64
import binascii
import re
import warnings
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from PIL import Image, ImageOps
from . import domain

router = APIRouter()
DEFAULT_BODY = "Certificamos que {{name}} participou da atividade {{activity}}, vinculada ao evento {{event}}, com carga horária de {{hours}}."
SPEAKER_BODY = "Certificamos que {{name}} atuou como palestrante/ministrante na atividade {{activity}}, vinculada ao evento {{event}}, com carga horária de {{hours}}."


def image_data(value, background=False):
    if not value:
        return ""
    match = re.fullmatch(r"data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ValueError("Use uma imagem PNG ou JPEG.")
    limit = 800000 if background else 200000
    try:
        raw = base64.b64decode(match[2], validate=True)
        if len(raw) > limit:
            raise ValueError("Imagem muito grande. Reduza o tamanho antes de enviar.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as source:
                if source.format not in ("PNG", "JPEG") or source.width * source.height > 8000000:
                    raise ValueError("Formato ou dimensões de imagem inválidos.")
                source.load()
                image = ImageOps.exif_transpose(source).convert("RGBA")
        image.thumbnail((1600, 1132) if background else (600, 200))
        output = BytesIO()
        image.save(output, format="PNG", optimize=True)
        if len(output.getvalue()) > limit:
            raise ValueError("Imagem muito grande após processamento.")
        return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()
    except (binascii.Error, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("Não foi possível validar a imagem.")


class Signatory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=100)
    role: str = Field(min_length=2, max_length=100)
    image: str = Field(default="", max_length=300000)

    @field_validator("name", "role")
    @classmethod
    def nonblank(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Preencha nome e cargo do signatário.")
        return value.strip()

    @field_validator("image")
    @classmethod
    def validate_image(cls, value):
        return image_data(value)


class Template(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="CERTIFICADO DE PARTICIPAÇÃO", min_length=2, max_length=80)
    speakerTitle: str = Field(default="CERTIFICADO DE PALESTRANTE", min_length=2, max_length=80)
    body: str = Field(default=DEFAULT_BODY, min_length=10, max_length=600)
    speakerBody: str = Field(default=SPEAKER_BODY, min_length=10, max_length=600)
    accentColor: str = Field(default="#4f46e5", pattern=r"^#[a-fA-F0-9]{6}$")
    background: str = Field(default="", max_length=1100000)
    signatories: list[Signatory] = Field(default_factory=list, max_length=2)

    @field_validator("title", "speakerTitle", "body", "speakerBody")
    @classmethod
    def text(cls, value):
        if not value.strip():
            raise ValueError("O texto não pode ficar vazio.")
        if any(token not in {"name", "activity", "event", "hours", "organization"}
               for token in re.findall(r"\{\{(.*?)\}\}", value)):
            raise ValueError("Marcador desconhecido. Use name, activity, event, hours ou organization.")
        return value.strip()

    @field_validator("background")
    @classmethod
    def validate_background(cls, value):
        return image_data(value, background=True)


def migrate():
    with domain.db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(47002)")
        conn.execute("""CREATE TABLE IF NOT EXISTS certificate_templates (
            event_id uuid PRIMARY KEY, settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());""")


def template_for(conn, event_id):
    row = conn.execute("SELECT settings FROM certificate_templates WHERE event_id=%s", (event_id,)).fetchone()
    return row["settings"] if row else Template().model_dump()


def managed(event_id, authorization):
    return domain.remote("EVENTS", "/events/" + str(event_id) + "?managed=true", authorization)["event"]


@router.get("/organizer/events/{id}/certificate-settings")
def settings(id: UUID, authorization: str = Header(default="")):
    managed(id, authorization)
    with domain.db() as conn:
        return {"settings": template_for(conn, id)}


@router.put("/organizer/events/{id}/certificate-settings")
def save_settings(id: UUID, value: Template, authorization: str = Header(default="")):
    import json
    event = managed(id, authorization)
    if event["status"] == "CANCELLED":
        raise HTTPException(409, "O evento está cancelado.")
    data = value.model_dump()
    with domain.db() as conn:
        conn.execute("""INSERT INTO certificate_templates(event_id,settings) VALUES(%s,%s::jsonb)
            ON CONFLICT(event_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()""", (id, json.dumps(data)))
    return {"settings": data}


@router.get("/organizer/events/{id}/certificate-preview")
def preview(id: UUID, kind: str = "PARTICIPANT", authorization: str = Header(default="")):
    from .pdf import render
    from datetime import datetime, timezone
    event = managed(id, authorization)
    if kind not in ("PARTICIPANT", "SPEAKER"):
        raise HTTPException(422, "Tipo de certificado inválido.")
    with domain.db() as conn:
        template = template_for(conn, id)
    activity = event["activities"][0]
    certificate = {"id": "PRÉVIA - SEM VALIDADE", "hash": "Modelo demonstrativo, sem emissão de certificado",
        "participantName": "Nome de exemplo", "eventTitle": event["title"], "activityTitle": activity["title"],
        "organizationName": event["organizationName"], "hours": 4, "durationMinutes": 240,
        "startsAt": activity["startsAt"], "endsAt": activity["endsAt"], "issuedAt": datetime.now(timezone.utc).isoformat(),
        "verificationUrl": domain.verification_url("0" * 64), "certificateKind": kind, "certificateTemplate": template}
    return Response(render(certificate), media_type="application/pdf", headers={"Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="previa-certificado.pdf"'})
