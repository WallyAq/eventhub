from fastapi import FastAPI

from .api.health import router as health_router
from .observability import request_logging
from contextlib import asynccontextmanager
from threading import Event, Thread
from .consumer import migrate, consume
from .delivery import Delivery

@asynccontextmanager
async def lifespan(app):
    migrate()
    delivery=Delivery()
    stop=Event(); thread=Thread(target=consume,args=(stop,delivery),daemon=True); thread.start()
    yield
    stop.set(); thread.join(timeout=6)

app = FastAPI(title="EventHub notifications", version="0.2.0",lifespan=lifespan)
app.middleware("http")(request_logging)
app.include_router(health_router)

