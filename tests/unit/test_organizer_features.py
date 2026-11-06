"""Feature contracts without network/DB dependencies; run with the service requirements installed."""
import base64
import importlib.util
import json
import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[2]


def module(service, name="domain"):
    package = "organizer_feature_" + service
    if package not in sys.modules:
        pkg = types.ModuleType(package)
        pkg.__path__ = [str(ROOT / "services" / service / "app")]
        sys.modules[package] = pkg
    fullname = package + "." + name
    if fullname not in sys.modules:
        spec = importlib.util.spec_from_file_location(fullname, ROOT / "services" / service / "app" / (name + ".py"))
        value = importlib.util.module_from_spec(spec)
        sys.modules[fullname] = value
        spec.loader.exec_module(value)
    return sys.modules[fullname]


events, registrations, attendance, certificates = [module(s) for s in ("events", "registrations", "attendance", "certificates")]
templates, speakers, pdf = [module("certificates", s) for s in ("templates", "speakers", "pdf")]


def connection():
    conn = MagicMock()
    conn.__enter__.return_value = conn
    return conn


def image_data():
    image = Image.new("RGBA", (120, 50), (40, 80, 180, 150))
    output = BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


class PricesAndCredentials(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.rate = {"id": str(uuid4()), "lotName": "Primeiro lote", "category": "Graduação", "priceCents": 1234,
                     "startsAt": (self.now - timedelta(days=1)).isoformat(), "endsAt": (self.now + timedelta(days=1)).isoformat()}
        self.activity = {"priceCents": 9999, "priceOptions": [self.rate]}

    def test_rate_is_authoritative_and_window_end_is_exclusive(self):
        self.assertEqual(registrations.selected_price(self.activity, UUID(self.rate["id"]), self.now), (1234, self.rate))
        for instant in (self.now - timedelta(days=2), datetime.fromisoformat(self.rate["endsAt"])):
            with self.assertRaises(HTTPException) as caught:
                registrations.selected_price(self.activity, self.rate["id"], instant)
            self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(registrations.selected_price(self.activity, self.rate["id"], datetime.fromisoformat(self.rate["startsAt"]))[0], 1234)

    def test_missing_foreign_and_unsolicited_rates_fail_closed(self):
        for activity, option in ((self.activity, None), (self.activity, uuid4()), ({"priceCents": 0}, uuid4())):
            with self.assertRaises(HTTPException):
                registrations.selected_price(activity, option, self.now)
        self.assertEqual(registrations.selected_price({"priceCents": 0}, None), (0, None))

    def test_price_validation_rejects_negative_float_naive_and_reverse_periods(self):
        for update in ({"priceCents": -1}, {"priceCents": 1.5}, {"priceCents": True}, {"category": "  "},
                       {"endsAt": self.rate["startsAt"]}, {"startsAt": self.now.replace(tzinfo=None)}):
            with self.subTest(update=update), self.assertRaises(ValidationError):
                events.PriceOption.model_validate({**self.rate, **update})

    def test_client_cannot_choose_arbitrary_charge(self):
        with self.assertRaises(ValidationError):
            registrations.Reservation(eventId=uuid4(), activityId=uuid4(), priceCents=1)

    def test_signed_credential_binds_user_and_activity(self):
        row = {"id": uuid4(), "user_id": uuid4(), "activity_id": uuid4()}
        with patch.dict(os.environ, {"INTERNAL_API_KEY": "test-only-key"}):
            original = registrations.credential(row)
            self.assertNotEqual(original, registrations.credential({**row, "user_id": uuid4()}))
            self.assertNotEqual(original, registrations.credential({**row, "activity_id": uuid4()}))
            self.assertTrue(original.startswith("eventhub:check-in:v1:"))

    def test_resolve_rejects_tampering_and_wrong_scope(self):
        row = {"id": uuid4(), "user_id": uuid4(), "activity_id": uuid4(), "snapshot": {"eventId": str(uuid4())}}
        conn = connection(); conn.execute.return_value.fetchone.return_value = row
        request = SimpleNamespace(headers={"x-internal-key": "test-only-key"})
        with patch.dict(os.environ, {"INTERNAL_API_KEY": "test-only-key"}), patch.object(registrations, "db", return_value=conn):
            valid = registrations.credential(row)
            for text, event_id, activity_id, status in ((valid[:-1] + ("0" if valid[-1] != "0" else "1"), row["snapshot"]["eventId"], row["activity_id"], 404),
                    (valid, uuid4(), row["activity_id"], 409), (valid, row["snapshot"]["eventId"], uuid4(), 409),
                    (valid[:-1] + "é", row["snapshot"]["eventId"], row["activity_id"], 400)):
                with self.subTest(status=status), self.assertRaises(HTTPException) as caught:
                    registrations.resolve_credential(registrations.ResolveCredential(credential=text, eventId=event_id, activityId=activity_id), request)
                self.assertEqual(caught.exception.status_code, status)
            with patch.object(registrations, "serialize", return_value={"id": str(row["id"])}):
                result = registrations.resolve_credential(registrations.ResolveCredential(credential=valid, eventId=row["snapshot"]["eventId"]), request)
            self.assertEqual(result["registration"]["id"], str(row["id"]))

    def test_resolve_authenticates_before_accessing_registration_or_database(self):
        value = attendance.CredentialInput(eventId=uuid4(), credential="x" * 120)
        with patch.object(attendance, "event_detail", side_effect=HTTPException(403)), patch.object(attendance, "remote") as remote:
            with self.assertRaises(HTTPException): attendance.resolve(value, "Bearer outsider")
            remote.assert_not_called()
        with patch.object(registrations, "db") as database, patch.dict(os.environ, {"INTERNAL_API_KEY": "test"}):
            with self.assertRaises(HTTPException):
                registrations.resolve_credential(registrations.ResolveCredential(eventId=uuid4(), credential="x" * 120), SimpleNamespace(headers={}))
            database.assert_not_called()


class TemplateContracts(unittest.TestCase):
    def test_images_are_decoded_and_normalized(self):
        value = templates.Template(background=image_data(), signatories=[{"name": "Ana Silva", "role": "Coordenação", "image": image_data()}])
        for data in (value.background, value.signatories[0].image):
            self.assertTrue(data.startswith("data:image/png;base64,"))
            with Image.open(BytesIO(base64.b64decode(data.split(",")[1]))) as image:
                self.assertEqual(image.format, "PNG")

    def test_urls_svg_corrupt_data_and_unknown_placeholders_are_rejected(self):
        for value in ("https://example.test/bg.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,bm90LWltYWdl"):
            with self.subTest(value=value), self.assertRaises(ValidationError): templates.Template(background=value)
        with self.assertRaises(ValidationError): templates.Template(body="Certificamos {{cpf}} neste evento.")
        with self.assertRaises(ValidationError): templates.Template(signatories=[{"name": "Ana Silva", "role": "Coordenação"}] * 3)

    def test_settings_authorize_before_read_and_cancelled_event_cannot_change(self):
        with patch.object(templates, "managed", side_effect=HTTPException(403)), patch.object(certificates, "db") as db:
            with self.assertRaises(HTTPException): templates.settings(uuid4(), "Bearer outsider")
            db.assert_not_called()
        with patch.object(templates, "managed", return_value={"status": "CANCELLED"}), patch.object(certificates, "db") as db:
            with self.assertRaises(HTTPException): templates.save_settings(uuid4(), templates.Template(), "Bearer organizer")
            db.assert_not_called()

    def test_renderer_escapes_markup_and_fits_long_text_and_two_signatures_on_one_page(self):
        import pymupdf
        template = templates.Template(title="CERTIFICADO " * 6, body=("{{name}} {{activity}} {{event}} " + "Texto acadêmico & comprovação. " * 15),
            background=image_data(), signatories=[{"name": "Coordenação " * 7, "role": "Organização " * 7, "image": image_data()}] * 2).model_dump()
        now = datetime.now(timezone.utc).isoformat()
        value = {"id": str(uuid4()), "hash": "a" * 64, "participantName": "<script>Ana & Silva</script>",
                 "activityTitle": "Oficina prática " * 8, "eventTitle": "Congresso acadêmico " * 7, "organizationName": "Universidade & Instituto",
                 "hours": 2, "startsAt": now, "endsAt": now, "issuedAt": now, "verificationUrl": "https://example.test/certificados/verificar/" + "b" * 64,
                 "certificateTemplate": template}
        rendered = pdf.render(value)
        self.assertTrue(rendered.startswith(b"%PDF-"))
        with pymupdf.open(stream=rendered, filetype="pdf") as document:
            self.assertEqual(len(document), 1)
            self.assertIn("<script>Ana & Silva</script>", document[0].get_text())
            self.assertGreaterEqual(len(document[0].get_image_info()), 2)


class AutomaticSpeakerCertificates(unittest.TestCase):
    def setUp(self):
        self.event_id, self.speaker_id, self.activity_id = [str(uuid4()) for _ in range(3)]
        self.now = datetime.now(timezone.utc)
        self.activity = {"id": self.activity_id, "speakerId": self.speaker_id, "title": "Oficina",
            "startsAt": (self.now - timedelta(hours=3)).isoformat(), "endsAt": (self.now - timedelta(hours=1)).isoformat()}
        self.event = {"id": self.event_id, "status": "PUBLISHED", "autoSpeakerCertificates": True,
            "title": "Evento", "organizationName": "Instituto", "speakers": [{"id": self.speaker_id, "name": "Ana Silva", "email": "private@example.test"}],
            "activities": [self.activity]}

    def test_worker_and_manual_retry_share_unique_issuance_and_frozen_template(self):
        conn = connection(); inserted = {}
        def execute(sql, params=None):
            if sql.startswith("INSERT INTO speaker_certificates"):
                key = params[1:4]
                if key in inserted: return SimpleNamespace(fetchone=lambda: None)
                inserted[key] = {"snapshot": json.loads(params[4]), "digest": params[5]}
                return SimpleNamespace(fetchone=lambda: {"id": params[0]})
            return SimpleNamespace(fetchone=lambda: None, fetchall=lambda: [])
        conn.execute.side_effect = execute
        template = templates.Template(title="Modelo original").model_dump()
        with patch.object(certificates, "db", return_value=conn), patch.object(certificates, "remote", return_value={"event": self.event}), patch.object(speakers, "template_for", return_value=template):
            self.assertEqual(speakers.issue_event(self.event_id), 1)
            template["title"] = "Modelo novo"
            self.assertEqual(speakers.issue_event(self.event_id), 0)
        snapshot = next(iter(inserted.values()))["snapshot"]
        self.assertEqual(snapshot["certificateTemplate"]["title"], "Modelo original")
        self.assertEqual(snapshot["hours"], 2)
        self.assertNotIn("email", json.dumps(snapshot))

    def test_no_issuance_for_disabled_cancelled_future_or_unlinked_activity(self):
        cases = [{**self.event, "autoSpeakerCertificates": False}, {**self.event, "status": "CANCELLED"},
                 {**self.event, "activities": [{**self.activity, "endsAt": (self.now + timedelta(hours=1)).isoformat()}]},
                 {**self.event, "activities": [{**self.activity, "speakerId": str(uuid4())}]}]
        for event in cases:
            conn = connection()
            with self.subTest(event=event), patch.object(certificates, "db", return_value=conn), patch.object(certificates, "remote", return_value={"event": event}), patch.object(speakers, "template_for", return_value={}):
                self.assertEqual(speakers.issue_event(self.event_id), 0)
                self.assertFalse(any(call.args[0].startswith("INSERT") for call in conn.execute.call_args_list))

    def test_public_verification_excludes_contacts_template_and_internal_ids_and_rechecks_cancellation(self):
        snapshot = {"participantName": "Ana Silva", "eventTitle": "Evento", "activityTitle": "Oficina", "organizationName": "Instituto", "hours": 2,
                    "issuedAt": self.now.isoformat(), "certificateTemplate": {"signatories": []}}
        row = {"id": uuid4(), "event_id": self.event_id, "activity_id": self.activity_id, "speaker_id": self.speaker_id,
               "snapshot": snapshot, "digest": certificates.digest(snapshot)}
        conn = connection(); conn.execute.side_effect = [SimpleNamespace(fetchone=lambda: None), SimpleNamespace(fetchone=lambda: row)]
        with patch.object(certificates, "db", return_value=conn), patch.object(certificates, "remote", return_value={"event": self.event}):
            result = certificates.verify("a" * 64)
        self.assertTrue(result["valid"])
        self.assertEqual(set(result["certificate"]), {"id", "participantName", "eventTitle", "activityTitle", "organizationName", "hours", "issuedAt", "hash"})
        self.assertEqual(speakers.validity(row, {**self.event, "status": "CANCELLED"}), "EVENT_NOT_PUBLISHED")
        self.assertEqual(speakers.validity({**row, "snapshot": {**snapshot, "hours": 99}}, self.event), "INTEGRITY_CHECK_FAILED")

    def test_manual_issuance_and_download_require_membership(self):
        with patch.object(speakers, "managed", side_effect=HTTPException(403)), patch.object(speakers, "issue_event") as issue:
            with self.assertRaises(HTTPException): speakers.generate(UUID(self.event_id), "Bearer outsider")
            issue.assert_not_called()
        with patch.object(speakers, "managed", return_value={**self.event, "status": "DRAFT"}), patch.object(speakers, "issue_event") as issue:
            with self.assertRaises(HTTPException): speakers.generate(UUID(self.event_id), "Bearer organizer")
            issue.assert_not_called()


if __name__ == "__main__":
    unittest.main()
