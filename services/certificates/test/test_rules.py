import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from app import domain


NOW = datetime(2026, 11, 10, 14, tzinfo=timezone.utc)
REGISTRATION = {"id": "registration", "userId": "participant", "eventId": "event", "activityId": "activity", "status": "CONFIRMED"}
EVENT = {"id": "event", "status": "PUBLISHED", "activities": [
    {"id": "activity", "startsAt": "2026-11-10T12:00:00Z", "endsAt": "2026-11-10T14:00:00Z"}]}
ATTENDANCE = {"registrationId": "registration", "userId": "participant", "eventId": "event", "activityId": "activity", "checkedInAt": "2026-11-10T12:00:00Z"}


class CertificateRules(unittest.TestCase):
    def test_eligible_at_activity_end(self):
        self.assertIsNone(domain.eligibility(REGISTRATION, EVENT, ATTENDANCE, NOW))

    def test_activity_must_have_ended(self):
        self.assertEqual(domain.eligibility(REGISTRATION, EVENT, ATTENDANCE, NOW.replace(hour=13)), "ACTIVITY_NOT_FINISHED")

    def test_presence_is_required(self):
        self.assertEqual(domain.eligibility(REGISTRATION, EVENT, None, NOW), "ATTENDANCE_REQUIRED")

    def test_all_attendance_identifiers_are_bound_to_registration(self):
        for key in ("registrationId", "userId", "eventId", "activityId"):
            with self.subTest(key=key):
                self.assertEqual(domain.eligibility(REGISTRATION, EVENT, {**ATTENDANCE, key: "foreign"}, NOW), "INVALID_ATTENDANCE")

    def test_terminal_and_pending_registration_is_ineligible(self):
        for status in ("PENDING_PAYMENT", "CANCELLED", "EXPIRED", "WAITLISTED"):
            with self.subTest(status=status):
                self.assertEqual(domain.eligibility({**REGISTRATION, "status": status}, EVENT, ATTENDANCE, NOW), "REGISTRATION_NOT_CONFIRMED")

    def test_cancelled_or_draft_event_is_ineligible(self):
        for status in ("CANCELLED", "DRAFT"):
            self.assertEqual(domain.eligibility(REGISTRATION, {**EVENT, "status": status}, ATTENDANCE, NOW), "EVENT_NOT_PUBLISHED")

    def test_invalid_dates_or_out_of_window_checkin_are_ineligible(self):
        for checked in ("2026-11-10T11:59:59Z", "2026-11-11T14:00:01Z", "2026-11-10T12:00:00", "not-a-date"):
            with self.subTest(checked=checked):
                self.assertEqual(domain.eligibility(REGISTRATION, EVENT, {**ATTENDANCE, "checkedInAt": checked}, NOW), "INVALID_ATTENDANCE")

    def test_foreign_participant_or_organizer_needs_managed_event(self):
        with patch.object(domain, "remote", side_effect=HTTPException(403, "forbidden")) as remote:
            with self.assertRaises(HTTPException):
                domain.authorize({"id": "other"}, REGISTRATION, "Bearer actor")
        remote.assert_called_once_with("EVENTS", "/events/event?managed=true", "Bearer actor")

    def test_owner_can_read_without_managed_permission(self):
        with patch.object(domain, "remote") as remote:
            domain.authorize({"id": "participant"}, REGISTRATION, "Bearer participant")
        remote.assert_not_called()

    def test_tampered_issuance_snapshot_is_invalid(self):
        snapshot = {"participantName": "Pessoa"}
        row = {"snapshot": {**snapshot, "participantName": "Alterado"}, "digest": domain.digest(snapshot)}
        self.assertEqual(domain.validity(row, REGISTRATION, EVENT, ATTENDANCE), "INTEGRITY_CHECK_FAILED")


if __name__ == "__main__":
    unittest.main()
