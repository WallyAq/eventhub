import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from app import domain


NOW = datetime(2026, 11, 10, tzinfo=timezone.utc)
EVENT = {"id": "event", "title": "Evento", "status": "PUBLISHED", "activities": [
    {"id": "activity", "title": "Atividade", "capacity": 3}]}


def registration(identifier, status, amount=100, expires=None, attended=False):
    return {"id": identifier, "eventId": "event", "activityId": "activity", "status": status,
            "priceCents": amount, "expiresAt": expires, "attended": attended}


class ReportingRules(unittest.TestCase):
    def test_occupancy_excludes_expired_reservations_and_waitlist(self):
        rows = [registration("a", "CONFIRMED", attended=True), registration("b", "PENDING_PAYMENT", expires="2026-11-11T00:00:00Z"),
                registration("c", "PENDING_PAYMENT", expires="2026-11-09T00:00:00Z"), registration("d", "WAITLISTED", 0)]
        report = domain.summarize(EVENT, rows, NOW)
        self.assertEqual((report["capacity"], report["occupiedCount"], report["reservedCount"], report["availableCount"]), (3, 2, 1, 1))
        self.assertEqual(report["occupancyPercent"], 66.67)
        self.assertEqual(report["byStatus"]["EXPIRED"], 1)
        self.assertEqual(report["confirmedAttendanceCount"], 1)
        self.assertEqual(report["paidRegistrationCount"], 3)
        self.assertEqual(report["freeRegistrationCount"], 1)

    def test_bad_legacy_occupancy_is_explicit(self):
        report = domain.summarize(EVENT, [registration(str(i), "CONFIRMED") for i in range(4)], NOW)
        self.assertEqual(report["overCapacityCount"], 1)
        self.assertEqual(report["availableCount"], 0)

    def test_transactions_are_distinct_from_provider_approval(self):
        rows = [registration("a", "CONFIRMED"), registration("b", "EXPIRED"), registration("c", "PENDING_PAYMENT")]
        payments = [{"registrationId": "a", "status": "APPROVED", "providerStatus": "APPROVED", "amountCents": 100},
                    {"registrationId": "b", "status": "EXPIRED", "providerStatus": "APPROVED", "amountCents": 100}]
        with patch.object(domain, "remote", return_value={"payments": payments}) as remote:
            report = domain.payment_indicators(domain.summarize(EVENT, rows, NOW), rows)
        remote.assert_called_once_with("PAYMENTS", "/internal/payments/query", body={"registrationIds": ["a", "b", "c"]})
        self.assertEqual(report["payments"]["byStatus"]["APPROVED"], 1)
        self.assertEqual(report["payments"]["providerByStatus"]["APPROVED"], 2)
        self.assertEqual(report["payments"]["approvedAmountCents"], 100)
        self.assertEqual(report["payments"]["withoutTransactionCount"], 1)

    def test_payment_outage_does_not_discard_registration_report(self):
        rows = [registration("a", "CONFIRMED")]
        with patch.object(domain, "remote", side_effect=HTTPException(503, "offline")):
            report = domain.payment_indicators(domain.summarize(EVENT, rows, NOW), rows)
        self.assertEqual(report["total"], 1)
        self.assertEqual(report["occupiedCount"], 1)
        self.assertFalse(report["payments"]["available"])
        self.assertNotIn("byStatus", report["payments"])

    def test_unscoped_duplicate_and_mismatched_payments_are_unavailable(self):
        rows = [registration("a", "CONFIRMED")]
        good = {"registrationId": "a", "status": "APPROVED", "amountCents": 100}
        for payments in ([{**good, "registrationId": "foreign"}], [good, good], [{**good, "amountCents": 200}]):
            with self.subTest(payments=payments), patch.object(domain, "remote", return_value={"payments": payments}):
                report = domain.payment_indicators(domain.summarize(EVENT, rows, NOW), rows)
                self.assertFalse(report["payments"]["available"])

    def test_free_event_needs_no_payment_dependency(self):
        rows = [registration("a", "CONFIRMED", 0)]
        with patch.object(domain, "remote") as remote:
            report = domain.payment_indicators(domain.summarize(EVENT, rows, NOW), rows)
        remote.assert_not_called()
        self.assertTrue(report["payments"]["available"])
        self.assertEqual(report["payments"]["transactionCount"], 0)

    def test_query_uses_bounded_batches(self):
        rows = [registration(str(i), "CONFIRMED") for i in range(501)]
        with patch.object(domain, "remote", return_value={"payments": []}) as remote:
            domain.payment_indicators(domain.summarize(EVENT, rows, NOW), rows)
        self.assertEqual([len(call.kwargs["body"]["registrationIds"]) for call in remote.call_args_list], [500, 1])

    def test_report_and_export_authorize_before_any_database_read(self):
        for operation in (domain.report, domain.export):
            with self.subTest(operation=operation.__name__), patch.object(domain, "remote", side_effect=HTTPException(403, "forbidden")) as remote, patch.object(domain, "db") as database:
                with self.assertRaises(HTTPException) as error:
                    operation("foreign", "Bearer actor")
                self.assertEqual(error.exception.status_code, 403)
                remote.assert_called_once_with("EVENTS", "/events/foreign?managed=true", "Bearer actor")
                database.assert_not_called()

    def test_presence_from_different_owner_is_not_counted(self):
        rows = [{**registration("a", "CONFIRMED"), "userId": "owner"}]
        attendance = [{"registrationId": "a", "eventId": "event", "activityId": "activity", "userId": "foreign"}]
        self.assertFalse(domain.prepare_rows(EVENT, rows, attendance)[0]["attended"])

    def test_csv_does_not_execute_formulas(self):
        for value in ("=HYPERLINK()", " +1", "\t@SUM()", "-100"):
            self.assertTrue(domain.safe_csv(value).startswith("'"))


if __name__ == "__main__":
    unittest.main()
