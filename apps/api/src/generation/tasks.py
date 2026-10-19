"""
Cloud Tasks integration for asynchronous book generation.

Generation takes 2–4 minutes. Running it inside the HTTP request holds a Cloud
Run instance for the whole job and blocks the client. Instead we:

  1. POST /books writes the Book record (stage=ENHANCING) and returns instantly.
  2. `enqueue_generation` pushes a Cloud Task that makes an authenticated HTTP
     POST to the internal worker endpoint. Because that is a *real inbound
     request*, Cloud Run keeps the instance's CPU allocated for the full job
     (up to the dispatch deadline) and Cloud Tasks retries if the instance dies
     mid-run — the resilience the previous synchronous flow lacked.
  3. The frontend polls GET /books/{id} until stage is COMPLETE or FAILED.

Security: the worker endpoint is publicly routable (the whole service is), so it
verifies the Cloud Tasks OIDC token in-process — signed by Google, audience ==
the worker URL, and email == our configured invoker service account.

When TASKS_ENABLED is false (local dev, or before the queue is provisioned) the
callers fall back to running generation inline, preserving the old behaviour.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from src.config import settings

logger = logging.getLogger(__name__)


def worker_url() -> str:
    """The absolute URL Cloud Tasks calls to run a generation job."""
    return f"{settings.API_URL.rstrip('/')}/books/_internal/generate"


def tasks_enabled() -> bool:
    return bool(
        settings.TASKS_ENABLED
        and settings.GCP_PROJECT_ID
        and settings.TASKS_INVOKER_SA
    )


async def enqueue_generation(
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    mode: str = "create",
) -> bool:
    """Enqueue a Cloud Task to generate the given book on a worker.

    Returns True if the task was enqueued, False if Cloud Tasks is not
    configured (caller should then run generation inline).
    """
    if not tasks_enabled():
        return False
    try:
        from google.cloud import tasks_v2

        client = tasks_v2.CloudTasksClient()
        parent = client.queue_path(
            settings.GCP_PROJECT_ID, settings.GCP_LOCATION, settings.TASKS_QUEUE
        )
        url = worker_url()
        body = json.dumps(
            {"book_id": str(book_id), "user_id": str(user_id), "mode": mode}
        ).encode()
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": url,
                "headers": {"Content-Type": "application/json"},
                "body": body,
                "oidc_token": {
                    "service_account_email": settings.TASKS_INVOKER_SA,
                    "audience": url,
                },
            },
            "dispatch_deadline": {
                "seconds": int(settings.TASKS_DISPATCH_DEADLINE_SECONDS)
            },
        }
        # The Cloud Tasks client is synchronous (gRPC) — run it off the event loop.
        await asyncio.to_thread(
            client.create_task, request={"parent": parent, "task": task}
        )
        logger.info("Enqueued generation task for book %s (mode=%s)", book_id, mode)
        return True
    except Exception:
        # If enqueue fails we do NOT want to silently drop the job — signal the
        # caller to fall back to inline generation so the book still gets made.
        logger.exception("Failed to enqueue generation task for book %s", book_id)
        return False


def verify_worker_request(authorization: str | None) -> None:
    """Verify an inbound request to the worker endpoint came from our Cloud
    Tasks queue. Raises HTTPException on any failure."""
    from fastapi import HTTPException

    if not tasks_enabled():
        # The worker endpoint only exists to serve Cloud Tasks; if tasks aren't
        # configured, refuse rather than expose an unauthenticated entry point.
        raise HTTPException(status_code=404, detail="Not found")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1]
    try:
        from google.auth.transport import requests as g_requests
        from google.oauth2 import id_token

        claims = id_token.verify_oauth2_token(
            token, g_requests.Request(), audience=worker_url()
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    email = claims.get("email")
    if email != settings.TASKS_INVOKER_SA or not claims.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Unauthorized principal")
