from fastapi import FastAPI

from .api.health import router as health_router
from .observability import request_logging

app = FastAPI(title="EventHub registrations", version="0.1.0")
app.middleware("http")(request_logging)
app.include_router(health_router)

