"""Compose mail from service APIs; each service reads only its own database."""
import json
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from uuid import UUID
from datetime import datetime, timedelta, timezone
from html import escape
from .observability import headers as trace_headers, valid_id, trace

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
STATUS_LABELS = {"CONFIRMED": "Confirmada", "PENDING_PAYMENT": "Aguardando pagamento",
                 "WAITLISTED": "Na lista de espera", "CANCELLED": "Cancelada", "EXPIRED": "Expirada"}
INTRODUCTIONS = {
    "registration.confirmed": "Sua inscrição na atividade está confirmada. Confira os detalhes da sua participação abaixo.",
    "registration.reserved": "Sua vaga está reservada. Conclua o pagamento simulado dentro do prazo indicado para confirmar a inscrição.",
    "registration.waitlisted": "Você entrou na lista de espera desta atividade. Acompanhe sua inscrição para verificar a liberação de uma vaga.",
    "registration.expired": "O prazo da sua reserva terminou e a vaga foi liberada. Consulte a plataforma para verificar a disponibilidade de uma nova inscrição.",
    "registration.cancelled": "Sua inscrição na atividade foi cancelada. Você pode consultar os detalhes na plataforma.",
    "event.updated": "A organização atualizou as informações do evento. Veja abaixo o que mudou.",
    "event.cancelled": "A organização cancelou o evento. As inscrições e os certificados seguem as regras de cancelamento da plataforma.",
}


def display_date(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo:
            return parsed.astimezone(timezone(timedelta(hours=-3))).strftime("%d/%m/%Y às %H:%M") + " (UTC-03)"
    except (TypeError, ValueError):
        pass
    return str(value)


def html_value(value):
    return escape(str(value), quote=True).replace("\n", "<br>")


def format_html(title, greeting, introduction, details, changes, notice, url, action):
    rows = "".join(
        f'<tr><td style="padding:8px 12px;vertical-align:top;color:#6B7280;width:34%">{html_value(label)}</td>'
        f'<td style="padding:8px 12px;vertical-align:top;word-break:break-word">{html_value(value)}</td></tr>'
        for label, value in details)
    updates = ""
    if changes:
        items = "".join(f'<li style="margin:8px 0"><strong>{html_value(label)}:</strong> {html_value(value)}</li>' for label, value in changes)
        updates = f'<h2 style="margin:24px 0 12px;font-size:18px">O que mudou</h2><ul style="padding-left:20px;line-height:1.6">{items}</ul>'
    warning = f'<p style="margin:24px 0;padding:16px;background:#F3F2FD;border-left:3px solid #5B4BDB;font-size:14px;line-height:1.6">{html_value(notice)}</p>' if notice else ""
    button = ""
    if url:
        safe_url = escape(url, quote=True)
        button = f'''<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="#5B4BDB" style="border-radius:6px">
<a href="{safe_url}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:bold">{html_value(action)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;color:#6B7280">Se o botão não funcionar, acesse:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all"><a href="{safe_url}" style="color:#5B4BDB">{html_value(url)}</a></p>'''
    return f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F2FD;font-family:Arial,Helvetica,sans-serif;color:#1F2437">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #DDD9F7;border-radius:12px">
<tr><td bgcolor="#5B4BDB" style="padding:24px 32px;border-radius:12px 12px 0 0;color:#FFFFFF;font-size:22px;font-weight:bold;letter-spacing:1px">EVENTHUB</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.3">{html_value(title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">{html_value(greeting)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">{html_value(introduction)}</p>
<h2 style="margin:0 0 12px;font-size:18px">Detalhes da participação</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F7FE;font-size:14px;line-height:1.5;border-radius:6px">{rows}</table>
{updates}{warning}{button}
<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #DDD9F7;font-size:14px;line-height:1.6">Equipe EventHub</p>
</td></tr></table></td></tr></table></body></html>'''


def validate_event(payload):
    if not isinstance(payload, dict) or payload.get("type") not in SUBJECTS or payload.get("version") != 1:
        raise ValueError("Unsupported notification event")
    for key in ("id", "registrationId", "userId"):
        if str(UUID(payload.get(key, ""))) != payload[key]:
            raise ValueError("Invalid notification identifier")
    if payload.get("correlationId") is not None and not valid_id(payload["correlationId"]):
        raise ValueError("Invalid correlation identifier")
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
                                         headers={"x-internal-key": self.env["INTERNAL_API_KEY"], **trace_headers()})
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
        greeting = f"Olá, {user['name']}!"
        introduction = INTRODUCTIONS.get(kind, "")
        details = [("Evento", event_title), ("Atividade", activity_title),
                   ("Situação atual", STATUS_LABELS.get(registration["status"], registration["status"]))]
        changes, notice = [], ""
        if kind == "event.updated":
            changes = [(EVENT_FIELDS[key], payload["event"].get(key) or "Não informado") for key in payload["changedFields"]]
            notice = "Este aviso mantém o período, as vagas e os preços das atividades."
        if kind.startswith("payment."):
            amount = payload["amountCents"]
            reais = f"{amount // 100:,}".replace(",", ".")
            details.append(("Valor da simulação", f"R$ {reais},{amount % 100:02d}"))
            if kind == "payment.declined":
                introduction = "O provedor simulado recusou o pagamento. Esta tentativa não confirma sua vaga."
            elif kind == "payment.expired":
                introduction = ("A aprovação simulada não confirmou sua vaga porque a reserva expirou ou foi cancelada." if payload["providerStatus"] == "APPROVED" else
                                "O pagamento ou a reserva expirou. Esta tentativa não confirma sua vaga.")
            else:
                introduction = "O provedor simulado aprovou o pagamento e a confirmação da sua inscrição foi registrada."
            notice = "Demonstração acadêmica: nenhuma cobrança real foi realizada."
        if payload.get("occurredAt"):
            details.append(("Data do aviso", display_date(payload["occurredAt"])))
        if registration.get("expiresAt") and registration["status"] == "PENDING_PAYMENT":
            details.append(("Prazo da reserva", display_date(registration["expiresAt"])))
        details.append(("Código da inscrição", registration["id"]))
        url = ""
        action = "Ver minhas inscrições" if kind.startswith("event.") else "Ver minha inscrição"
        if base:
            url = f"{base}/minhas-inscricoes" if kind.startswith("event.") else f"{base}/inscricoes/{registration['id']}"
        sections = ["EVENTHUB", greeting, SUBJECTS[kind], introduction,
                    "DETALHES DA PARTICIPAÇÃO\n" + "\n".join(f"{label}: {value}" for label, value in details)]
        if changes:
            sections.append("O QUE MUDOU\n" + "\n".join(f"- {label}: {value}" for label, value in changes))
        if notice:
            sections.append(notice)
        if url:
            sections.append(f"{action}:\n{url}")
        sections.append("Equipe EventHub")
        return {"id": payload["id"], "type": kind, "registrationId": payload["registrationId"], "correlationId": payload.get("correlationId", payload["registrationId"]), "requestId": trace()["requestId"], "to": user["email"], "subject": SUBJECTS[kind],
                "text": "\n\n".join(sections), "html": format_html(SUBJECTS[kind], greeting, introduction, details, changes, notice, url, action)}

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
        if valid_id(message.get("correlationId")):
            mail["X-Correlation-ID"] = message["correlationId"]
        mail.set_content(message["text"])
        if message.get("html"):
            mail.add_alternative(message["html"], subtype="html")
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
