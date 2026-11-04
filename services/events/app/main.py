from fastapi import FastAPI

from .api.health import router as health_router
from .observability import request_logging
from contextlib import asynccontextmanager
from .domain import router, migrate

@asynccontextmanager
async def lifespan(app):
    migrate()
    yield

app = FastAPI(title="EventHub events", version="0.2.0", lifespan=lifespan)
app.middleware("http")(request_logging)
app.include_router(health_router)
app.include_router(router)

