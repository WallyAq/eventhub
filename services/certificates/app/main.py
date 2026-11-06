import json
import logging
import re
import time
import threading
from contextlib import asynccontextmanager
from uuid import uuid4

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .domain import db, migrate, router
from . import templates, speakers


@asynccontextmanager
async def lifespan(app):
    migrate()
    templates.migrate()
    speakers.migrate()
    stop = threading.Event()
    thread = threading.Thread(target=speakers.worker, args=(stop,), daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=6)


app = FastAPI(title="EventHub certificates", version="0.1.0", lifespan=lifespan)
app.include_router(router)
app.include_router(templates.router)
app.include_router(speakers.router)


@app.middleware("http")
async def request_logging(request, call_next):
    candidate = request.headers.get("x-request-id", "")
    request_id = candidate if re.fullmatch(r"[a-zA-Z0-9-]{1,64}", candidate) else str(uuid4())
    start = time.monotonic()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["Cache-Control"] = "no-store"
    # Verification tokens are bearer-like public secrets; never include them in logs.
    path = "/certificates/verify/[code]" if request.url.path.startswith("/certificates/verify/") else request.url.path
    logging.getLogger("uvicorn.error").info(json.dumps({"service": "certificates", "requestId": request_id,
        "method": request.method, "path": path, "status": response.status_code,
        "durationMs": round((time.monotonic() - start) * 1000)}))
    return response


@app.exception_handler(psycopg.Error)
async def database_error(request, error):
    return JSONResponse(status_code=503, content={"detail": "Serviço de certificados indisponível."})


@app.get("/health")
def health():
    return {"service": "certificates", "status": "ok"}


@app.get("/ready")
def ready():
    try:
        with db() as conn:
            conn.execute("SELECT 1 FROM certificates LIMIT 1")
        return {"service": "certificates", "status": "ready", "database": "ok"}
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service": "certificates", "status": "unavailable"})
