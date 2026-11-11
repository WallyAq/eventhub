import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app import consumer


class Stop:
    def __init__(self):
        self.stopped = False

    def is_set(self):
        return self.stopped

    def wait(self, _seconds):
        self.stopped = True


class NotificationRetryRules(unittest.TestCase):
    def channel(self, reject):
        operations = []
        channel = SimpleNamespace()
        for name in ("exchange_declare", "queue_declare", "queue_bind", "basic_qos", "confirm_delivery", "cancel"):
            setattr(channel, name, lambda **_kwargs: None)
        channel.consume = lambda *_args, **_kwargs: iter([(SimpleNamespace(delivery_tag=1), SimpleNamespace(headers={}, message_id="id", correlation_id="correlation"), b"{}")])
        def publish(**kwargs):
            operations.append(("publish", kwargs))
            if reject:
                raise RuntimeError("unroutable")
        channel.basic_publish = publish
        channel.basic_ack = lambda tag: operations.append(("ack", tag))
        return channel, operations

    def test_unroutable_retry_keeps_original_unacknowledged(self):
        for reject in (False, True):
            with self.subTest(reject=reject):
                channel, operations = self.channel(reject)
                connection = SimpleNamespace(channel=lambda: channel, is_open=True, close=lambda: None)
                with patch.dict("os.environ", {"RABBITMQ_USER": "qa", "RABBITMQ_PASSWORD": "qa"}), patch.object(consumer.pika, "BlockingConnection", return_value=connection), patch.object(consumer, "process_delivery", side_effect=RuntimeError("send failed")):
                    consumer.consume(Stop(), object())
                self.assertTrue(operations[0][1]["mandatory"])
                self.assertEqual([name for name, _ in operations], ["publish"] if reject else ["publish", "ack"])

    def test_attempt_headers_are_bounded_and_malformed_safe(self):
        self.assertEqual(consumer.retry_attempt(None), 1)
        self.assertEqual(consumer.retry_attempt({"attempt": "invalid"}), 1)
        self.assertEqual(consumer.retry_attempt({"attempt": -5}), 1)
        self.assertEqual(consumer.retry_attempt({"attempt": 100000}), 3)


if __name__ == "__main__":
    unittest.main()
