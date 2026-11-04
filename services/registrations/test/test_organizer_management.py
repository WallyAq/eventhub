import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

spec = importlib.util.spec_from_file_location("eventhub_organizer_registrations_test", Path(__file__).parents[1] / "app" / "domain.py")
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


class OrganizerManagementTests(unittest.TestCase):
    def setUp(self):
        self.event_id, self.activity_id, self.user_id = str(uuid4()), str(uuid4()), str(uuid4())
        self.now = datetime.now(timezone.utc)
        self.activity = {"id": self.activity_id, "title": "Atividade", "startsAt": (self.now + timedelta(days=1)).isoformat()}
        self.event = {"id": self.event_id, "startsAt": self.activity["startsAt"], "activities": [self.activity]}
        self.row = {"id": uuid4(), "user_id": self.user_id, "activity_id": self.activity_id,
                    "status": "CONFIRMED", "price_cents": 0, "expires_at": None, "created_at": self.now,
                    "snapshot": {"eventId": self.event_id, "activity": self.activity}}

    def test_unauthorized_event_is_checked_before_reading_registrations(self):
        with patch.object(domain, "managed_event", side_effect=HTTPException(404, "Sem vínculo")), \
                patch.object(domain, "event_registrations") as lookup:
            with self.assertRaises(HTTPException):
                domain.organizer_listing(uuid4(), "Bearer outsider", 1, 25)
            lookup.assert_not_called()

    def test_managed_event_explicitly_checks_organization_even_with_internal_key(self):
        with patch.object(domain, "remote", return_value={"event": self.event}) as remote:
            domain.managed_event(self.event_id, "Bearer organizer")
            remote.assert_called_once_with("EVENTS", "/events/" + self.event_id + "?managed=true", "Bearer organizer")

    def test_filters_are_parameterized_and_other_event_activity_rejected(self):
        where, values = domain.registration_filter(self.event, "CONFIRMED", self.activity_id)
        self.assertEqual(values, [self.event_id, "CONFIRMED", self.activity_id])
        self.assertNotIn(self.event_id, where)
        with self.assertRaises(HTTPException) as error:
            domain.registration_filter(self.event, None, uuid4())
        self.assertEqual(error.exception.status_code, 404)

    def test_csv_formula_prefixes_are_escaped_and_plain_values_unchanged(self):
        for value in ["=HYPERLINK(1)", "+CMD", "-1+1", "@SUM(A1)", "   =SUM(1)", "\tfoo", "\rfoo", "\nfoo"]:
            self.assertTrue(domain.safe_csv(value).startswith("'"))
        self.assertEqual(domain.safe_csv("Nome comum"), "Nome comum")
        self.assertEqual(domain.safe_csv(None), "")

    def test_participant_enrichment_limits_fields_and_caches_duplicate_user(self):
        user = {"id": self.user_id, "name": "Participante", "email": "test@example.test", "cpf": "secret", "password_hash": "secret"}
        with patch.object(domain, "remote", return_value={"user": user}) as remote:
            result = domain.participant_details([self.row, self.row])
        self.assertEqual(remote.call_count, 1)
        self.assertEqual(set(result[0]["participant"]), {"id", "name", "email"})

    def test_cancellation_stops_at_activity_start_but_terminal_retries_stay_idempotent(self):
        domain.require_cancellable(self.row, self.event)
        self.activity["startsAt"] = (self.now - timedelta(seconds=1)).isoformat()
        for status in ["CONFIRMED"]:
            with self.subTest(status=status), self.assertRaises(HTTPException) as error:
                domain.require_cancellable({**self.row, "status": status}, self.event)
            self.assertEqual(error.exception.status_code, 409)
        for status in ["PENDING_PAYMENT", "WAITLISTED", "CANCELLED", "EXPIRED"]:
            domain.require_cancellable({**self.row, "status": status}, self.event)

    def test_internal_event_snapshot_never_enriches_private_identity(self):
        with patch.object(domain, "secured"), patch.object(domain, "remote", return_value={"event": self.event}), \
                patch.object(domain, "event_registrations", return_value=([self.row], 1)) as listing, \
                patch.object(domain, "participant_details") as enrich:
            result = domain.internal_event_registrations(uuid4(), SimpleNamespace(headers={}), 100, 0)
        self.assertNotIn("participant", result["registrations"][0])
        enrich.assert_not_called()
        listing.assert_called_once_with(self.event, 100, 0, ascending=True)

    def test_export_requires_filters_instead_of_silently_truncating(self):
        with patch.object(domain, "managed_event", return_value=self.event), \
                patch.object(domain, "event_registrations", return_value=([], 10001)), \
                patch.object(domain, "participant_details") as enrich:
            with self.assertRaises(HTTPException) as error:
                domain.organizer_export(uuid4(), "Bearer organizer")
        self.assertEqual(error.exception.status_code, 409)
        enrich.assert_not_called()


if __name__ == "__main__":
    unittest.main()
