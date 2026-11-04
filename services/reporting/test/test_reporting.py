import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

# Load a private package name to avoid collisions with other services' app modules.
package_spec = importlib.util.spec_from_file_location("eventhub_reporting_test", Path(__file__).parents[1] / "app" / "__init__.py",
    submodule_search_locations=[str(Path(__file__).parents[1] / "app")])
package = importlib.util.module_from_spec(package_spec)
sys.modules[package_spec.name] = package
package_spec.loader.exec_module(package)
domain_spec = importlib.util.spec_from_file_location("eventhub_reporting_test.domain", Path(__file__).parents[1] / "app" / "domain.py")
domain = importlib.util.module_from_spec(domain_spec)
sys.modules[domain_spec.name] = domain
domain_spec.loader.exec_module(domain)
consumer_spec = importlib.util.spec_from_file_location("eventhub_reporting_test.consumer", Path(__file__).parents[1] / "app" / "consumer.py")
consumer = importlib.util.module_from_spec(consumer_spec)
consumer_spec.loader.exec_module(consumer)


class ReportingTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.event_id, self.activity_id = [str(uuid4()) for _ in range(2)]
        self.event = {"id": self.event_id, "title": "Evento", "status": "PUBLISHED",
                      "activities": [{"id": self.activity_id, "title": "Oficina", "capacity": 10}]}

    def row(self, status="CONFIRMED", price=100, attended=False, expires=None):
        return {"id": str(uuid4()), "eventId": self.event_id, "activityId": self.activity_id,
                "userId": str(uuid4()), "status": status, "priceCents": price,
                "attended": attended, "expiresAt": expires}

    def test_totals_status_attendance_and_simulated_revenue(self):
        rows = [self.row(), self.row(price=0, attended=True), self.row("CANCELLED", 999, True),
                self.row("PENDING_PAYMENT", 300, expires=(self.now - timedelta(seconds=1)).isoformat()),
                self.row("WAITLISTED", 900)]
        result = domain.summarize(self.event, rows, self.now)
        self.assertEqual(result["total"], 5)
        self.assertEqual(result["byStatus"], {"CONFIRMED": 2, "CANCELLED": 1, "EXPIRED": 1, "PENDING_PAYMENT": 0, "WAITLISTED": 1})
        self.assertEqual(result["attendanceCount"], 2)
        self.assertEqual(result["confirmedAttendanceCount"], 1)
        self.assertEqual(result["simulatedRevenueCents"], 100)
        self.assertEqual(result["paymentMode"], "SIMULATED")
        self.assertTrue(result["complete"])

    def test_expired_pending_is_effective_expired_without_source_mutation(self):
        original = self.row("PENDING_PAYMENT", expires=(self.now - timedelta(seconds=1)).isoformat())
        self.assertEqual(domain.effective_status(original, self.now), "EXPIRED")
        self.assertEqual(original["status"], "PENDING_PAYMENT")
        for stamp in ("invalid", self.now.replace(tzinfo=None).isoformat()):
            with self.assertRaises(HTTPException):
                domain.effective_status({**original, "expiresAt": stamp}, self.now)

    def test_prepare_joins_presence_only_on_exact_registration_identity(self):
        row = self.row()
        mark = {"registrationId": row["id"], "eventId": row["eventId"], "activityId": row["activityId"], "userId": row["userId"]}
        self.assertTrue(domain.prepare_rows(self.event, [row], [mark])[0]["attended"])
        self.assertFalse(domain.prepare_rows(self.event, [row], [{**mark, "userId": str(uuid4())}])[0]["attended"])
        self.assertNotIn("userId", domain.prepare_rows(self.event, [row], [mark])[0])

    def test_foreign_event_snapshot_is_refused(self):
        with self.assertRaises(HTTPException) as raised:
            domain.prepare_rows(self.event, [{**self.row(), "eventId": str(uuid4())}], [])
        self.assertEqual(raised.exception.status_code, 503)

    def test_snapshot_pagination_rejects_changed_totals_or_duplicate_rows(self):
        rows = [{"id": str(uuid4())} for _ in range(500)]
        with patch.object(domain, "remote", side_effect=[{"total": 501, "registrations": rows}, {"total": 502, "registrations": [{"id": str(uuid4())}]}]):
            with self.assertRaises(HTTPException):
                domain.paginate("REGISTRATIONS", "/internal/events/id/registrations", "registrations")
        with patch.object(domain, "remote", return_value={"total": 2, "registrations": [rows[0], rows[0]]}):
            with self.assertRaises(HTTPException):
                domain.paginate("REGISTRATIONS", "/internal/events/id/registrations", "registrations")

    def test_snapshot_pagination_collects_all_pages(self):
        rows = [{"id": str(uuid4())} for _ in range(501)]
        with patch.object(domain, "remote", side_effect=[{"total": 501, "registrations": rows[:500]}, {"total": 501, "registrations": rows[500:]}]) as remote:
            result = domain.paginate("REGISTRATIONS", "/snapshot", "registrations")
        self.assertEqual(result, rows)
        self.assertTrue(remote.call_args_list[1].args[1].endswith("offset=500"))

    def test_authorization_failure_prevents_projection_access(self):
        with patch.object(domain, "remote", side_effect=HTTPException(403, "Denied")) as remote, patch.object(domain, "db") as db:
            with self.assertRaises(HTTPException) as raised:
                domain.report_for(self.event_id, "Bearer foreign")
        self.assertEqual(raised.exception.status_code, 403)
        remote.assert_called_once_with("EVENTS", "/events/" + self.event_id + "?managed=true", "Bearer foreign")
        db.assert_not_called()

    def test_csv_formula_protection_handles_whitespace_and_control_characters(self):
        for text in ("=HYPERLINK('x')", " +SUM(1,2)", "-1", "@call", "\tformula", "\rformula", "\nformula"):
            self.assertTrue(domain.safe_csv(text).startswith("'"))
        self.assertEqual(domain.safe_csv("Oficina acadêmica"), "Oficina acadêmica")

    def test_duplicate_message_does_not_read_dependencies_or_change_projection(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = None
        message = {"id": str(uuid4()), "registrationId": str(uuid4()), "type": "registration.confirmed"}
        with patch.object(consumer, "db", return_value=conn), patch.object(consumer, "remote") as remote, patch.object(consumer, "reconcile") as reconcile:
            self.assertFalse(consumer.apply_message(message))
        remote.assert_not_called()
        reconcile.assert_not_called()

    def test_out_of_order_message_reads_current_snapshot_instead_of_event_status(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = {"id": uuid4()}
        registration = self.row("CANCELLED")
        message = {"id": str(uuid4()), "registrationId": registration["id"], "type": "registration.confirmed"}
        with patch.object(consumer, "db", return_value=conn), \
                patch.object(consumer, "remote", return_value={"registration": registration}) as remote, \
                patch.object(consumer, "reconcile") as reconcile:
            self.assertTrue(consumer.apply_message(message))
        remote.assert_called_once_with("REGISTRATIONS", "/internal/registrations/" + registration["id"])
        reconcile.assert_called_once_with(conn, UUID(self.event_id))

    def test_failed_snapshot_does_not_claim_successful_message(self):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = {"id": uuid4()}
        registration = self.row()
        message = {"id": str(uuid4()), "registrationId": registration["id"], "type": "registration.confirmed"}
        with patch.object(consumer, "db", return_value=conn), \
                patch.object(consumer, "remote", return_value={"registration": registration}), \
                patch.object(consumer, "reconcile", side_effect=HTTPException(503, "Unavailable")):
            with self.assertRaises(HTTPException):
                consumer.apply_message(message)
        self.assertEqual(conn.__exit__.call_args.args[0], HTTPException)


from uuid import UUID

if __name__ == "__main__":
    unittest.main()
