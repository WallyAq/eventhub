"""Compose mail from service APIs; each service reads only its own database."""
import json
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from uuid import UUID

SUBJECTS = {
    "registration.confirmed": "Inscrição confirmada no EventHub",
    "registration.reserved": "Reserva de atividade no EventHub",
    "registration.waitlisted": "Entrada na lista de espera do EventHub",
    "registration.expired": "Reserva expirada no EventHub",
    "registration.cancelled": "Inscrição cancelada no EventHub",
}


def validate_event(payload):
    if not isinstance(payload, dict) or payload.get("type") not in SUBJECTS or payload.get("version") != 1:
        raise ValueError("Unsupported notification event")
    for key in ("id", "registrationId", "userId"):
        if str(UUID(payload.get(key, ""))) != payload[key]:
            raise ValueError("Invalid notification identifier")


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
        user = self.fetch("IDENTITY", "/internal/users/" + payload["userId"])["user"]
        if user["id"] != payload["userId"] or "@" not in user["email"] or any(c in user["email"] for c in "\r\n"):
            raise ValueError("Invalid notification recipient")
        activity = registration.get("activity", {})
        activity_title = activity.get("title", "Atividade") if isinstance(activity, dict) else str(activity)
        base = self.env.get("PUBLIC_APP_URL", "").rstrip("/")
        text = (f"Olá, {user['name']}.\n\n{SUBJECTS[payload['type']]}.\n"
                f"Evento: {registration.get('eventTitle', 'Evento')}\nAtividade: {activity_title}\n"
                f"Situação atual: {registration['status']}\nInscrição: {registration['id']}\n")
        if registration.get("expiresAt") and registration["status"] == "PENDING_PAYMENT":
            text += f"Prazo da reserva: {registration['expiresAt']}\n"
        if base:
            text += f"Acompanhe em {base}/inscricoes/{registration['id']}\n"
        return {"id": payload["id"], "to": user["email"], "subject": SUBJECTS[payload["type"]], "text": text}

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
