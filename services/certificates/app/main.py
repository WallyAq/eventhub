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
from .observability import request_logging
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


app.middleware("http")(request_logging)


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
