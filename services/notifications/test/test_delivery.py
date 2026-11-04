import json
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from app.delivery import Delivery, validate_event


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"id": str(uuid4()), "registrationId": str(uuid4()), "userId": str(uuid4()),
                        "type": "registration.confirmed", "version": 1}
        self.registration = {"id": self.payload["registrationId"], "userId": self.payload["userId"], "eventTitle": "Evento",
                             "activity": {"title": "Oficina"}, "status": "CONFIRMED"}
        self.requests = []

    def fetch(self, service, path):
        self.requests.append((service, path))
        if service == "REGISTRATIONS":
            return {"registration": self.registration}
        return {"user": {"id": self.payload["userId"], "email": "pessoa@example.test", "name": "Pessoa"}}

    def test_mailbox_composes_from_owning_apis_and_saves_private_message(self):
        with tempfile.TemporaryDirectory() as directory:
            delivery = Delivery({"MAILBOX_DIRECTORY": directory, "PUBLIC_APP_URL": "https://example.test"}, fetch=self.fetch)
            message = delivery.prepare(self.payload)
            delivery.send(message)
            stored = json.loads((Path(directory) / (self.payload["id"] + ".json")).read_text(encoding="utf-8"))
            self.assertEqual(stored["to"], "pessoa@example.test")
            self.assertIn("Oficina", stored["text"])
            self.assertIn("https://example.test/inscricoes/", stored["text"])
            self.assertEqual(self.requests[0][0], "REGISTRATIONS")
            self.assertEqual(self.requests[1][0], "IDENTITY")

    def test_owner_mismatch_and_unrecognized_events_cannot_send(self):
        self.registration["userId"] = str(uuid4())
        with self.assertRaisesRegex(ValueError, "owner mismatch"):
            Delivery({}, fetch=self.fetch).prepare(self.payload)
        with self.assertRaises(ValueError):
            validate_event({**self.payload, "id": "../../wrong"})
        with self.assertRaises(ValueError):
            validate_event({**self.payload, "type": "unexpected"})

    def test_smtp_starttls_acceptance_and_failure_propagation(self):
        calls = []

        class SMTP:
            def __init__(self, **options): calls.append(options)
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def starttls(self, **options): calls.append("starttls")
            def login(self, user, password): calls.append((user, password))
            def send_message(self, mail): calls.append(mail["Message-ID"]); return {}

        env = {"MAIL_MODE": "smtp", "SMTP_HOST": "smtp.example.test", "MAIL_FROM": "no-reply@example.test", "SMTP_USER": "demo", "SMTP_PASSWORD": "test-only"}
        delivery = Delivery(env, fetch=self.fetch, smtp_factory=SMTP)
        delivery.send(delivery.prepare(self.payload))
        self.assertIn("starttls", calls)
        self.assertIn("<" + self.payload["id"] + "@eventhub.local>", calls)

        class RejectingSMTP(SMTP):
            def send_message(self, mail): return {"pessoa@example.test": (550, b"refused")}

        with self.assertRaisesRegex(RuntimeError, "rejected recipient"):
            Delivery(env, fetch=self.fetch, smtp_factory=RejectingSMTP).send(delivery.prepare(self.payload))


if __name__ == "__main__": unittest.main()
