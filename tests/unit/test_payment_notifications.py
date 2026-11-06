import copy
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
from test_organizer_features import module, connection

events = module('events')
announcements = module('events', 'announcements')
registrations = module('registrations')
delivery = module('notifications', 'delivery')


def event():
    return {'id': str(uuid4()), 'organizationId': str(uuid4()), 'status': 'PUBLISHED', 'modality': 'Presencial',
            'title': 'Evento acadêmico', 'description': 'Descrição acadêmica pública.', 'location': 'Campus A', 'streamUrl': '',
            'sessionTime': 'Manhã', 'startsAt': '2027-01-01T12:00:00Z', 'endsAt': '2027-01-01T16:00:00Z',
            'activities': [{'id': str(uuid4()), 'capacity': 1, 'priceCents': 2000}]}


class EventAnnouncementTests(unittest.TestCase):
    def test_public_update_and_notice_commit_together_without_changing_schedule_or_capacity(self):
        original = event(); current = copy.deepcopy(original); conn = connection()
        conn.execute.return_value.fetchone.return_value = {'payload': current}
        value = announcements.PublicInformation(**{k: original[k] for k in announcements.FIELDS})
        value.location = 'Campus B'
        with patch.object(events, 'db', return_value=conn), patch.object(events, 'organization'), patch.object(announcements, 'enqueue') as enqueue:
            result = announcements.update(uuid4(), value, 'Bearer owner')
        self.assertTrue(result['notificationsQueued'])
        self.assertEqual(current['location'], 'Campus B')
        self.assertEqual(current['activities'], original['activities'])
        self.assertEqual(current['startsAt'], original['startsAt'])
        enqueue.assert_called_once_with(conn, current, 'event.updated', ['location'])

    def test_same_public_information_does_not_send_another_notice(self):
        current = event(); conn = connection(); conn.execute.return_value.fetchone.return_value = {'payload': current}
        value = announcements.PublicInformation(**{k: current[k] for k in announcements.FIELDS})
        with patch.object(events, 'db', return_value=conn), patch.object(events, 'organization'), patch.object(announcements, 'enqueue') as enqueue:
            self.assertFalse(announcements.update(uuid4(), value)['notificationsQueued'])
        enqueue.assert_not_called()

    def test_unauthorized_cancelled_and_schedule_changes_are_rejected(self):
        current = event(); conn = connection(); conn.execute.return_value.fetchone.return_value = {'payload': current}
        data = {k: current[k] for k in announcements.FIELDS}
        with self.assertRaises(ValidationError): announcements.PublicInformation(**data, capacity=99)
        with patch.object(events, 'db', return_value=conn), patch.object(events, 'organization', side_effect=HTTPException(404)), patch.object(announcements, 'enqueue') as enqueue:
            with self.assertRaises(HTTPException): announcements.update(uuid4(), announcements.PublicInformation(**data))
            enqueue.assert_not_called()
        current['status'] = 'CANCELLED'
        with patch.object(events, 'db', return_value=conn), patch.object(events, 'organization'), self.assertRaises(HTTPException):
            announcements.update(uuid4(), announcements.PublicInformation(**data))

    def test_repeated_event_cancellation_enqueues_one_notice(self):
        current = event(); conn = connection(); conn.execute.return_value.fetchone.return_value = {'payload': current}
        with patch.object(events, 'db', return_value=conn), patch.object(events, 'organization'), patch.object(announcements, 'enqueue') as enqueue:
            events.transition(uuid4(), 'cancel', 'Bearer owner')
            events.transition(uuid4(), 'cancel', 'Bearer owner')
        enqueue.assert_called_once_with(conn, current, 'event.cancelled', ['status'])

    def test_announcement_failure_preserves_pending_outbox_for_recovery(self):
        conn = connection(); conn.execute.return_value.fetchall.return_value = [{'id': uuid4(), 'payload': {'eventId': str(uuid4())}}]
        with patch.object(events, 'db', return_value=conn), patch.dict(announcements.os.environ, {'REGISTRATIONS_URL': 'http://registrations', 'INTERNAL_API_KEY': 'test'}), patch.object(announcements.urllib.request, 'urlopen', side_effect=OSError):
            with self.assertRaises(OSError): announcements.deliver_once()
        self.assertFalse(any('UPDATE event_notification_outbox' in c.args[0] for c in conn.execute.call_args_list))


class PaymentNotificationTests(unittest.TestCase):
    def test_each_payment_result_has_one_notification_despite_callback_retries(self):
        for outcome, status, kind in [('APPROVED', 'CONFIRMED', 'payment.approved'), ('DECLINED', 'CANCELLED', 'payment.declined'),
                                      ('EXPIRED', 'EXPIRED', 'payment.expired'), ('APPROVED', 'EXPIRED', 'payment.expired')]:
            with self.subTest(outcome=outcome, status=status):
                row = {'id': str(uuid4()), 'user_id': str(uuid4()), 'activity_id': str(uuid4()), 'price_cents': 2000,
                       'status': 'PENDING_PAYMENT', 'snapshot': {'eventId': str(uuid4())}}
                conn = connection(); claimed = False
                def execute(sql, args=None):
                    nonlocal claimed
                    if sql.startswith('UPDATE registrations SET status=CASE'):
                        row['status'] = status
                    if sql.startswith('INSERT INTO payment_notification_receipts'):
                        first = not claimed; claimed = True
                        return SimpleNamespace(fetchone=lambda: {'registration_id': row['id']} if first else None)
                    return SimpleNamespace(fetchone=lambda: copy.deepcopy(row))
                conn.execute.side_effect = execute
                with patch.object(registrations, 'db', return_value=conn), patch.object(registrations, 'secured'), patch.object(registrations, 'remote', return_value={'event': {}}), patch.object(registrations, 'lock'), patch.object(registrations, 'maintain'), patch.object(registrations, 'serialize', return_value={}), patch.object(registrations, 'event_message') as messages:
                    registrations.payment(row['id'], registrations.Decision(outcome=outcome), None)
                    registrations.payment(row['id'], registrations.Decision(outcome=outcome), None)
                notifications = [c for c in messages.call_args_list if c.args[2].startswith('payment.')]
                self.assertEqual(len(notifications), 1)
                self.assertEqual(notifications[0].args[2], kind)
                self.assertEqual(notifications[0].args[3]['amountCents'], 2000)

    def test_free_registration_never_generates_a_payment_notification(self):
        conn = connection(); conn.execute.return_value.fetchone.return_value = {'price_cents': 0}
        with patch.object(registrations, 'db', return_value=conn), patch.object(registrations, 'secured'), self.assertRaises(HTTPException):
            registrations.payment(uuid4(), registrations.Decision(outcome='APPROVED'), None)

    def test_announcement_is_internal_scoped_and_idempotent(self):
        current = event()
        data = registrations.Announcement(id=uuid4(), eventId=current['id'], type='event.updated', occurredAt=datetime.now(timezone.utc),
            event={k: current[k] for k in announcements.FIELDS}, changedFields=['location'])
        with patch.object(registrations, 'secured', side_effect=HTTPException(401)), patch.object(registrations, 'db') as db:
            with self.assertRaises(HTTPException): registrations.announcement(data.eventId, data, None)
            db.assert_not_called()
        with patch.object(registrations, 'secured'), self.assertRaises(HTTPException): registrations.announcement(uuid4(), data, None)
        conn = connection(); conn.execute.return_value.fetchone.return_value = None
        with patch.object(registrations, 'secured'), patch.object(registrations, 'remote', return_value={'event': current}), patch.object(registrations, 'db', return_value=conn):
            self.assertTrue(registrations.announcement(data.eventId, data, None)['duplicate'])
        self.assertEqual(conn.execute.call_count, 1)


class NotificationContentTests(unittest.TestCase):
    def setUp(self):
        self.payload = {'id': str(uuid4()), 'registrationId': str(uuid4()), 'userId': str(uuid4()), 'version': 1}
        self.registration = {'id': self.payload['registrationId'], 'userId': self.payload['userId'], 'eventId': str(uuid4()),
            'eventTitle': 'Nome antigo', 'activity': {'title': 'Oficina'}, 'status': 'CANCELLED'}
        self.user = {'id': self.payload['userId'], 'name': 'Pessoa QA', 'email': 'qa@example.test'}
        self.mail = delivery.Delivery({}, fetch=lambda service, path: {'registration': self.registration} if service == 'REGISTRATIONS' else {'user': self.user})

    def test_payment_messages_include_result_amount_and_no_real_charge(self):
        for result, provider in [('approved', 'APPROVED'), ('declined', 'DECLINED'), ('expired', 'EXPIRED'), ('expired', 'APPROVED')]:
            payload = {**self.payload, 'type': 'payment.' + result, 'amountCents': 1234, 'providerStatus': provider, 'registrationStatus': 'CANCELLED'}
            message = self.mail.prepare(payload)
            self.assertIn('R$ 12,34', message['text'])
            self.assertIn('nenhuma cobrança real', message['text'])
            self.assertIn('Situação atual da inscrição: CANCELLED', message['text'])
            if result == 'expired' and provider == 'APPROVED': self.assertIn('não confirmou sua vaga', message['text'])

    def test_event_change_snapshot_and_cancellation_are_explicit_and_owner_checked(self):
        current = event(); current['title'] = 'Nome atualizado'; current['location'] = 'Campus B'
        payload = {**self.payload, 'type': 'event.updated', 'eventId': self.registration['eventId'], 'announcementId': str(uuid4()),
                   'event': {k: current[k] for k in announcements.FIELDS}, 'changedFields': ['title', 'location']}
        message = self.mail.prepare(payload)
        self.assertIn('Nome atualizado', message['text']); self.assertIn('Local geral: Campus B', message['text'])
        self.assertIn('não foram alterados', message['text'])
        self.assertIn('cancelou o evento', self.mail.prepare({**payload, 'type': 'event.cancelled', 'changedFields': ['status']})['text'])
        with self.assertRaises(ValueError): self.mail.prepare({**payload, 'eventId': str(uuid4())})


if __name__ == '__main__': unittest.main()
