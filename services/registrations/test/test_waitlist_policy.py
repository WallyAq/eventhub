"""Waitlist policy is enforced by Registration while holding inventory lock.

Run: python -m unittest discover -s services/registrations/test -v
"""
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException


spec = importlib.util.spec_from_file_location(
    "eventhub_registrations_domain_test", Path(__file__).parents[1] / "app" / "domain.py"
)
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


class Connection:
    """Small transaction double; records writes and lock/maintenance ordering."""
    def __init__(self, activity_id, event_id, user_id, count=1):
        self.inventory = {"activity_id": activity_id, "event_id": event_id, "capacity": 1}
        self.user_id = user_id
        self.count = count
        self.previous = None
        self.existing = None
        self.calls = []
        self.inserted = None
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, error_type, error, traceback):
        self.rolled_back = error_type is not None

    def execute(self, sql, values=None):
        self.calls.append(sql)
        row = None
        if "user_id=%s AND request_key=%s" in sql:
            row = self.previous
        elif "SELECT * FROM inventories" in sql and "FOR UPDATE" in sql:
            row = self.inventory
        elif "SELECT * FROM registrations WHERE activity_id=" in sql:
            row = self.existing
        elif "SELECT count(*)" in sql:
            row = {"n": self.count}
        elif "INSERT INTO registrations" in sql:
            row = {
                "id": values[0], "activity_id": values[1], "user_id": values[2],
                "request_key": values[3], "status": values[4], "price_cents": values[5],
                "expires_at": None, "snapshot": domain.json.loads(values[8]),
                "created_at": datetime.now(timezone.utc),
            }
            self.inserted = row
        return SimpleNamespace(fetchone=lambda: row)


class WaitlistPolicyTests(unittest.TestCase):
    def setUp(self):
        self.user_id = str(uuid4())
        self.event_id = str(uuid4())
        self.activity_id = str(uuid4())
        self.activity = {"id": self.activity_id, "title": "Workshop", "capacity": 1, "priceCents": 0}
        self.event = {
            "id": self.event_id, "title": "Evento", "status": "PUBLISHED",
            "startsAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "activities": [self.activity],
        }
        self.value = domain.Reservation(eventId=self.event_id, activityId=self.activity_id)
        self.connection = Connection(self.activity_id, self.event_id, self.user_id)

    def reserve(self, maintenance=None):
        def maintain(connection, inventory, event):
            connection.calls.append("MAINTAIN")
            if maintenance:
                maintenance(connection)

        with patch.object(domain, "actor", return_value={"id": self.user_id}), \
                patch.object(domain, "remote", return_value={"event": self.event}), \
                patch.object(domain, "db", return_value=self.connection), \
                patch.object(domain, "maintain", side_effect=maintain):
            return domain.reserve(self.value, "Bearer participant", "request-key-123")

    def test_full_activity_with_disabled_waitlist_returns_409_without_registration(self):
        self.activity["waitlistEnabled"] = False
        with self.assertRaises(HTTPException) as error:
            self.reserve()
        self.assertEqual(error.exception.status_code, 409)
        self.assertIsNone(self.connection.inserted)
        self.assertFalse(any("INSERT INTO outbox" in call for call in self.connection.calls))
        self.assertTrue(self.connection.rolled_back)
        lock = next(i for i, call in enumerate(self.connection.calls) if "SELECT * FROM inventories" in call)
        count = next(i for i, call in enumerate(self.connection.calls) if "SELECT count(*)" in call)
        self.assertLess(lock, self.connection.calls.index("MAINTAIN"))
        self.assertLess(self.connection.calls.index("MAINTAIN"), count)

    def test_legacy_activity_defaults_to_waitlist(self):
        result = self.reserve()
        self.assertEqual(result["registration"]["status"], "WAITLISTED")
        self.assertTrue(any("INSERT INTO outbox" in call for call in self.connection.calls))

    def test_enabled_waitlist_accepts_full_activity(self):
        self.activity["waitlistEnabled"] = True
        self.assertEqual(self.reserve()["registration"]["status"], "WAITLISTED")

    def test_disabled_waitlist_still_confirms_free_available_activity(self):
        self.activity["waitlistEnabled"] = False
        self.connection.count = 0
        result = self.reserve()["registration"]
        self.assertEqual(result["status"], "CONFIRMED")
        self.assertFalse(result["activity"]["waitlistEnabled"])

    def test_disabled_waitlist_still_reserves_paid_available_activity(self):
        self.activity.update(waitlistEnabled=False, priceCents=1500)
        self.connection.count = 0
        self.assertEqual(self.reserve()["registration"]["status"], "PENDING_PAYMENT")

    def test_availability_is_checked_after_expiration_maintenance(self):
        self.activity["waitlistEnabled"] = False
        result = self.reserve(maintenance=lambda conn: setattr(conn, "count", 0))
        self.assertEqual(result["registration"]["status"], "CONFIRMED")

    def registration(self):
        return {
            "id": str(uuid4()), "activity_id": self.activity_id, "user_id": self.user_id,
            "status": "CONFIRMED", "price_cents": 0, "expires_at": None,
            "created_at": datetime.now(timezone.utc),
            "snapshot": {"eventId": self.event_id, "activity": self.activity},
        }

    def test_idempotent_retry_returns_original_even_when_now_full(self):
        self.activity["waitlistEnabled"] = False
        self.connection.previous = self.registration()
        result = self.reserve()["registration"]
        self.assertEqual(result["id"], self.connection.previous["id"])
        self.assertIsNone(self.connection.inserted)

    def test_existing_active_registration_rejects_duplicate_even_when_full(self):
        self.activity["waitlistEnabled"] = False
        self.connection.existing = self.registration()
        with self.assertRaises(HTTPException) as error:
            self.reserve()
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.detail, "Você já está inscrito nesta atividade.")
        self.assertIsNone(self.connection.inserted)
        self.assertTrue(self.connection.rolled_back)


if __name__ == "__main__":
    unittest.main()
