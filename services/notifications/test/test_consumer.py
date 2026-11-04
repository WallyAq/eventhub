import unittest
from uuid import uuid4
from app.consumer import process_delivery, retry_attempt


class ConsumerTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"id": str(uuid4()), "registrationId": str(uuid4()), "userId": str(uuid4()),
                        "type": "registration.confirmed", "version": 1}

    def connection(self, status="PENDING", attempts=0):
        statements = []

        class Connection:
            committed = False
            def __enter__(self): return self
            def __exit__(self, kind, value, trace): self.committed = kind is None
            def execute(self, sql, values): statements.append(sql); return self
            def fetchone(self): return (status, attempts)

        conn = Connection()
        return conn, statements

    def test_failed_delivery_commits_attempt_and_leaves_unsent_for_retry(self):
        conn, statements = self.connection()

        class Failing:
            def prepare(self, payload): return payload
            def send(self, payload): raise ConnectionError("SMTP unavailable")

        with self.assertRaisesRegex(RuntimeError, "delivery failed"):
            process_delivery(self.payload, Failing(), connect=lambda: conn)
        self.assertTrue(conn.committed)
        self.assertTrue(any("last_error='delivery_failed'" in sql for sql in statements))
        self.assertFalse(any("SET status='SENT'" in sql for sql in statements))

    def test_duplicate_sent_message_is_not_sent_twice(self):
        conn, statements = self.connection(status="SENT", attempts=1)

        class NeverSend:
            def prepare(self, payload): raise AssertionError("duplicate must not prepare or send")

        process_delivery(self.payload, NeverSend(), connect=lambda: conn)
        self.assertTrue(conn.committed)
        self.assertFalse(any("UPDATE deliveries" in sql for sql in statements))

    def test_success_marks_sent_after_send(self):
        conn, statements = self.connection()

        class Accepting:
            def prepare(self, payload): return payload
            def send(self, payload):
                if any("SET status='SENT'" in sql for sql in statements):
                    raise AssertionError("SENT recorded before SMTP accepted")

        process_delivery(self.payload, Accepting(), connect=lambda: conn)
        self.assertTrue(any("SET status='SENT'" in sql for sql in statements))
        self.assertTrue(conn.committed)

    def test_retry_header_is_bounded_and_malformed_values_do_not_loop_forever(self):
        self.assertEqual(retry_attempt(None), 1)
        self.assertEqual(retry_attempt({"attempt": 2}), 3)
        self.assertEqual(retry_attempt({"attempt": "invalid"}), 1)
        self.assertEqual(retry_attempt({"attempt": -100}), 1)
        self.assertEqual(retry_attempt({"attempt": 999}), 3)


if __name__ == "__main__": unittest.main()
