"""
Admin dashboard API.
Protected by HTTP Basic Auth (username/password from config).
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import Date, cast, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.books.models import Book, Page
from src.config import settings
from src.database import get_db

router = APIRouter()
security = HTTPBasic()

# ── Cost estimation constants ──────────────────────────────────────────────────
# Estimated per-book LLM spend (covers all pipeline calls for one book)
_LLM_PER_BOOK: dict[str, float] = {
    "gemini-3.5-flash":       0.008,
    "gemini-3.1-pro-preview": 0.180,
    "gemini-2.0-flash":       0.008,
    "gemini-1.5-flash":       0.006,
    "gemini-1.5-pro":         0.140,
}
_DEFAULT_LLM_COST:      float = 0.010
_ILLUSTRATION_PER_PAGE: float = 0.040   # Imagen 3 per image
_AUDIO_PER_PAGE:        float = 0.100   # ElevenLabs ~500 chars @ $0.0002/char


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

def _llm_cost(model: str | None) -> float:
    return _LLM_PER_BOOK.get(model or "", _DEFAULT_LLM_COST)

def _compute_cost(model: str | None, illustrated: int, narrated: int) -> dict:
    llm  = round(_llm_cost(model), 4)
    ilus = round(illustrated * _ILLUSTRATION_PER_PAGE, 4)
    aud  = round(narrated   * _AUDIO_PER_PAGE,         4)
    return {"llm": llm, "illustrations": ilus, "audio": aud, "total": round(llm + ilus + aud, 4)}


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
    total_users    = await db.scalar(select(func.count(User.id))) or 0
    verified_users = await db.scalar(select(func.count(User.id)).where(User.is_email_verified.is_(True))) or 0
    google_users   = await db.scalar(select(func.count(User.id)).where(User.google_id.isnot(None))) or 0
    users_today    = await db.scalar(select(func.count(User.id)).where(User.created_at >= today_start)) or 0
    users_week     = await db.scalar(select(func.count(User.id)).where(User.created_at >= week_start)) or 0
    users_month    = await db.scalar(select(func.count(User.id)).where(User.created_at >= month_start)) or 0

    # ── Active users (last_seen_at — real sessions) ───────────────────────────
    active_today = await db.scalar(
        select(func.count(User.id)).where(User.last_seen_at >= today_start)
    ) or 0
    active_week = await db.scalar(
        select(func.count(User.id)).where(User.last_seen_at >= week_start)
    ) or 0
    active_month = await db.scalar(
        select(func.count(User.id)).where(User.last_seen_at >= month_start)
    ) or 0

    # ── Books ────────────────────────────────────────────────────────────────
    total_books    = await db.scalar(select(func.count(Book.id))) or 0
    complete_books = await db.scalar(select(func.count(Book.id)).where(Book.stage == "complete")) or 0
    books_today    = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= today_start)) or 0
    books_week     = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= week_start)) or 0
    books_month    = await db.scalar(select(func.count(Book.id)).where(Book.created_at >= month_start)) or 0

    # ── Pages ────────────────────────────────────────────────────────────────
    total_pages = await db.scalar(select(func.count(Page.id))) or 0
    illustrated = await db.scalar(select(func.count(Page.id)).where(Page.image_key.isnot(None))) or 0
    narrated    = await db.scalar(select(func.count(Page.id)).where(Page.audio_key.isnot(None))) or 0

    # ── Art style breakdown ───────────────────────────────────────────────────
    style_rows = (await db.execute(
        select(Book.art_style, func.count(Book.id).label("n"))
        .group_by(Book.art_style).order_by(func.count(Book.id).desc())
    )).all()
    art_styles = [{"style": r.art_style, "count": r.n} for r in style_rows]

    # ── Age range breakdown ───────────────────────────────────────────────────
    age_rows = (await db.execute(
        select(Book.age_range, func.count(Book.id).label("n"))
        .group_by(Book.age_range).order_by(func.count(Book.id).desc())
    )).all()
    age_ranges = [{"range": r.age_range, "count": r.n} for r in age_rows]

    # ── Model usage ───────────────────────────────────────────────────────────
    model_rows = (await db.execute(
        select(Book.model_name, func.count(Book.id).label("n"))
        .group_by(Book.model_name).order_by(func.count(Book.id).desc())
    )).all()
    models_used = [{"model": r.model_name, "count": r.n} for r in model_rows]

    # ── Recent signups ────────────────────────────────────────────────────────
    recent_user_rows = (await db.execute(
        select(User.id, User.email, User.pen_name, User.created_at,
               User.is_email_verified, User.google_id, User.last_seen_at)
        .order_by(User.created_at.desc()).limit(10)
    )).all()
    recent_users = [
        {
            "id":         str(r.id),
            "email":      r.email,
            "pen_name":   r.pen_name,
            "joined":     r.created_at.isoformat(),
            "last_seen":  r.last_seen_at.isoformat() if r.last_seen_at else None,
            "verified":   r.is_email_verified,
            "google":     r.google_id is not None,
        }
        for r in recent_user_rows
    ]

    # ── Recent books ──────────────────────────────────────────────────────────
    recent_book_rows = (await db.execute(
        select(Book.title, Book.raw_prompt, Book.stage, Book.art_style, Book.page_count, Book.created_at)
        .order_by(Book.created_at.desc()).limit(10)
    )).all()
    recent_books = [
        {
            "title":   r.title,
            "prompt":  r.raw_prompt[:80] + ("…" if len(r.raw_prompt) > 80 else ""),
            "stage":   r.stage,
            "style":   r.art_style,
            "pages":   r.page_count,
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
            "total":    total_users,
            "verified": verified_users,
            "google":   google_users,
            "today":    users_today,
            "week":     users_week,
            "month":    users_month,
            "active_today":  active_today,
            "active_week":   active_week,
            "active_month":  active_month,
        },
        "books": {
            "total":    total_books,
            "complete": complete_books,
            "today":    books_today,
            "week":     books_week,
            "month":    books_month,
        },
        "pages": {
            "total":       total_pages,
            "illustrated": illustrated,
            "narrated":    narrated,
        },
        "art_styles":    art_styles,
        "age_ranges":    age_ranges,
        "models_used":   models_used,
        "books_per_day": books_per_day,
        "recent_users":  recent_users,
        "recent_books":  recent_books,
    }


@router.get("/costs")
async def get_costs(
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Aggregate cost analytics across all books, broken down by model."""
    rows = (await db.execute(
        select(
            Book.model_name,
            func.count(distinct(Book.id)).label("books"),
            func.count(Page.id).filter(Page.image_key.isnot(None)).label("illustrated"),
            func.count(Page.id).filter(Page.audio_key.isnot(None)).label("narrated"),
        )
        .outerjoin(Page, Page.book_id == Book.id)
        .group_by(Book.model_name)
    )).all()

    by_model   = []
    total_llm  = 0.0
    total_ilus = 0.0
    total_aud  = 0.0
    total_books = 0

    for r in rows:
        llm  = round(_llm_cost(r.model_name) * r.books, 4)
        ilus = round(r.illustrated * _ILLUSTRATION_PER_PAGE, 4)
        aud  = round(r.narrated   * _AUDIO_PER_PAGE,         4)
        total_llm   += llm
        total_ilus  += ilus
        total_aud   += aud
        total_books += r.books
        by_model.append({
            "model":             r.model_name or "unknown",
            "books":             r.books,
            "illustrated_pages": r.illustrated,
            "narrated_pages":    r.narrated,
            "llm_cost":          llm,
            "illustration_cost": ilus,
            "audio_cost":        aud,
            "total":             round(llm + ilus + aud, 4),
        })

    grand_total  = round(total_llm + total_ilus + total_aud, 4)
    avg_per_book = round(grand_total / total_books, 4) if total_books else 0.0

    return {
        "totals": {
            "llm":           round(total_llm,  4),
            "illustrations": round(total_ilus, 4),
            "audio":         round(total_aud,  4),
            "total":         grand_total,
        },
        "by_model":     by_model,
        "avg_per_book": avg_per_book,
        "total_books":  total_books,
    }


@router.get("/users")
async def list_users(
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """All users with book counts and estimated spend."""
    user_rows = (await db.execute(
        select(
            User.id, User.email, User.pen_name, User.created_at,
            User.is_email_verified, User.google_id, User.last_seen_at,
            func.count(distinct(Book.id)).label("book_count"),
            func.count(Page.id).filter(Page.image_key.isnot(None)).label("illustrated"),
            func.count(Page.id).filter(Page.audio_key.isnot(None)).label("narrated"),
        )
        .outerjoin(Book, Book.user_id == User.id)
        .outerjoin(Page, Page.book_id == Book.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )).all()

    # Per-user, per-model book count → LLM cost
    model_rows = (await db.execute(
        select(Book.user_id, Book.model_name, func.count(Book.id).label("n"))
        .group_by(Book.user_id, Book.model_name)
    )).all()

    user_llm: dict[str, float] = {}
    for r in model_rows:
        uid = str(r.user_id)
        user_llm[uid] = user_llm.get(uid, 0.0) + _llm_cost(r.model_name) * r.n

    users = []
    for r in user_rows:
        uid  = str(r.id)
        llm  = round(user_llm.get(uid, 0.0), 4)
        ilus = round(r.illustrated * _ILLUSTRATION_PER_PAGE, 4)
        aud  = round(r.narrated   * _AUDIO_PER_PAGE,         4)
        users.append({
            "id":                uid,
            "email":             r.email,
            "pen_name":          r.pen_name,
            "joined":            r.created_at.isoformat(),
            "last_seen":         r.last_seen_at.isoformat() if r.last_seen_at else None,
            "verified":          r.is_email_verified,
            "google":            r.google_id is not None,
            "books":             r.book_count,
            "illustrated_pages": r.illustrated,
            "narrated_pages":    r.narrated,
            "cost": {
                "llm":           llm,
                "illustrations": ilus,
                "audio":         aud,
                "total":         round(llm + ilus + aud, 4),
            },
        })

    return {"users": users, "total": len(users)}


@router.get("/users/{user_id}")
async def get_user(
    user_id: UUID,
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Detailed stats for a single user: all their books with individual cost breakdowns."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    book_rows = (await db.execute(
        select(
            Book.id, Book.title, Book.raw_prompt, Book.model_name, Book.page_count,
            Book.art_style, Book.age_range, Book.stage, Book.created_at,
            func.count(Page.id).filter(Page.image_key.isnot(None)).label("illustrated"),
            func.count(Page.id).filter(Page.audio_key.isnot(None)).label("narrated"),
        )
        .outerjoin(Page, Page.book_id == Book.id)
        .where(Book.user_id == user_id)
        .group_by(Book.id)
        .order_by(Book.created_at.desc())
    )).all()

    books      = []
    total_llm  = 0.0
    total_ilus = 0.0
    total_aud  = 0.0

    for r in book_rows:
        cost = _compute_cost(r.model_name, r.illustrated, r.narrated)
        total_llm  += cost["llm"]
        total_ilus += cost["illustrations"]
        total_aud  += cost["audio"]
        prompt = r.raw_prompt
        books.append({
            "id":          str(r.id),
            "title":       r.title,
            "prompt":      prompt[:60] + ("…" if len(prompt) > 60 else ""),
            "model":       r.model_name,
            "page_count":  r.page_count,
            "art_style":   r.art_style,
            "age_range":   r.age_range,
            "stage":       r.stage,
            "created":     r.created_at.isoformat(),
            "illustrated": r.illustrated,
            "narrated":    r.narrated,
            "cost":        cost,
        })

    grand = round(total_llm + total_ilus + total_aud, 4)

    return {
        "user": {
            "id":        str(user.id),
            "email":     user.email,
            "pen_name":  user.pen_name,
            "joined":    user.created_at.isoformat(),
            "last_seen": user.last_seen_at.isoformat() if user.last_seen_at else None,
            "verified":  user.is_email_verified,
            "google":    user.google_id is not None,
            "active":    user.is_active,
        },
        "books": books,
        "totals": {
            "books":             len(books),
            "illustrated_pages": sum(b["illustrated"] for b in books),
            "narrated_pages":    sum(b["narrated"] for b in books),
            "llm_cost":          round(total_llm,  4),
            "illustration_cost": round(total_ilus, 4),
            "audio_cost":        round(total_aud,  4),
            "total_cost":        grand,
        },
    }
