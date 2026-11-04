import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

spec = importlib.util.spec_from_file_location("eventhub_attendance_test", Path(__file__).parents[1] / "app" / "domain.py")
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


class AttendanceTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.user = {"id": str(uuid4())}
        self.event_id = str(uuid4())
        self.activity_id = str(uuid4())
        self.registration_id = uuid4()
        self.activity = {"id": self.activity_id, "title": "Atividade",
                         "startsAt": (self.now - timedelta(hours=1)).isoformat(),
                         "endsAt": (self.now + timedelta(hours=1)).isoformat()}
        self.event = {"id": self.event_id, "title": "Evento", "status": "PUBLISHED", "activities": [self.activity]}
        self.registration = {"id": str(self.registration_id), "userId": self.user["id"], "eventId": self.event_id,
                             "activityId": self.activity_id, "status": "CONFIRMED"}
        self.row = {"id": uuid4(), "registration_id": self.registration_id, "event_id": self.event_id,
                    "activity_id": self.activity_id, "user_id": self.user["id"], "marked_by": str(uuid4()),
                    "checked_in_at": self.now, "created_at": self.now,
                    "snapshot": {"eventTitle": "Evento", "activityTitle": "Atividade"}}
        self.connection = MagicMock()
        self.connection.__enter__.return_value = self.connection

    def test_checkin_window_includes_start_and_24h_after_end(self):
        starts_at = datetime.fromisoformat(self.activity["startsAt"])
        ends_at = datetime.fromisoformat(self.activity["endsAt"])
        self.assertEqual(domain.eligible_activity(self.registration, self.event, starts_at), self.activity)
        self.assertEqual(domain.eligible_activity(self.registration, self.event, ends_at + timedelta(hours=24)), self.activity)
        for instant in [starts_at - timedelta(microseconds=1), ends_at + timedelta(hours=24, microseconds=1)]:
            with self.assertRaises(HTTPException) as error:
                domain.eligible_activity(self.registration, self.event, instant)
            self.assertEqual(error.exception.status_code, 409)

    def test_pending_waitlisted_cancelled_and_expired_cannot_checkin(self):
        for status in ["PENDING_PAYMENT", "WAITLISTED", "CANCELLED", "EXPIRED"]:
            with self.subTest(status=status), self.assertRaises(HTTPException):
                domain.eligible_activity({**self.registration, "status": status}, self.event, self.now)

    def test_cancelled_event_mismatched_event_and_missing_activity_rejected(self):
        for event in [{**self.event, "status": "CANCELLED"}, {**self.event, "id": str(uuid4())}, {**self.event, "activities": []}]:
            with self.subTest(event=event), self.assertRaises(HTTPException):
                domain.eligible_activity(self.registration, event, self.now)

    def test_organization_membership_is_required_before_database_access(self):
        with patch.object(domain, "actor", return_value=self.user), \
                patch.object(domain, "registration_detail", return_value=self.registration), \
                patch.object(domain, "event_detail", side_effect=HTTPException(404, "Sem vínculo")) as event_call, \
                patch.object(domain, "db") as database:
            with self.assertRaises(HTTPException):
                domain.check_in(domain.CheckIn(registrationId=self.registration_id), "Bearer outsider")
            event_call.assert_called_once_with(self.event_id, "Bearer outsider", managed=True)
            database.assert_not_called()

    def check_in(self, previous=None, concurrent=False):
        responses = [previous, None if concurrent else self.row]
        if concurrent:
            responses.append(self.row)
        self.connection.execute.side_effect = lambda *args: SimpleNamespace(fetchone=lambda: responses.pop(0))
        with patch.object(domain, "actor", return_value=self.user), \
                patch.object(domain, "registration_detail", return_value=self.registration), \
                patch.object(domain, "event_detail", return_value=self.event), \
                patch.object(domain, "db", return_value=self.connection):
            return domain.check_in(domain.CheckIn(registrationId=self.registration_id), "Bearer organizer")

    def test_duplicate_returns_original_even_after_window_and_never_inserts(self):
        self.activity.update(startsAt=(self.now - timedelta(days=3)).isoformat(), endsAt=(self.now - timedelta(days=2)).isoformat())
        result = self.check_in(previous=self.row)
        self.assertEqual(result["attendance"]["id"], str(self.row["id"]))
        self.assertEqual(self.connection.execute.call_count, 1)

    def test_concurrent_duplicate_uses_unique_constraint_and_returns_existing(self):
        result = self.check_in(concurrent=True)
        self.assertEqual(result["attendance"]["id"], str(self.row["id"]))
        insert = self.connection.execute.call_args_list[1].args[0]
        self.assertIn("ON CONFLICT(registration_id) DO NOTHING", insert)

    def test_success_records_actor_and_minimum_snapshot(self):
        result = self.check_in()
        self.assertEqual(result["attendance"]["registrationId"], str(self.registration_id))
        values = self.connection.execute.call_args_list[1].args[1]
        self.assertEqual(values[5], self.user["id"])
        self.assertNotIn("email", values[6])
        self.assertNotIn("cpf", values[6])

    def test_participant_can_only_read_own_or_managed_registration(self):
        with patch.object(domain, "actor", return_value=self.user), \
                patch.object(domain, "registration_detail", return_value=self.registration), \
                patch.object(domain, "event_detail") as managed, \
                patch.object(domain, "attendance_for", return_value=None):
            self.assertEqual(domain.detail(self.registration_id, "Bearer owner"), {"attendance": None})
            managed.assert_not_called()
        with patch.object(domain, "actor", return_value={"id": str(uuid4())}), \
                patch.object(domain, "registration_detail", return_value=self.registration), \
                patch.object(domain, "event_detail", side_effect=HTTPException(404, "Sem vínculo")), \
                patch.object(domain, "attendance_for") as lookup:
            with self.assertRaises(HTTPException):
                domain.detail(self.registration_id, "Bearer stranger")
            lookup.assert_not_called()

    def test_internal_route_requires_nonempty_matching_service_key(self):
        with patch.dict(domain.os.environ, {"INTERNAL_API_KEY": "service-secret"}):
            for headers in [{}, {"x-internal-key": "wrong"}]:
                with self.assertRaises(HTTPException):
                    domain.secured(SimpleNamespace(headers=headers))
            domain.secured(SimpleNamespace(headers={"x-internal-key": "service-secret"}))


if __name__ == "__main__":
    unittest.main()
