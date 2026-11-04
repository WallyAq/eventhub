import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

spec = importlib.util.spec_from_file_location("eventhub_certificate_domain_test", Path(__file__).parents[1] / "app" / "domain.py")
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)
pdf_spec = importlib.util.spec_from_file_location("eventhub_certificate_pdf_test", Path(__file__).parents[1] / "app" / "pdf.py")
pdf = importlib.util.module_from_spec(pdf_spec)
pdf_spec.loader.exec_module(pdf)


class CertificateTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.user_id, self.event_id, self.activity_id, self.registration_id = [str(uuid4()) for _ in range(4)]
        self.activity = {"id": self.activity_id, "title": "Oficina de testes", "startsAt": (self.now - timedelta(hours=3)).isoformat(),
                         "endsAt": (self.now - timedelta(hours=1)).isoformat()}
        self.event = {"id": self.event_id, "status": "PUBLISHED", "title": "Evento acadêmico", "organizationName": "Universidade",
                      "activities": [self.activity]}
        self.registration = {"id": self.registration_id, "userId": self.user_id, "eventId": self.event_id,
                             "activityId": self.activity_id, "status": "CONFIRMED"}
        self.attendance = {"id": str(uuid4()), "registrationId": self.registration_id, "userId": self.user_id,
                           "eventId": self.event_id, "activityId": self.activity_id,
                           "checkedInAt": (self.now - timedelta(hours=2)).isoformat()}
        self.subject = {"id": self.user_id, "name": "Pessoa Acadêmica"}
        self.snapshot = {"participantName": self.subject["name"], "eventId": self.event_id, "eventTitle": self.event["title"],
                         "activityId": self.activity_id, "activityTitle": self.activity["title"], "hours": 2,
                         "organizationName": "Universidade", "issuedAt": self.now.isoformat()}
        self.row = {"id": uuid4(), "registration_id": self.registration_id, "user_id": self.user_id,
                    "event_id": self.event_id, "activity_id": self.activity_id, "snapshot": self.snapshot,
                    "digest": domain.digest(self.snapshot), "verification_code": "b" * 64, "issued_at": self.now}

    def current(self):
        return self.registration, self.event, self.attendance

    def test_only_confirmed_completed_attended_activity_is_eligible(self):
        self.assertIsNone(domain.eligibility(*self.current(), self.now))
        for status in ("PENDING_PAYMENT", "WAITLISTED", "CANCELLED", "EXPIRED"):
            self.assertEqual(domain.eligibility({**self.registration, "status": status}, self.event, self.attendance, self.now),
                             "REGISTRATION_NOT_CONFIRMED")
        self.assertEqual(domain.eligibility(self.registration, self.event, None, self.now), "ATTENDANCE_REQUIRED")
        self.assertEqual(domain.eligibility(*self.current(), self.now - timedelta(hours=2)), "ACTIVITY_NOT_FINISHED")

    def test_attendance_must_belong_to_same_registration_and_schedule(self):
        for field in ("registrationId", "userId", "eventId", "activityId"):
            with self.subTest(field=field):
                self.assertEqual(domain.eligibility(self.registration, self.event, {**self.attendance, field: str(uuid4())}, self.now),
                                 "INVALID_ATTENDANCE")
        for stamp in ((self.now - timedelta(days=5)).isoformat(), "bad-date", self.now.replace(tzinfo=None).isoformat()):
            self.assertEqual(domain.eligibility(self.registration, self.event, {**self.attendance, "checkedInAt": stamp}, self.now),
                             "INVALID_ATTENDANCE")

    def test_cancelled_event_invalidates_certificate_even_when_registration_lags(self):
        self.assertEqual(domain.validity(self.row, self.registration, {**self.event, "status": "CANCELLED"}, self.attendance),
                         "EVENT_NOT_PUBLISHED")

    def test_digest_detects_snapshot_tampering(self):
        changed = {**self.row, "snapshot": {**self.snapshot, "hours": 99}}
        self.assertEqual(domain.validity(changed, *self.current()), "INTEGRITY_CHECK_FAILED")
        self.assertEqual(domain.digest({"a": 1, "b": 2}), domain.digest({"b": 2, "a": 1}))

    def test_foreign_reader_must_have_event_management_membership(self):
        with patch.object(domain, "remote", side_effect=HTTPException(403, "Denied")) as remote:
            with self.assertRaises(HTTPException) as raised:
                domain.authorize({"id": str(uuid4())}, self.registration, "Bearer organizer")
            self.assertEqual(raised.exception.status_code, 403)
            remote.assert_called_once_with("EVENTS", "/events/" + self.event_id + "?managed=true", "Bearer organizer")
        with patch.object(domain, "remote") as remote:
            domain.authorize(self.subject, self.registration, "Bearer owner")
            remote.assert_not_called()

    def test_issuance_retries_return_original_certificate_without_new_insert(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.side_effect = lambda sql, *args: SimpleNamespace(fetchone=lambda: self.row if sql.startswith("SELECT *") else None)
        with patch.object(domain, "remote", return_value={"user": self.subject}), \
                patch.object(domain, "current", return_value=self.current()), patch.object(domain, "db", return_value=conn):
            result = domain.issue(domain.Issue(registrationId=self.registration_id), "Bearer owner")
        self.assertEqual(result["certificate"]["id"], str(self.row["id"]))
        self.assertFalse(any(call.args[0].startswith("INSERT") for call in conn.execute.call_args_list))

    def test_issuance_rechecks_live_state_after_waiting_for_lock(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        cancelled = ({**self.registration, "status": "CANCELLED"}, self.event, self.attendance)
        with patch.object(domain, "remote", return_value={"user": self.subject}), \
                patch.object(domain, "current", side_effect=[self.current(), cancelled]), patch.object(domain, "db", return_value=conn):
            with self.assertRaises(HTTPException) as raised:
                domain.issue(domain.Issue(registrationId=self.registration_id), "Bearer owner")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertFalse(any(call.args[0].startswith("INSERT") for call in conn.execute.call_args_list))

    def test_issue_refuses_without_presence_before_opening_database(self):
        with patch.object(domain, "remote", return_value={"user": self.subject}), \
                patch.object(domain, "current", return_value=(self.registration, self.event, None)), patch.object(domain, "db") as db:
            with self.assertRaises(HTTPException) as raised:
                domain.issue(domain.Issue(registrationId=self.registration_id), "Bearer owner")
        self.assertEqual(raised.exception.status_code, 409)
        db.assert_not_called()

    def test_public_verification_exposes_no_identity_contact_or_registration_ids(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = self.row
        with patch.object(domain, "db", return_value=conn), patch.object(domain, "current", return_value=self.current()):
            result = domain.verify("b" * 64)
        self.assertTrue(result["valid"])
        self.assertEqual(set(result["certificate"]), {"id", "participantName", "eventTitle", "activityTitle", "organizationName", "hours", "issuedAt", "hash"})

    def test_dependency_failure_cannot_return_valid_certificate(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = self.row
        with patch.object(domain, "db", return_value=conn), \
                patch.object(domain, "current", side_effect=HTTPException(503, "Unavailable")):
            with self.assertRaises(HTTPException) as raised:
                domain.verify("b" * 64)
        self.assertEqual(raised.exception.status_code, 503)

    def test_download_checks_current_status_before_rendering(self):
        with patch.object(domain, "remote", return_value={"user": self.subject}), \
                patch.object(domain, "get_certificate", return_value=self.row), \
                patch.object(domain, "current", return_value=({**self.registration, "status": "CANCELLED"}, self.event, self.attendance)):
            with self.assertRaises(HTTPException) as raised:
                domain.authorized_certificate(self.row["id"], "Bearer owner")
        self.assertEqual(raised.exception.status_code, 409)

    def test_real_pdf_contains_pdf_header_and_nonempty_document(self):
        certificate = domain.serialize(self.row)
        certificate.update(startsAt=self.activity["startsAt"], endsAt=self.activity["endsAt"])
        output = pdf.render(certificate)
        self.assertTrue(output.startswith(b"%PDF-"))
        self.assertGreater(len(output), 3000)
        self.assertIn(b"/Type /Page", output)

    def test_pdf_dates_use_fortaleza_time_and_handle_day_rollover(self):
        self.assertEqual(pdf.date_label("2026-11-04T01:30:00Z"), "03/11/2026 às 22:30")
        self.assertEqual(pdf.date_label("2026-11-04T10:00:00-03:00"), "04/11/2026 às 10:00")
        with self.assertRaises(ValueError):
            pdf.date_label("2026-11-04T10:00:00")

    def test_pdf_duration_preserves_minutes_without_decimal_hour_noise(self):
        self.assertEqual(pdf.duration_label(240), "4 h")
        self.assertEqual(pdf.duration_label(90), "1 h 30 min")
        self.assertEqual(pdf.duration_label(59.1), "59 min 6 s")
        self.assertEqual(pdf.duration_label(0.001), "menos de 1 s")


if __name__ == "__main__":
    unittest.main()
