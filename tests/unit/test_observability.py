import asyncio
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from test_organizer_features import module, connection


class TraceTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_requests_and_thread_handlers_keep_separate_contexts(self):
        for service in ('events', 'registrations', 'attendance', 'certificates', 'notifications', 'reporting'):
            trace = module(service, 'observability')
            async def task(identifier):
                with trace.trace_scope(identifier, 'http-' + identifier):
                    await asyncio.sleep(.01)
                    result = await asyncio.to_thread(trace.headers)
                    self.assertEqual(result, {'x-correlation-id': identifier, 'x-request-id': 'http-' + identifier})
            await asyncio.gather(task('trace-A'), task('trace-B'))

    async def test_unsafe_identifiers_are_replaced_and_background_scopes_are_restored(self):
        trace = module('registrations', 'observability')
        with trace.trace_scope('outer', 'request-outer'):
            with trace.trace_scope('bad\nidentifier', 'x' * 65):
                self.assertTrue(trace.valid_id(trace.trace()['correlationId']))
                self.assertNotEqual(trace.trace()['correlationId'], 'outer')
            self.assertEqual(trace.trace()['correlationId'], 'outer')

    async def test_outbox_persists_registration_trace_even_from_a_different_request(self):
        domain = module('registrations'); trace = module('registrations', 'observability'); conn = connection()
        row = {'id': 'f10948b4-b8c8-4531-9092-38a97fe60405', 'user_id': '636a1517-d714-481c-bd06-165ba84dbd20', 'snapshot': {'correlationId': 'original-reservation'}}
        with trace.trace_scope('later-request', 'payment-operation'):
            domain.event_message(conn, row, 'payment.approved')
        payload = json.loads(conn.execute.call_args.args[1][1])
        self.assertEqual(payload['correlationId'], 'original-reservation')
        self.assertEqual(payload['requestId'], 'payment-operation')

    async def test_consumers_restore_durable_context_for_delivery_and_projection(self):
        payload = {'id': 'message', 'registrationId': 'registration', 'correlationId': 'stored-trace', 'requestId': 'stored-operation'}
        for service, public, implementation, args in [('notifications', 'process_delivery', '_process_delivery', (payload, MagicMock())), ('reporting', 'apply_message', '_apply_message', (payload,))]:
            consumer, trace = module(service, 'consumer'), module(service, 'observability')
            def applied(*args):
                self.assertEqual(trace.headers()['x-correlation-id'], 'stored-trace')
                self.assertEqual(trace.headers()['x-request-id'], 'stored-operation')
                return True
            with patch.object(consumer, implementation, side_effect=applied):
                getattr(consumer, public)(*args)

    async def test_report_curve_uses_creation_dates_in_fortaleza_and_does_not_invent_empty_days(self):
        reporting = module('reporting')
        event = {'id': 'event', 'title': 'Evento', 'status': 'PUBLISHED', 'activities': [{'id': 'activity', 'title': 'Atividade', 'capacity': 10}]}
        items = [{'id': str(index), 'activityId': 'activity', 'priceCents': 0, 'status': 'CONFIRMED', 'attended': False, 'createdAt': date} for index, date in enumerate(['2026-11-02T01:00:00Z', '2026-11-02T05:00:00Z'])]
        result = reporting.summarize(event, items, datetime.now(timezone.utc))
        self.assertEqual(result['registrationsByDay'], [{'day': '2026-11-01', 'count': 1}, {'day': '2026-11-02', 'count': 1}])

    async def test_retries_and_dead_letter_queue_preserve_broker_context(self):
        for service in ('notifications', 'reporting'):
            consumer = module(service, 'consumer')
            properties = consumer.pika.BasicProperties(message_id='original-message', correlation_id='original-trace', headers={'attempt': 2, 'x-request-id': 'original-operation'})
            channel, connection = MagicMock(), MagicMock()
            channel.consume.return_value = [(MagicMock(delivery_tag=7), properties, b'invalid-json')]
            connection.channel.return_value = channel
            connection.is_open = False
            stop = MagicMock(); stop.is_set.side_effect = [False, False, True]
            with patch.object(consumer.pika, 'BlockingConnection', return_value=connection), patch.dict(consumer.os.environ, {'RABBITMQ_USER': 'qa', 'RABBITMQ_PASSWORD': 'qa'}):
                if service == 'notifications': consumer.consume(stop, MagicMock())
                else: consumer.consume(stop)
            published = channel.basic_publish.call_args.kwargs
            self.assertTrue(published['routing_key'].endswith('.failed'))
            self.assertEqual(published['properties'].correlation_id, 'original-trace')
            self.assertEqual(published['properties'].message_id, 'original-message')
            self.assertEqual(published['properties'].headers['x-request-id'], 'original-operation')
            self.assertEqual(published['properties'].headers['attempt'], 3)
