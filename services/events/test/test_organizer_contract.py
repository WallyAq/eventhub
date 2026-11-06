"""Organizer dialog contracts and public/private speaker data boundaries.

Run: python -m unittest discover -s services/events/test -v
"""
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError


spec = importlib.util.spec_from_file_location(
    "eventhub_events_domain_test", Path(__file__).parents[1] / "app" / "domain.py"
)
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


def event_input():
    start = datetime.now(timezone.utc) + timedelta(days=2)
    return {
        "organizationId": str(uuid4()), "title": "Evento acadêmico",
        "description": "Uma descrição para o evento.", "category": "Tecnologia",
        "hours": 2, "modality": "Presencial", "location": "Auditório",
        "streamUrl": "", "startsAt": start, "endsAt": start + timedelta(hours=2),
        "sessionTime": "Manhã", "speakers": [{"name": "Ana Silva", "institution": "UECE"}],
        "activities": [{
            "title": "Oficina prática", "startsAt": start,
            "endsAt": start + timedelta(hours=1), "location": "Sala 1",
            "responsible": "Responsável livre", "capacity": 10, "priceCents": 0,
        }],
    }


class OrganizerValidationTests(unittest.TestCase):
    def test_price_options_and_speaker_emission_contract(self):
        payload = event_input()
        speaker_id, rate_id = str(uuid4()), str(uuid4())
        payload['speakers'][0]['id'] = speaker_id
        payload['activities'][0]['speakerId'] = speaker_id
        payload['autoSpeakerCertificates'] = True
        rate = {'id': rate_id, 'lotName': 'Lote inicial', 'category': 'Graduação', 'priceCents': 2500,
                'startsAt': payload['startsAt'] - timedelta(days=1), 'endsAt': payload['startsAt']}
        payload['activities'][0]['priceOptions'] = [rate]
        value = domain.EventInput.model_validate(payload)
        self.assertEqual(value.activities[0].priceCents, 2500)
        self.assertTrue(value.autoSpeakerCertificates)
        for options, linked in (([rate, rate], True), ([{**rate, 'endsAt': payload['endsAt']}], True), ([rate], False)):
            bad = {**payload, 'activities': [{**payload['activities'][0], 'priceOptions': options,
                                             'speakerId': speaker_id if linked else None}]}
            with self.assertRaises(ValidationError): domain.EventInput.model_validate(bad)

    def test_legacy_payload_remains_accepted_with_defaults(self):
        value = domain.EventInput.model_validate(event_input())
        activity = value.activities[0]
        self.assertEqual(activity.kind, "Workshop")
        self.assertEqual(activity.description, "")
        self.assertTrue(activity.waitlistEnabled)
        self.assertIsNone(activity.speakerId)
        self.assertEqual(activity.responsible, "Responsável livre")
        self.assertIsNone(value.speakers[0].id)

    def test_speaker_link_derives_responsible_and_fields_survive_json(self):
        payload = event_input()
        speaker_id = str(uuid4())
        payload["speakers"][0].update(
            id=speaker_id, degree="Doutora", email="ana@example.org",
            biography="Pesquisadora e professora."
        )
        payload["activities"][0].update(
            speakerId=speaker_id, kind="Minicurso", description="Prática com dados.",
            waitlistEnabled=False, responsible="Nome diferente não confiável"
        )
        result = domain.EventInput.model_validate(payload).model_dump(mode="json")
        self.assertEqual(result["activities"][0]["responsible"], "Ana Silva")
        self.assertEqual(result["activities"][0]["speakerId"], speaker_id)
        self.assertEqual(result["activities"][0]["kind"], "Minicurso")
        self.assertFalse(result["activities"][0]["waitlistEnabled"])
        self.assertEqual(result["speakers"][0]["email"], "ana@example.org")
        self.assertEqual(result["speakers"][0]["degree"], "Doutora")
        self.assertEqual(result["speakers"][0]["biography"], "Pesquisadora e professora.")

    def test_duplicate_speaker_ids_are_rejected(self):
        payload = event_input()
        speaker_id = str(uuid4())
        payload["speakers"][0]["id"] = speaker_id
        payload["speakers"].append({"id": speaker_id, "name": "Outra pessoa", "institution": "UECE"})
        with self.assertRaises(ValidationError):
            domain.EventInput.model_validate(payload)

    def test_missing_speaker_reference_is_rejected(self):
        payload = event_input()
        payload["activities"][0]["speakerId"] = str(uuid4())
        with self.assertRaises(ValidationError):
            domain.EventInput.model_validate(payload)

    def test_unlinked_legacy_speakers_need_no_ids(self):
        payload = event_input()
        payload["speakers"].append({"name": "Outra pessoa", "institution": "UECE"})
        self.assertEqual(len(domain.EventInput.model_validate(payload).speakers), 2)

    def test_email_is_optional_but_malformed_or_whitespace_is_rejected(self):
        for email in (" ", "ana", "ana@localhost", "ana @example.org", "a@@example.org"):
            with self.subTest(email=email), self.assertRaises(ValidationError):
                domain.Speaker(name="Ana Silva", institution="UECE", email=email)
        self.assertEqual(domain.Speaker(name="Ana Silva", institution="UECE").email, "")

    def test_waitlist_flag_is_strict_boolean(self):
        for value in ("false", "true", 0, 1, None):
            payload = event_input()
            payload["activities"][0]["waitlistEnabled"] = value
            with self.subTest(value=value), self.assertRaises(ValidationError):
                domain.EventInput.model_validate(payload)

    def test_description_and_biography_reject_only_whitespace(self):
        payload = event_input()
        payload["activities"][0]["description"] = " \n "
        with self.assertRaises(ValidationError):
            domain.EventInput.model_validate(payload)
        with self.assertRaises(ValidationError):
            domain.Speaker(name="Ana Silva", institution="UECE", biography="  ")

    def test_new_fields_enforce_limits(self):
        for field, value in (("degree", "a" * 101), ("email", "a" * 250 + "@example.org"),
                             ("biography", "a" * 401)):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                domain.Speaker(name="Ana Silva", institution="UECE", **{field: value})
        for field, value in (("description", "a" * 5001), ("kind", "Outro")):
            payload = event_input()
            payload["activities"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValidationError):
                domain.EventInput.model_validate(payload)


class SpeakerPrivacyTests(unittest.TestCase):
    def setUp(self):
        self.event = domain.EventInput.model_validate(event_input()).model_dump(mode="json")
        self.event.update(id=str(uuid4()), status="PUBLISHED")
        self.event["speakers"][0]["email"] = "private@example.org"
        self.request = SimpleNamespace(headers={})

    def test_public_detail_hides_contact_even_with_a_token(self):
        for token in ("", "Bearer participant", "Bearer invalid"):
            with self.subTest(token=token), patch.object(domain, "get_event", return_value=self.event), \
                    patch.object(domain, "organization") as membership:
                result = domain.detail(uuid4(), self.request, authorization=token)
                self.assertNotIn("email", result["event"]["speakers"][0])
                membership.assert_not_called()
        self.assertEqual(self.event["speakers"][0]["email"], "private@example.org")

    def test_public_listing_hides_contact_without_mutating_persistence(self):
        connection = MagicMock()
        connection.execute.return_value.fetchall.return_value = [{"payload": self.event}]
        with patch.object(domain, "db") as database:
            database.return_value.__enter__.return_value = connection
            result = domain.listing()
        self.assertNotIn("email", result["events"][0]["speakers"][0])
        self.assertEqual(self.event["speakers"][0]["email"], "private@example.org")

    def test_managed_detail_requires_membership_before_returning_contact(self):
        with patch.object(domain, "get_event", return_value=self.event), \
                patch.object(domain, "organization", return_value={"name": "UECE"}) as membership:
            result = domain.detail(uuid4(), self.request, "Bearer owner", managed=True)
        membership.assert_called_once_with(self.event["organizationId"], "Bearer owner")
        self.assertEqual(result["event"]["speakers"][0]["email"], "private@example.org")

    def test_managed_detail_never_falls_back_on_auth_or_dependency_errors(self):
        for status in (401, 403, 404, 503):
            with self.subTest(status=status), patch.object(domain, "get_event", return_value=self.event), \
                    patch.object(domain, "organization", side_effect=HTTPException(status, "Denied")), \
                    self.assertRaises(HTTPException) as error:
                domain.detail(uuid4(), self.request, "Bearer invalid", managed=True)
            self.assertEqual(error.exception.status_code, status)

    def test_managed_detail_does_not_use_internal_key_as_membership(self):
        with patch.object(domain, "get_event", return_value=self.event), \
                patch.object(domain, "internal", return_value=True), \
                patch.object(domain, "organization", side_effect=HTTPException(401, "Denied")), \
                self.assertRaises(HTTPException):
            domain.detail(uuid4(), self.request, "", managed=True)

    def test_managed_listing_keeps_contacts_after_identity_lookup(self):
        connection = MagicMock()
        connection.execute.return_value.fetchall.return_value = [{"payload": self.event}]
        with patch.dict(domain.os.environ, {"IDENTITY_URL": "http://identity:3000"}), \
                patch.object(domain, "db") as database, \
                patch.object(domain, "remote", return_value={"organizations": [{"id": self.event["organizationId"]}]}) as identity:
            database.return_value.__enter__.return_value = connection
            result = domain.listing(managed=True, authorization="Bearer owner")
        identity.assert_called_once_with("http://identity:3000/organizations", "Bearer owner")
        self.assertEqual(result["events"][0]["speakers"][0]["email"], "private@example.org")

    def test_nonpublic_detail_still_requires_membership(self):
        self.event["status"] = "DRAFT"
        with patch.object(domain, "get_event", return_value=self.event), \
                patch.object(domain, "internal", return_value=False), \
                patch.object(domain, "organization", side_effect=HTTPException(401, "Denied")), \
                self.assertRaises(HTTPException):
            domain.detail(uuid4(), self.request, "")


class EventPersistenceTests(unittest.TestCase):
    def test_create_persists_enriched_fields_in_existing_json_payload(self):
        payload = event_input()
        speaker_id = str(uuid4())
        payload["speakers"][0].update(id=speaker_id, email="ana@example.org")
        payload["activities"][0].update(speakerId=speaker_id, waitlistEnabled=False)
        value = domain.EventInput.model_validate(payload)
        connection = MagicMock()
        with patch.object(domain, "db") as database, \
                patch.object(domain, "organization", return_value={"name": "UECE"}):
            database.return_value.__enter__.return_value = connection
            result = domain.save(value, "Bearer owner")
        stored = domain.json.loads(connection.execute.call_args.args[1][2])
        self.assertFalse(stored["activities"][0]["waitlistEnabled"])
        self.assertEqual(stored["activities"][0]["speakerId"], speaker_id)
        self.assertEqual(stored["activities"][0]["responsible"], "Ana Silva")
        self.assertEqual(result["event"]["speakers"][0]["email"], "ana@example.org")

    def test_published_and_cancelled_events_remain_immutable(self):
        for status in ("PUBLISHED", "CANCELLED"):
            payload = event_input()
            value = domain.EventInput.model_validate(payload)
            current = value.model_dump(mode="json")
            current["status"] = status
            connection = MagicMock()
            connection.execute.return_value.fetchone.return_value = {"payload": current}
            with self.subTest(status=status), patch.object(domain, "db") as database, \
                    patch.object(domain, "organization", return_value={"name": "UECE"}), \
                    self.assertRaises(HTTPException) as error:
                database.return_value.__enter__.return_value = connection
                domain.save(value, "Bearer owner", id=uuid4())
            self.assertEqual(error.exception.status_code, 409)
            self.assertFalse(any("UPDATE events" in call.args[0] for call in connection.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
