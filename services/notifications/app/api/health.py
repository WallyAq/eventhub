import psycopg
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..database import check_database

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"service": "notifications", "status": "ok"}


@router.get("/ready")
def ready():
    try:
        check_database()
        return {"service": "notifications", "status": "ready", "database": "ok"}
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service": "notifications", "status": "unavailable"})


