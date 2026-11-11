from fastapi import FastAPI

from .api.health import router as health_router
from .observability import request_logging
from contextlib import asynccontextmanager
from threading import Event, Thread
from .domain import router, migrate, worker, expiry_worker

@asynccontextmanager
async def lifespan(app):
    migrate()
    stop=Event()
    threads=[Thread(target=target,args=(stop,),daemon=True) for target in (worker,expiry_worker)]
    for thread in threads: thread.start()
    yield
    stop.set()
    for thread in threads: thread.join(timeout=6)

app = FastAPI(title="EventHub registrations", version="0.2.0",lifespan=lifespan)
app.middleware("http")(request_logging)
app.include_router(health_router)
app.include_router(router)

