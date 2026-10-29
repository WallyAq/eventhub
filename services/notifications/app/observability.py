import json
import logging
import re
import time
from uuid import uuid4

logger = logging.getLogger("uvicorn.error")


async def request_logging(request, call_next):
    candidate = request.headers.get("x-request-id", "")
    request_id = candidate if re.fullmatch(r"[a-zA-Z0-9-]{1,64}", candidate) else str(uuid4())
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    logger.info(json.dumps({
        "service": "notifications", "requestId": request_id,
        "method": request.method, "path": request.url.path,
        "status": response.status_code, "durationMs": round((time.monotonic() - start) * 1000),
    }))
    return response

