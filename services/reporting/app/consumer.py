"""At-least-once messages trigger fresh snapshots, never blind status transitions."""
import json
import os
from uuid import UUID

import pika
from .observability import trace_scope, log_event
from .domain import db, reconcile, remote


def apply_message(payload):
    with trace_scope(payload.get("correlationId") or payload.get("registrationId"), payload.get("requestId")):
        try:
            result = _apply_message(payload)
            log_event("message.processed" if result else "message.duplicate", messageId=payload.get("id"), registrationId=payload.get("registrationId"))
            return result
        except Exception as error:
            log_event("message.failed", messageId=payload.get("id"), registrationId=payload.get("registrationId"), error=type(error).__name__)
            raise


def _apply_message(payload):
    message_id = UUID(payload["id"])
    registration_id = UUID(payload["registrationId"])
    if not isinstance(payload.get("type"), str) or not payload["type"].startswith("registration."):
        raise ValueError("Unsupported message type")
    with db() as conn:
        # Claim and projection commit atomically; duplicate deliveries are harmless.
        claimed = conn.execute("INSERT INTO processed_messages(id) VALUES(%s) ON CONFLICT DO NOTHING RETURNING id",
                               (message_id,)).fetchone()
        if not claimed:
            return False
        registration = remote("REGISTRATIONS", "/internal/registrations/" + str(registration_id))["registration"]
        reconcile(conn, UUID(registration["eventId"]))
    return True


def parameters():
    if os.environ.get("RABBITMQ_URL"):
        params = pika.URLParameters(os.environ["RABBITMQ_URL"])
    else:
        params = pika.ConnectionParameters(host=os.environ.get("RABBITMQ_HOST", "rabbitmq"),
            credentials=pika.PlainCredentials(os.environ["RABBITMQ_USER"], os.environ["RABBITMQ_PASSWORD"]))
    params.socket_timeout = 3
    params.blocked_connection_timeout = 3
    params.connection_attempts = 1
    return params


def consume(stop):
    queue = os.environ.get("REPORTING_QUEUE", "eventhub.reporting")
    while not stop.is_set():
        connection = None
        try:
            connection = pika.BlockingConnection(parameters())
            channel = connection.channel()
            channel.exchange_declare(exchange="eventhub", exchange_type="topic", durable=True)
            channel.queue_declare(queue=queue, durable=True)
            channel.queue_bind(queue=queue, exchange="eventhub", routing_key="registration.#")
            channel.queue_declare(queue=queue + ".failed", durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.confirm_delivery()
            for method, properties, body in channel.consume(queue, inactivity_timeout=1, auto_ack=False):
                if stop.is_set():
                    break
                if not method:
                    continue
                try:
                    apply_message(json.loads(body))
                    channel.basic_ack(method.delivery_tag)
                except Exception as error:
                    tries = int((properties.headers or {}).get("attempt", 0)) + 1
                    channel.basic_publish(exchange="", routing_key=queue + ".failed" if tries >= 3 else queue,
                        body=body, properties=pika.BasicProperties(delivery_mode=2, message_id=properties.message_id,correlation_id=properties.correlation_id,headers={**(properties.headers or {}), "attempt": tries}), mandatory=True)
                    channel.basic_ack(method.delivery_tag)
                    print(json.dumps({"service": "reporting", "worker": "projection", "error": type(error).__name__,
                                      "attempt": tries}), flush=True)
                    stop.wait(1)
            channel.cancel()
        except Exception as error:
            print(json.dumps({"service": "reporting", "worker": "consumer", "error": type(error).__name__}), flush=True)
            stop.wait(3)
        finally:
            if connection and connection.is_open:
                connection.close()
