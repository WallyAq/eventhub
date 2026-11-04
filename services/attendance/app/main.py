from contextlib import asynccontextmanager

from fastapi import FastAPI

from .domain import migrate, router
from .observability import request_logging


@asynccontextmanager
async def lifespan(app):
    migrate()
    yield


app = FastAPI(title="EventHub attendance", version="0.1.0", lifespan=lifespan)
app.middleware("http")(request_logging)
app.include_router(router)
