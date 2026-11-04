"""Event-local projections rebuilt through APIs and refreshed by domain messages."""
import csv
import io
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response

router = APIRouter()
STATUSES = ("PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "EXPIRED", "WAITLISTED")


def db():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row, options="-c statement_timeout=15000")


def remote(service, path, authorization=""):
    headers = {"authorization": authorization, "x-internal-key": os.environ["INTERNAL_API_KEY"], "accept": "application/json"}
    try:
        request = urllib.request.Request(os.environ[service + "_URL"] + path, headers=headers)
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise HTTPException(error.code if error.code in (401, 403, 404, 409) else 503,
                            "Acesso recusado ou dependência de relatórios indisponível.")
    except (OSError, ValueError, KeyError):
        raise HTTPException(503, "Não foi possível atualizar o relatório. Tente novamente.")


def migrate():
    with db() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(48001)")
        conn.execute("""CREATE TABLE IF NOT EXISTS registration_projection (
            registration_id uuid PRIMARY KEY, event_id uuid NOT NULL, activity_id uuid NOT NULL,
            status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED','WAITLISTED')),
            price_cents int NOT NULL CHECK(price_cents>=0), expires_at timestamptz,
            attended boolean NOT NULL DEFAULT false, synced_at timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS registration_projection_event ON registration_projection(event_id);
            CREATE TABLE IF NOT EXISTS event_projection (
            event_id uuid PRIMARY KEY, snapshot jsonb NOT NULL, synced_at timestamptz NOT NULL);
            CREATE TABLE IF NOT EXISTS processed_messages (id uuid PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
        """)


def paginate(service, path, field):
    """Refuse incomplete/unstable pages instead of returning plausible partial totals."""
    rows, expected, offset = [], None, 0
    maximum = int(os.environ.get("REPORT_MAX_ROWS", "100000"))
    while True:
        page = remote(service, path + "?limit=500&offset=" + str(offset))
        total, items = page.get("total"), page.get(field)
        if type(total) is not int or total < 0 or total > maximum or not isinstance(items, list):
            raise HTTPException(503, "Snapshot de relatório inválido ou excede o limite configurado.")
        if expected is not None and expected != total:
            raise HTTPException(503, "Inscrições foram alteradas durante a consulta. Tente novamente.")
        expected = total
        if len(items) > 500 or (not items and offset < total):
            raise HTTPException(503, "Snapshot de relatório incompleto.")
        rows.extend(items)
        offset += len(items)
        if offset >= total:
            break
    ids = [item.get("id") for item in rows if isinstance(item, dict)]
    if len(rows) != expected or len(set(ids)) != expected or None in ids:
        raise HTTPException(503, "Snapshot de relatório inconsistente. Tente novamente.")
    return rows


def prepare_rows(event, registrations, attendance):
    activities = {item["id"] for item in event["activities"]}
    by_registration = {item["registrationId"]: item for item in attendance}
    rows = []
    try:
        for item in registrations:
            if item["eventId"] != event["id"] or item["activityId"] not in activities or item["status"] not in STATUSES:
                raise ValueError("Registration snapshot differs from event")
            if type(item["priceCents"]) is not int or item["priceCents"] < 0:
                raise ValueError("Invalid amount")
            marked = by_registration.get(item["id"])
            attended = bool(marked and all(marked[field] == item[field] for field in ("eventId", "activityId", "userId")))
            rows.append({"id": item["id"], "eventId": item["eventId"], "activityId": item["activityId"],
                         "status": item["status"], "priceCents": item["priceCents"],
                         "expiresAt": item.get("expiresAt"), "attended": attended})
    except (KeyError, TypeError, ValueError):
        raise HTTPException(503, "As fontes retornaram dados inconsistentes para o relatório.")
    return rows


def reconcile(conn, event_id, event=None):
    # GET, message replay and concurrent consumers serialize by event. HTTP reads
    # happen under this local lock, preventing older messages from overwriting a
    # more recent snapshot. No domain database is queried directly.
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 48))", (str(event_id),))
    event = event or remote("EVENTS", "/events/" + str(event_id))["event"]
    registrations = paginate("REGISTRATIONS", "/internal/events/" + str(event_id) + "/registrations", "registrations")
    attendance = paginate("ATTENDANCE", "/internal/attendance/events/" + str(event_id), "attendance")
    rows = prepare_rows(event, registrations, attendance)
    checked = datetime.now(timezone.utc)
    for item in rows:
        conn.execute("""INSERT INTO registration_projection
            (registration_id,event_id,activity_id,status,price_cents,expires_at,attended,synced_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (registration_id) DO UPDATE SET
            event_id=excluded.event_id,activity_id=excluded.activity_id,status=excluded.status,
            price_cents=excluded.price_cents,expires_at=excluded.expires_at,attended=excluded.attended,synced_at=excluded.synced_at""",
            (item["id"], item["eventId"], item["activityId"], item["status"], item["priceCents"],
             item["expiresAt"], item["attended"], checked))
    conn.execute("DELETE FROM registration_projection WHERE event_id=%s AND NOT (registration_id=ANY(%s::uuid[]))",
                 (event_id, [item["id"] for item in rows]))
    # Store only the fields needed for aggregate reports, not speakers' contacts.
    snapshot = {"id": event["id"], "title": event["title"], "status": event["status"],
                "activities": [{"id": item["id"], "title": item["title"], "capacity": item["capacity"]}
                               for item in event["activities"]]}
    conn.execute("""INSERT INTO event_projection(event_id,snapshot,synced_at) VALUES (%s,%s::jsonb,%s)
        ON CONFLICT(event_id) DO UPDATE SET snapshot=excluded.snapshot,synced_at=excluded.synced_at""",
        (event_id, json.dumps(snapshot), checked))
    return snapshot, rows, checked


def effective_status(item, checked_at):
    if item["status"] == "PENDING_PAYMENT" and item.get("expiresAt"):
        try:
            expiry = datetime.fromisoformat(item["expiresAt"].replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                raise ValueError("Missing timezone")
            if expiry <= checked_at:
                return "EXPIRED"
        except (ValueError, TypeError):
            raise HTTPException(503, "A reserva possui prazo inválido na fonte.")
    return item["status"]


def summarize(event, registrations, checked_at):
    counts = dict.fromkeys(STATUSES, 0)
    result = {item["id"]: {"activityId": item["id"], "title": item["title"], "capacity": item["capacity"],
              "total": 0, "byStatus": dict.fromkeys(STATUSES, 0), "attendanceCount": 0,
              "confirmedAttendanceCount": 0, "simulatedRevenueCents": 0} for item in event["activities"]}
    for item in registrations:
        status = effective_status(item, checked_at)
        current = result[item["activityId"]]
        counts[status] += 1
        current["byStatus"][status] += 1
        current["total"] += 1
        current["attendanceCount"] += int(item["attended"])
        current["confirmedAttendanceCount"] += int(item["attended"] and status == "CONFIRMED")
        if status == "CONFIRMED":
            current["simulatedRevenueCents"] += item["priceCents"]
    return {"eventId": event["id"], "eventTitle": event["title"], "eventStatus": event["status"],
            "total": len(registrations), "byStatus": counts,
            "attendanceCount": sum(item["attendanceCount"] for item in result.values()),
            "confirmedAttendanceCount": sum(item["confirmedAttendanceCount"] for item in result.values()),
            "simulatedRevenueCents": sum(item["simulatedRevenueCents"] for item in result.values()),
            "paymentMode": "SIMULATED", "revenueBasis": "CONFIRMED_REGISTRATION_PRICES_NO_REAL_SETTLEMENT",
            "activities": list(result.values()), "checkedAt": checked_at,
            "consistency": "EVENTUAL_API_RECONCILIATION", "complete": True}


def report_for(event_id, authorization):
    # Explicit managed read is required even when an event is publicly visible.
    event = remote("EVENTS", "/events/" + str(event_id) + "?managed=true", authorization)["event"]
    with db() as conn:
        snapshot, _, checked = reconcile(conn, event_id, event)
        # Read the projection owned by this service, not another service's tables.
        rows = conn.execute("""SELECT registration_id AS id,activity_id,status,price_cents,expires_at,attended
            FROM registration_projection WHERE event_id=%s""", (event_id,)).fetchall()
    registrations = [{"id": str(row["id"]), "activityId": str(row["activity_id"]), "status": row["status"],
                      "priceCents": row["price_cents"], "attended": row["attended"],
                      "expiresAt": row["expires_at"].isoformat() if row["expires_at"] else None} for row in rows]
    return summarize(snapshot, registrations, checked)


@router.get("/reports/events/{event_id}")
def report(event_id: UUID, authorization: str = Header(default="")):
    return {"report": report_for(event_id, authorization)}


def safe_csv(value):
    text = str(value)
    # Spreadsheet programs can evaluate cells beginning with whitespace + a
    # formula marker. Quote alone is insufficient; prefix a literal apostrophe.
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")) else text


@router.get("/reports/events/{event_id}/export.csv")
def export(event_id: UUID, authorization: str = Header(default="")):
    report = report_for(event_id, authorization)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["event_id", "activity_id", "activity", "capacity", "total", *STATUSES,
                     "attendance", "confirmed_attendance", "simulated_revenue_cents", "payment_mode", "checked_at"])
    for item in report["activities"]:
        writer.writerow([report["eventId"], item["activityId"], safe_csv(item["title"]), item["capacity"],
                         item["total"], *[item["byStatus"][status] for status in STATUSES],
                         item["attendanceCount"], item["confirmedAttendanceCount"], item["simulatedRevenueCents"],
                         "SIMULATED", report["checkedAt"].isoformat()])
    return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="relatorio-' + str(event_id) + '.csv"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
