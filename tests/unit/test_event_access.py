import importlib
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'services' / 'events'))
domain = importlib.import_module('app.domain')
announcements = importlib.import_module('app.announcements')

USER = '11111111-1111-4111-8111-111111111111'
OTHER = '33333333-3333-4333-8333-333333333333'
ORG = '22222222-2222-4222-8222-222222222222'
EVENT = '44444444-4444-4444-8444-444444444444'


class EventAccessTests(unittest.TestCase):
    def setUp(self):
        self.event = {'id': EVENT, 'organizationId': ORG, 'ownerUserId': USER, 'status': 'PUBLISHED', 'speakers': [{'name': 'Speaker', 'email': 'private@example.test'}]}

    def test_same_institution_does_not_grant_another_organizers_event(self):
        for user in [
            {'id': OTHER, 'role': 'ORGANIZER', 'organizationId': ORG},
            {'id': USER, 'role': 'ORGANIZER', 'organizationId': OTHER},
            {'id': USER, 'role': 'PARTICIPANT', 'organizationId': ORG},
        ]:
            with patch.object(domain, 'actor', return_value=user), self.assertRaises(domain.HTTPException) as error:
                domain.event_access(self.event, 'Bearer session')
            self.assertEqual(error.exception.status_code, 403)

    def test_responsible_organizer_still_verifies_institution_membership(self):
        with patch.object(domain, 'actor', return_value={'id': USER, 'role': 'ORGANIZER', 'organizationId': ORG}), \
                patch.object(domain, 'organization', return_value={'id': ORG}) as membership:
            self.assertEqual(domain.event_access(self.event, 'Bearer session'), {'id': ORG})
            membership.assert_called_once_with(ORG, 'Bearer session')

    def test_managed_detail_cannot_bypass_responsibility_with_internal_key(self):
        request = MagicMock()
        request.headers = {'x-internal-key': 'test'}
        with patch.object(domain, 'get_event', return_value=self.event), patch.object(domain, 'event_access', side_effect=domain.HTTPException(403)) as guard, \
                self.assertRaises(domain.HTTPException):
            domain.detail(UUID(EVENT), request, 'Bearer other', True)
        guard.assert_called_once()

    def test_every_mutation_uses_responsibility_guard(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = {'payload': self.event}
        db = MagicMock()
        db.__enter__.return_value = conn
        with patch.object(domain, 'db', return_value=db), patch.object(domain, 'event_access', side_effect=domain.HTTPException(403)) as guard:
            with self.assertRaises(domain.HTTPException):
                domain.transition(UUID(EVENT), 'cancel', 'Bearer other')
            with self.assertRaises(domain.HTTPException):
                announcements.update(UUID(EVENT), MagicMock(), 'Bearer other')
            self.assertEqual(guard.call_count, 2)
        self.assertEqual(conn.execute.call_count, 2)

    def test_managed_listing_filters_institution_and_responsible(self):
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = []
        db = MagicMock()
        db.__enter__.return_value = conn
        with patch.object(domain, 'db', return_value=db), patch.object(domain, 'actor', return_value={'id': USER, 'role': 'ORGANIZER', 'organizationId': ORG}), \
                patch.object(domain, 'organization', return_value={'id': ORG}):
            self.assertEqual(domain.listing(True, 'Bearer session'), {'events': []})
        self.assertIn('owner_user_id=%s', conn.execute.call_args.args[0])
        self.assertEqual(conn.execute.call_args.args[1], (ORG, USER))

    def test_public_event_omits_operational_identity_and_speaker_email(self):
        result = domain.public_event(self.event)
        self.assertNotIn('ownerUserId', result)
        self.assertNotIn('email', result['speakers'][0])
        self.assertIn('ownerUserId', self.event)


if __name__ == '__main__':
    unittest.main()
