import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from app import domain


REGISTRATION = {"id": "registration", "userId": "participant", "eventId": "event", "activityId": "activity", "status": "CONFIRMED"}
EVENT = {"id": "event", "status": "PUBLISHED", "activities": [
    {"id": "activity", "startsAt": "2026-11-10T12:00:00Z", "endsAt": "2026-11-10T14:00:00Z"}]}
NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


class AttendanceRules(unittest.TestCase):
    def test_confirmed_registration_at_start_is_eligible(self):
        self.assertEqual(domain.eligible_activity(REGISTRATION, EVENT, NOW)["id"], "activity")

    def test_invalid_registration_states_are_rejected(self):
        for status in ("CANCELLED", "EXPIRED", "WAITLISTED", "PENDING_PAYMENT"):
            with self.subTest(status=status), self.assertRaises(HTTPException):
                domain.eligible_activity({**REGISTRATION, "status": status}, EVENT, NOW)

    def test_wrong_event_cancelled_event_and_before_start_are_rejected(self):
        for event, now in (({**EVENT, "id": "foreign"}, NOW), ({**EVENT, "status": "CANCELLED"}, NOW), (EVENT, NOW.replace(hour=11))):
            with self.subTest(event=event, now=now), self.assertRaises(HTTPException):
                domain.eligible_activity(REGISTRATION, event, now)

    def test_check_in_checks_responsibility_before_reading_or_inserting_presence(self):
        with patch.object(domain, "actor", return_value={"id": "organizer"}), patch.object(domain, "registration_detail", return_value=REGISTRATION), patch.object(domain, "event_detail", side_effect=HTTPException(403, "forbidden")) as event, patch.object(domain, "db") as database:
            with self.assertRaises(HTTPException):
                domain.check_in(type("Input", (), {"registrationId": "registration"})(), "Bearer organizer")
        event.assert_called_once_with("event", "Bearer organizer", managed=True)
        database.assert_not_called()

    def test_foreign_presence_detail_checks_managed_permission(self):
        with patch.object(domain, "actor", return_value={"id": "foreign"}), patch.object(domain, "registration_detail", return_value=REGISTRATION), patch.object(domain, "event_detail", side_effect=HTTPException(403, "forbidden")) as event, patch.object(domain, "attendance_for") as read:
            with self.assertRaises(HTTPException):
                domain.detail("registration", "Bearer foreign")
        event.assert_called_once_with("event", "Bearer foreign", managed=True)
        read.assert_not_called()


if __name__ == "__main__":
    unittest.main()
