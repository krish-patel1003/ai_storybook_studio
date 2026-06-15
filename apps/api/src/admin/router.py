"""
Admin dashboard API.
Protected by HTTP Basic Auth (username/password from config).
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.books.models import Book, Page
from src.config import settings
from src.database import get_db

router = APIRouter()
security = HTTPBasic()


def require_admin(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    ok_user = secrets.compare_digest(
        credentials.username.encode(), settings.ADMIN_USERNAME.encode()
    )
    ok_pass = secrets.compare_digest(
        credentials.password.encode(), settings.ADMIN_PASSWORD.encode()
    )
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


AdminDep = Annotated[str, Depends(require_admin)]


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(UTC)

def _since(days: int) -> datetime:
    return _now() - timedelta(days=days)


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = _since(7)
    month_start = _since(30)

    # ── Users ────────────────────────────────────────────────────────────────
    total_users      = await db.scalar(select(func.count(User.id))) or 0
    verified_users   = await db.scalar(select(func.count(User.id)).where(User.is_email_verified.is_(True))) or 0
    google_users     = await db.scalar(select(func.count(User.id)).where(User.google_id.isnot(None))) or 0
    users_today      = await db.scalar(select(func.count(User.id)).where(User.created_at >= today_start)) or 0
    users_week       = await db.scalar(select(func.count(User.id)).where(User.created_at >= week_start)) or 0
    users_month      = await db.scalar(select(func.count(User.id)).where(User.created_at >= month_start)) or 0

    # ── Books ────────────────────────────────────────────────────────────────
    total_books      = await db.scalar(select(func.count(Book.id))) or 0
    complete_books   = await db.scalar(select(func.count(Book.id)).where(Book.stage == "complete")) or 0
    books_today      = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= today_start)) or 0
    books_week       = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= week_start)) or 0
    books_month      = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= month_start)) or 0

    # ── Pages ────────────────────────────────────────────────────────────────
    total_pages      = await db.scalar(select(func.count(Page.id))) or 0
    illustrated      = await db.scalar(select(func.count(Page.id)).where(Page.image_key.isnot(None))) or 0
    narrated         = await db.scalar(select(func.count(Page.id)).where(Page.audio_key.isnot(None))) or 0

    # ── Art style breakdown ───────────────────────────────────────────────────
    style_rows = (await db.execute(
        select(Book.art_style, func.count(Book.id).label("n"))
        .group_by(Book.art_style)
        .order_by(func.count(Book.id).desc())
    )).all()
    art_styles = [{"style": r.art_style, "count": r.n} for r in style_rows]

    # ── Age range breakdown ───────────────────────────────────────────────────
    age_rows = (await db.execute(
        select(Book.age_range, func.count(Book.id).label("n"))
        .group_by(Book.age_range)
        .order_by(func.count(Book.id).desc())
    )).all()
    age_ranges = [{"range": r.age_range, "count": r.n} for r in age_rows]

    # ── Model usage ───────────────────────────────────────────────────────────
    model_rows = (await db.execute(
        select(Book.model_name, func.count(Book.id).label("n"))
        .group_by(Book.model_name)
        .order_by(func.count(Book.id).desc())
    )).all()
    models_used = [{"model": r.model_name, "count": r.n} for r in model_rows]

    # ── Recent signups ────────────────────────────────────────────────────────
    recent_user_rows = (await db.execute(
        select(User.email, User.pen_name, User.created_at, User.is_email_verified, User.google_id)
        .order_by(User.created_at.desc())
        .limit(10)
    )).all()
    recent_users = [
        {
            "email": r.email,
            "pen_name": r.pen_name,
            "joined": r.created_at.isoformat(),
            "verified": r.is_email_verified,
            "google": r.google_id is not None,
        }
        for r in recent_user_rows
    ]

    # ── Recent books ──────────────────────────────────────────────────────────
    recent_book_rows = (await db.execute(
        select(Book.title, Book.raw_prompt, Book.stage, Book.art_style, Book.page_count, Book.created_at)
        .order_by(Book.created_at.desc())
        .limit(10)
    )).all()
    recent_books = [
        {
            "title": r.title,
            "prompt": r.raw_prompt[:80] + ("…" if len(r.raw_prompt) > 80 else ""),
            "stage": r.stage,
            "style": r.art_style,
            "pages": r.page_count,
            "created": r.created_at.isoformat(),
        }
        for r in recent_book_rows
    ]

    # ── Books-per-day (last 14 days) ──────────────────────────────────────────
    _day_col = cast(Book.created_at, Date).label("day")
    daily_rows = (await db.execute(
        select(_day_col, func.count(Book.id).label("n"))
        .where(Book.created_at >= _since(14))
        .group_by(cast(Book.created_at, Date))
        .order_by(cast(Book.created_at, Date))
    )).all()
    books_per_day = [{"day": r.day.strftime("%b %d"), "count": r.n} for r in daily_rows]

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "google": google_users,
            "today": users_today,
            "week": users_week,
            "month": users_month,
        },
        "books": {
            "total": total_books,
            "complete": complete_books,
            "today": books_today,
            "week": books_week,
            "month": books_month,
        },
        "pages": {
            "total": total_pages,
            "illustrated": illustrated,
            "narrated": narrated,
        },
        "art_styles": art_styles,
        "age_ranges": age_ranges,
        "models_used": models_used,
        "books_per_day": books_per_day,
        "recent_users": recent_users,
        "recent_books": recent_books,
    }
