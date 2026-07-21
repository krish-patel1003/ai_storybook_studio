"""
Lightweight per-user, per-day rate limiting for cheap-but-abusable pre-page
endpoints (brainstorm / expand / brief), backed by Redis.

Design notes:
- Keyed by user id + action + UTC day, so limits reset daily.
- Fail-OPEN: if Redis is unavailable we never block a real user.
- Users with `bypass_limits` (test/internal accounts) are exempt.
"""
from __future__ import annotations

from datetime import UTC, datetime

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException

from src.auth.models import User
from src.books.dependencies import current_user
from src.config import settings

_redis: aioredis.Redis | None = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def rate_limit(action: str, per_day: int):
    """FastAPI dependency: allow `per_day` calls to `action` per user per day."""

    async def _dep(user: User = Depends(current_user)) -> User:
        if getattr(user, "bypass_limits", False):
            return user
        day = datetime.now(UTC).strftime("%Y%m%d")
        key = f"rl:{action}:{user.id}:{day}"
        try:
            r = _client()
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, 60 * 60 * 26)  # ~26h — safely covers the UTC day
        except Exception:
            return user  # fail-open — never block on limiter errors
        if count > per_day:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"You've hit today's limit for this ({per_day}/day). "
                    "Please try again tomorrow, or upgrade your plan for more."
                ),
            )
        return user

    return _dep
