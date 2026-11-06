"""Durable mailbox/SMTP delivery, deduplication and bounded retries with a DLQ."""
import json
import os
import psycopg
import pika
from .delivery import validate_event

def db(): return psycopg.connect(connect_timeout=3,options="-c statement_timeout=5000")

def retry_attempt(headers):
    try: return min(3, max(0, int((headers or {}).get("attempt", 0))) + 1)
    except (ValueError, TypeError): return 1

def migrate():
    with db() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS deliveries(message_id uuid PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL,attempts int NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now())")
        conn.execute("ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS last_error text")


def process_delivery(payload, delivery, connect=db):
    validate_event(payload)
    failed = False
    with connect() as conn:
        conn.execute("INSERT INTO deliveries(message_id,payload,status) VALUES(%s,%s::jsonb,'PENDING') ON CONFLICT DO NOTHING", (payload["id"], json.dumps(payload)))
        row = conn.execute("SELECT status,attempts FROM deliveries WHERE message_id=%s FOR UPDATE", (payload["id"],)).fetchone()
        if row[0] == "SENT":
            return
        try:
            delivery.send(delivery.prepare(payload))
        except Exception:
            failed = True
            conn.execute("UPDATE deliveries SET status=CASE WHEN attempts+1>=3 THEN 'FAILED' ELSE 'PENDING' END,attempts=attempts+1,last_error='delivery_failed',updated_at=now() WHERE message_id=%s", (payload["id"],))
        else:
            conn.execute("UPDATE deliveries SET status='SENT',attempts=attempts+1,last_error=NULL,updated_at=now() WHERE message_id=%s", (payload["id"],))
    # Raise only after committing the attempt, so failures are visible and durable.
    if failed:
        raise RuntimeError("Notification delivery failed")

def consume(stop, delivery):
    while not stop.is_set():
        connection=None
        try:
            credentials=pika.PlainCredentials(os.environ["RABBITMQ_USER"],os.environ["RABBITMQ_PASSWORD"])
            connection=pika.BlockingConnection(pika.ConnectionParameters(host="rabbitmq",credentials=credentials,socket_timeout=3,blocked_connection_timeout=3))
            channel=connection.channel(); channel.exchange_declare(exchange="eventhub",exchange_type="topic",durable=True)
            channel.queue_declare(queue="notifications",durable=True)
            for kind in ("registration.#", "payment.#", "event.#"):
                channel.queue_bind(queue="notifications",exchange="eventhub",routing_key=kind)
            channel.queue_declare(queue="notifications.failed",durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.confirm_delivery()
            for method,properties,body in channel.consume("notifications",inactivity_timeout=1,auto_ack=False):
                if stop.is_set(): break
                if not method: continue
                try:
                    payload=json.loads(body)
                    process_delivery(payload, delivery)
                    channel.basic_ack(method.delivery_tag)
                except Exception:
                    tries=retry_attempt(properties.headers)
                    channel.basic_publish(exchange="",routing_key="notifications.failed" if tries>=3 else "notifications",body=body,properties=pika.BasicProperties(delivery_mode=2,headers={"attempt":tries}))
                    channel.basic_ack(method.delivery_tag)
                    stop.wait(1)
            channel.cancel()
        except Exception as error: print(json.dumps({"service":"notifications","worker":"consumer","error":type(error).__name__}),flush=True); stop.wait(3)
        finally:
            if connection and connection.is_open: connection.close()
