"""Compose mail from service APIs; each service reads only its own database."""
import json
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from uuid import UUID
from datetime import datetime

SUBJECTS = {
    "registration.confirmed": "Inscrição confirmada no EventHub",
    "registration.reserved": "Reserva de atividade no EventHub",
    "registration.waitlisted": "Entrada na lista de espera do EventHub",
    "registration.expired": "Reserva expirada no EventHub",
    "registration.cancelled": "Inscrição cancelada no EventHub",
    "payment.approved": "Pagamento simulado aprovado no EventHub",
    "payment.declined": "Pagamento simulado recusado no EventHub",
    "payment.expired": "Pagamento simulado expirado no EventHub",
    "event.updated": "Informações do evento atualizadas no EventHub",
    "event.cancelled": "Evento cancelado no EventHub",
}
EVENT_FIELDS = {"title": "Nome do evento", "description": "Descrição", "location": "Local geral",
                "streamUrl": "Plataforma de transmissão", "sessionTime": "Horário informativo", "status": "Estado do evento"}


def validate_event(payload):
    if not isinstance(payload, dict) or payload.get("type") not in SUBJECTS or payload.get("version") != 1:
        raise ValueError("Unsupported notification event")
    for key in ("id", "registrationId", "userId"):
        if str(UUID(payload.get(key, ""))) != payload[key]:
            raise ValueError("Invalid notification identifier")
    if payload["type"].startswith("payment."):
        if type(payload.get("amountCents")) is not int or not 0 < payload["amountCents"] <= 10000000:
            raise ValueError("Invalid payment amount")
        if payload.get("providerStatus") not in ("APPROVED", "DECLINED", "EXPIRED"):
            raise ValueError("Invalid provider status")
        if payload.get("registrationStatus") not in ("CONFIRMED", "CANCELLED", "EXPIRED"):
            raise ValueError("Invalid registration payment result")
    if payload["type"].startswith("event."):
        for key in ("eventId", "announcementId"):
            if str(UUID(payload.get(key, ""))) != payload[key]:
                raise ValueError("Invalid event identifier")
        event, changed = payload.get("event"), payload.get("changedFields")
        limits = {"title": 160, "description": 5000, "location": 240, "streamUrl": 500, "sessionTime": 120}
        if not isinstance(event, dict) or any(not isinstance(event.get(key), str) or len(event[key]) > limit for key, limit in limits.items()):
            raise ValueError("Invalid event snapshot")
        if not isinstance(changed, list) or not 1 <= len(changed) <= 6 or any(not isinstance(key, str) or key not in EVENT_FIELDS for key in changed):
            raise ValueError("Invalid changed fields")
    if payload.get("occurredAt"):
        if not datetime.fromisoformat(payload["occurredAt"].replace("Z", "+00:00")).tzinfo:
            raise ValueError("Missing notification timezone")


class Delivery:
    def __init__(self, env=None, fetch=None, smtp_factory=None):
        self.env = os.environ if env is None else env
        self.mode = self.env.get("MAIL_MODE", "mailbox")
        if self.mode not in ("mailbox", "smtp"):
            raise ValueError("MAIL_MODE must be mailbox or smtp")
        self.port = int(self.env.get("SMTP_PORT", "587"))
        if self.mode == "smtp" and (not self.env.get("SMTP_HOST") or not self.env.get("MAIL_FROM") or not 1 <= self.port <= 65535):
            raise ValueError("SMTP_HOST, SMTP_PORT and MAIL_FROM are required")
        self.fetch = fetch or self._fetch
        self.smtp_factory = smtp_factory

    def _fetch(self, service, path):
        request = urllib.request.Request(self.env[service + "_URL"].rstrip("/") + path,
                                         headers={"x-internal-key": self.env["INTERNAL_API_KEY"]})
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    def prepare(self, payload):
        validate_event(payload)
        registration = self.fetch("REGISTRATIONS", "/internal/registrations/" + payload["registrationId"])["registration"]
        if registration["userId"] != payload["userId"] or registration["id"] != payload["registrationId"]:
            raise ValueError("Notification owner mismatch")
        if payload["type"].startswith("event.") and registration.get("eventId") != payload["eventId"]:
            raise ValueError("Notification event mismatch")
        user = self.fetch("IDENTITY", "/internal/users/" + payload["userId"])["user"]
        if user["id"] != payload["userId"] or "@" not in user["email"] or any(c in user["email"] for c in "\r\n"):
            raise ValueError("Invalid notification recipient")
        activity = registration.get("activity", {})
        activity_title = activity.get("title", "Atividade") if isinstance(activity, dict) else str(activity)
        base = self.env.get("PUBLIC_APP_URL", "").rstrip("/")
        kind = payload["type"]
        event_title = payload["event"]["title"] if kind.startswith("event.") else registration.get("eventTitle", "Evento")
        text = f"Olá, {user['name']}.\n\n{SUBJECTS[kind]}.\nEvento: {event_title}\n"
        if kind.startswith("event."):
            if kind == "event.cancelled":
                text += "A organização cancelou o evento. As inscrições e certificados serão tratados conforme as regras de cancelamento.\n"
            else:
                text += "A organização alterou as seguintes informações públicas:\n"
                for key in payload["changedFields"]:
                    text += f"- {EVENT_FIELDS[key]}: {payload['event'].get(key) or '(não informado)'}\n"
                text += "O período, as vagas e os preços das atividades não foram alterados por este aviso.\n"
        else:
            text += f"Atividade: {activity_title}\n"
        if kind.startswith("payment."):
            amount = payload["amountCents"]
            text += f"Valor da simulação: R$ {amount // 100},{amount % 100:02d}\n"
            if kind == "payment.declined":
                text += "O provedor simulado recusou o pagamento. Esta tentativa não confirma sua vaga.\n"
            elif kind == "payment.expired":
                text += ("A aprovação simulada não confirmou sua vaga: a reserva expirou ou foi cancelada.\n" if payload["providerStatus"] == "APPROVED" else
                         "O pagamento/reserva expirou e esta tentativa não confirma sua vaga.\n")
            else:
                text += "O provedor simulado aprovou o pagamento e a confirmação foi registrada.\n"
            text += "Demonstração acadêmica: nenhuma cobrança real foi realizada.\n"
        if payload.get("occurredAt"):
            text += f"Data do aviso: {payload['occurredAt']}\n"
        text += f"Situação atual da inscrição: {registration['status']}\nInscrição: {registration['id']}\n"
        if registration.get("expiresAt") and registration["status"] == "PENDING_PAYMENT":
            text += f"Prazo da reserva: {registration['expiresAt']}\n"
        if base:
            text += f"Acompanhe em {base}/minhas-inscricoes\n" if kind.startswith("event.") else f"Acompanhe em {base}/inscricoes/{registration['id']}\n"
        return {"id": payload["id"], "type": kind, "registrationId": payload["registrationId"], "to": user["email"], "subject": SUBJECTS[kind], "text": text}

    def send(self, message):
        if self.mode == "mailbox":
            directory = Path(self.env.get("MAILBOX_DIRECTORY", "/tmp/eventhub-mail"))
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            filename = directory / (message["id"] + ".json")
            # IDs are validated UUIDs, not user-controlled paths.
            filename.write_text(json.dumps(message, ensure_ascii=False), encoding="utf-8")
            filename.chmod(0o600)
            return
        mail = EmailMessage()
        mail["From"] = self.env["MAIL_FROM"]
        mail["To"] = message["to"]
        mail["Subject"] = message["subject"]
        mail["Message-ID"] = f"<{message['id']}@eventhub.local>"
        mail.set_content(message["text"])
        secure = self.env.get("SMTP_SECURE", "false") == "true"
        factory = self.smtp_factory or (smtplib.SMTP_SSL if secure else smtplib.SMTP)
        options = {"host": self.env["SMTP_HOST"], "port": self.port, "timeout": 10}
        if secure:
            options["context"] = ssl.create_default_context()
        with factory(**options) as smtp:
            if not secure and self.env.get("SMTP_STARTTLS", "true") != "false":
                smtp.starttls(context=ssl.create_default_context())
            if self.env.get("SMTP_USER"):
                smtp.login(self.env["SMTP_USER"], self.env.get("SMTP_PASSWORD", ""))
            if smtp.send_message(mail):
                raise RuntimeError("SMTP rejected recipient")
