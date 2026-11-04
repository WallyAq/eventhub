"""Availability is public aggregate data, not the activity's initial capacity."""
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException


spec = importlib.util.spec_from_file_location(
    "eventhub_availability_domain_test", Path(__file__).parents[1] / "app" / "domain.py"
)
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


class AvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.event_id = uuid4()
        self.activity_id = str(uuid4())
        self.now = datetime.now(timezone.utc)
        self.event = {
            "id": str(self.event_id), "status": "PUBLISHED",
            "startsAt": (self.now + timedelta(days=1)).isoformat(),
            "speakers": [{"name": "Docente", "email": "private@example.test"}],
            "activities": [{"id": self.activity_id, "capacity": 5}],
        }
        self.connection = MagicMock()
        self.connection.__enter__.return_value = self.connection
        self.rows = []
        self.connection.execute.side_effect = lambda *args: SimpleNamespace(fetchall=lambda: self.rows)

    def row(self, occupied=0, waiting=0, capacity=5):
        return {"activity_id": self.activity_id, "capacity": capacity, "occupied": occupied,
                "waiting": waiting, "checked_at": self.now}

    def read(self):
        with patch.object(domain, "remote", return_value={"event": self.event}) as remote, \
                patch.object(domain, "db", return_value=self.connection):
            result = domain.availability(self.event_id)
        remote.assert_called_once_with("EVENTS", "/events/" + str(self.event_id))
        return result

    def test_unreserved_activity_uses_published_capacity_without_creating_inventory(self):
        result = self.read()
        self.assertEqual(result["activities"], [{"activityId": self.activity_id, "capacity": 5, "availableSeats": 5}])
        self.assertEqual(set(result), {"eventId", "checkedAt", "activities"})
        sql, parameters = self.connection.execute.call_args.args
        self.assertEqual(parameters, (self.event_id, [self.activity_id]))
        self.assertNotIn("INSERT", sql)
        self.assertNotIn("UPDATE", sql)
        self.assertNotIn("DELETE", sql)

    def test_aggregate_subtracts_confirmations_and_unexpired_reservations(self):
        self.rows = [self.row(occupied=2)]
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 3)
        sql = self.connection.execute.call_args.args[0]
        self.assertIn("r.status='CONFIRMED'", sql)
        self.assertIn("r.status='PENDING_PAYMENT' AND r.expires_at>statement_timestamp()", sql)
        self.assertEqual(self.connection.execute.call_count, 1)

    def test_available_places_are_allocated_to_existing_fifo_waiters_first(self):
        self.rows = [self.row(occupied=1, waiting=2)]
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 2)
        self.rows = [self.row(occupied=4, waiting=3)]
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 0)

    def test_full_activity_never_reports_negative_available_places(self):
        self.rows = [self.row(occupied=6)]
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 0)

    def test_database_clock_closes_enrollment_at_event_start(self):
        self.event["startsAt"] = self.now.isoformat()
        self.rows = [self.row()]
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 0)
        self.event["startsAt"] = (self.now - timedelta(seconds=1)).isoformat()
        self.assertEqual(self.read()["activities"][0]["availableSeats"], 0)

    def test_draft_and_cancelled_events_are_not_disclosed_by_service_credential(self):
        for status in ("DRAFT", "CANCELLED"):
            with self.subTest(status=status):
                self.event["status"] = status
                with self.assertRaises(HTTPException) as error:
                    self.read()
                self.assertEqual(error.exception.status_code, 404)
        self.connection.execute.assert_not_called()

    def test_event_outage_does_not_fall_back_to_initial_capacity(self):
        with patch.object(domain, "remote", side_effect=HTTPException(503, "offline")), \
                patch.object(domain, "db") as db:
            with self.assertRaises(HTTPException) as error:
                domain.availability(self.event_id)
        self.assertEqual(error.exception.status_code, 503)
        db.assert_not_called()

    def test_database_failure_is_service_unavailable_not_an_empty_inventory(self):
        with patch.object(domain, "remote", return_value={"event": self.event}), \
                patch.object(domain, "db", side_effect=domain.psycopg.OperationalError("offline")):
            with self.assertRaises(HTTPException) as error:
                domain.availability(self.event_id)
        self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
