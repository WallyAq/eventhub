import json
import logging
import re
import time
from uuid import uuid4

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="EventHub registrations", version="0.1.0")
logger = logging.getLogger("uvicorn.error")


@app.middleware("http")
async def request_logging(request, call_next):
    candidate = request.headers.get("x-request-id", "")
    request_id = candidate if re.fullmatch(r"[a-zA-Z0-9-]{1,64}", candidate) else str(uuid4())
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    logger.info(json.dumps({
        "service": "registrations", "requestId": request_id,
        "method": request.method, "path": request.url.path,
        "status": response.status_code, "durationMs": round((time.monotonic() - start) * 1000),
    }))
    return response


@app.get("/health")
def health():
    return {"service": "registrations", "status": "ok"}


@app.get("/ready")
def ready():
    try:
        with psycopg.connect(connect_timeout=2, options="-c statement_timeout=2000") as conn:
            conn.execute("SELECT 1")
        return {"service": "registrations", "status": "ready", "database": "ok"}
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service": "registrations", "status": "unavailable"})

