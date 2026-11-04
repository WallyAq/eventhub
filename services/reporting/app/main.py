import json
import logging
import re
import time
from contextlib import asynccontextmanager
from threading import Event, Thread
from uuid import uuid4

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .domain import db, migrate, router
from .consumer import consume


@asynccontextmanager
async def lifespan(app):
    migrate()
    stop = Event()
    thread = Thread(target=consume, args=(stop,), daemon=True)
    thread.start()
    yield
    stop.set()
    thread.join(timeout=6)


app = FastAPI(title="EventHub reporting", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.middleware("http")
async def request_logging(request, call_next):
    candidate = request.headers.get("x-request-id", "")
    request_id = candidate if re.fullmatch(r"[a-zA-Z0-9-]{1,64}", candidate) else str(uuid4())
    start = time.monotonic()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    logging.getLogger("uvicorn.error").info(json.dumps({"service": "reporting", "requestId": request_id,
        "method": request.method, "path": request.url.path, "status": response.status_code,
        "durationMs": round((time.monotonic() - start) * 1000)}))
    return response


@app.exception_handler(psycopg.Error)
async def database_error(request, error):
    return JSONResponse(status_code=503, content={"detail": "Serviço de relatórios indisponível."})


@app.get("/health")
def health():
    return {"service": "reporting", "status": "ok"}


@app.get("/ready")
def ready():
    try:
        with db() as conn:
            conn.execute("SELECT 1 FROM registration_projection LIMIT 1")
        return {"service": "reporting", "status": "ready", "database": "ok"}
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service": "reporting", "status": "unavailable"})
