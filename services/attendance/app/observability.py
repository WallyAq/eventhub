"""Bounded correlation context for HTTP, thread-pool handlers and workers."""
import json
import logging
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import uuid4

SERVICE = "attendance"
_current = ContextVar("eventhub_trace", default=None)
logger = logging.getLogger("uvicorn.error")


def valid_id(value):
    return isinstance(value, str) and bool(re.fullmatch(r"[a-zA-Z0-9-]{1,64}", value))


def trace():
    value = _current.get()
    if value is None:
        identifier = str(uuid4())
        value = {"requestId": identifier, "correlationId": identifier}
        _current.set(value)
    return value


def bind_correlation(value):
    if valid_id(value):
        trace()["correlationId"] = value
    return trace()["correlationId"]


def headers():
    current = trace()
    return {"x-request-id": current["requestId"], "x-correlation-id": current["correlationId"]}


@contextmanager
def trace_scope(correlation_id=None, request_id=None):
    request_id = request_id if valid_id(request_id) else str(uuid4())
    correlation_id = correlation_id if valid_id(correlation_id) else request_id
    token = _current.set({"requestId": request_id, "correlationId": correlation_id})
    try:
        yield trace()
    finally:
        _current.reset(token)


def log_event(event, **fields):
    logger.info(json.dumps({"service": SERVICE, **trace(), "event": event, **fields}))


async def request_logging(request, call_next):
    request_id = request.headers.get("x-request-id")
    correlation_id = request.headers.get("x-correlation-id")
    with trace_scope(correlation_id, request_id) as current:
        request.state.request_id = current["requestId"]
        start, status = time.monotonic(), 500
        path = "/certificates/verify/[code]" if request.url.path.startswith("/certificates/verify/") else request.url.path
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers.update(headers())
            if SERVICE == "certificates":
                response.headers["Cache-Control"] = "no-store"
            return response
        finally:
            log_event("http.completed", method=request.method, path=path, status=status,
                      durationMs=round((time.monotonic() - start) * 1000))
