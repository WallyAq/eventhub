from fastapi import FastAPI

from .api.health import router as health_router
from .observability import request_logging
from contextlib import asynccontextmanager
from .domain import router, migrate
from . import announcements
from threading import Event, Thread

@asynccontextmanager
async def lifespan(app):
    migrate()
    announcements.migrate()
    stop = Event()
    thread = Thread(target=announcements.worker, args=(stop,), daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=6)

app = FastAPI(title="EventHub events", version="0.2.0", lifespan=lifespan)
app.middleware("http")(request_logging)
app.include_router(health_router)
app.include_router(router)
app.include_router(announcements.router)

