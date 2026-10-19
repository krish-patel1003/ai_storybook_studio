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
from src.generation.event_models import GenerationEvent

router = APIRouter()
security = HTTPBasic()

# ── Cost estimation constants ──────────────────────────────────────────────────
# Estimated per-book LLM spend (covers all pipeline calls for one book)
_LLM_PER_BOOK: dict[str, float] = {
    "gemini-3.5-flash":       0.008,
    "gemini-3.1-pro-preview": 0.180,
    "gemini-3.5-flash":       0.008,
    "gemini-3.5-flash":       0.006,
    "gemini-3.1-pro-preview":         0.140,
}
_DEFAULT_LLM_COST:      float = 0.010
_ILLUSTRATION_PER_PAGE: float = 0.070   # gemini-3-pro-image per image
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

@router.get("/elevenlabs-voices", dependencies=[Depends(require_admin)])
async def elevenlabs_voices() -> dict:
    """List the ElevenLabs voices available on the account (to discover preset voice_ids)."""
    from src.generation.elevenlabs import list_account_voices
    try:
        return {"voices": await list_account_voices()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"ElevenLabs list failed: {exc}")


@router.post("/test-results", dependencies=[Depends(require_admin)])
async def store_test_results(
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Store a load/scalability/resilience test report (posted by scripts/loadtest.py)."""
    from src.admin.models import TestRun
    run = TestRun(label=str(body.get("label", "load test"))[:200], summary=body)
    db.add(run)
    await db.commit()
    return {"id": str(run.id), "created_at": run.created_at.isoformat() if run.created_at else None}


@router.get("/test-results", dependencies=[Depends(require_admin)])
async def get_test_results(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
) -> dict:
    """Return the most recent test runs (newest first) for the admin dashboard."""
    from src.admin.models import TestRun
    rows = (
        await db.execute(select(TestRun).order_by(TestRun.created_at.desc()).limit(max(1, min(limit, 50))))
    ).scalars().all()
    return {
        "runs": [
            {
                "id": str(r.id),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "label": r.label,
                "summary": r.summary,
            }
            for r in rows
        ]
    }


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
        select(User.id, User.email, User.username, User.created_at,
               User.is_email_verified, User.google_id, User.last_seen_at)
        .order_by(User.created_at.desc()).limit(10)
    )).all()
    recent_users = [
        {
            "id":         str(r.id),
            "email":      r.email,
            "username":   r.username,
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
            # Arcade games run 100% in the browser (canvas + requestAnimationFrame),
            # store scores in the visitor's own session, and make no server/API/DB
            # calls — so they cost $0 in GCP compute, storage, or egress.
            "games":         0.0,
            "total":         grand_total,
        },
        "games_note": "Games run entirely client-side (browser compute) — no GCP cost.",
        "by_model":     by_model,
        "avg_per_book": avg_per_book,
        "total_books":  total_books,
    }


@router.get("/users")
async def list_users(
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """All users with book counts and real spend from generation_events."""
    user_rows = (await db.execute(
        select(
            User.id, User.email, User.username, User.created_at,
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

    # Real costs from generation_events, per user per type
    event_rows = (await db.execute(
        select(
            GenerationEvent.user_id,
            GenerationEvent.event_type,
            func.sum(GenerationEvent.cost_usd).label("cost"),
        )
        .group_by(GenerationEvent.user_id, GenerationEvent.event_type)
    )).all()

    user_event_costs: dict[str, dict[str, float]] = {}
    for r in event_rows:
        uid = str(r.user_id)
        if uid not in user_event_costs:
            user_event_costs[uid] = {}
        user_event_costs[uid][r.event_type] = float(r.cost or 0)

    # Fallback estimated LLM (for users with no events yet)
    model_rows = (await db.execute(
        select(Book.user_id, Book.model_name, func.count(Book.id).label("n"))
        .group_by(Book.user_id, Book.model_name)
    )).all()
    user_llm_est: dict[str, float] = {}
    for r in model_rows:
        uid = str(r.user_id)
        user_llm_est[uid] = user_llm_est.get(uid, 0.0) + _llm_cost(r.model_name) * r.n

    users = []
    for r in user_rows:
        uid   = str(r.id)
        evts  = user_event_costs.get(uid, {})
        has_events = bool(evts)

        real_llm   = round(evts.get("llm_text", 0.0), 4)
        real_ilus  = round(evts.get("image", 0.0), 4)
        real_aud   = round(evts.get("tts_gemini", 0.0) + evts.get("tts_elevenlabs", 0.0), 4)
        real_avatar= round(evts.get("avatar", 0.0), 4)
        real_total = round(sum(evts.values()), 4)

        # Estimated costs (old method) kept for comparison
        est_llm  = round(user_llm_est.get(uid, 0.0), 4)
        est_ilus = round(r.illustrated * _ILLUSTRATION_PER_PAGE, 4)
        est_aud  = round(r.narrated   * _AUDIO_PER_PAGE,         4)

        users.append({
            "id":                uid,
            "email":             r.email,
            "username":          r.username,
            "joined":            r.created_at.isoformat(),
            "last_seen":         r.last_seen_at.isoformat() if r.last_seen_at else None,
            "verified":          r.is_email_verified,
            "google":            r.google_id is not None,
            "books":             r.book_count,
            "illustrated_pages": r.illustrated,
            "narrated_pages":    r.narrated,
            "cost": {
                "llm":           real_llm   if has_events else est_llm,
                "illustrations": real_ilus  if has_events else est_ilus,
                "audio":         real_aud   if has_events else est_aud,
                "avatar":        real_avatar,
                "total":         real_total if has_events else round(est_llm + est_ilus + est_aud, 4),
                "from_events":   has_events,
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

    # Real costs from generation_events per book, per event type
    book_event_rows = (await db.execute(
        select(
            GenerationEvent.book_id,
            GenerationEvent.event_type,
            func.count(GenerationEvent.id).label("calls"),
            func.sum(GenerationEvent.cost_usd).label("cost"),
            func.sum(GenerationEvent.input_tokens).label("input_tokens"),
            func.sum(GenerationEvent.output_tokens).label("output_tokens"),
            func.sum(GenerationEvent.image_count).label("images"),
            func.sum(GenerationEvent.char_count).label("chars"),
        )
        .where(GenerationEvent.user_id == user_id)
        .group_by(GenerationEvent.book_id, GenerationEvent.event_type)
    )).all()

    book_real: dict[str, dict] = {}
    for r in book_event_rows:
        bid = str(r.book_id) if r.book_id else "__none__"
        if bid not in book_real:
            book_real[bid] = {}
        book_real[bid][r.event_type] = {
            "calls": r.calls,
            "cost":  round(float(r.cost or 0), 4),
            "input_tokens":  r.input_tokens,
            "output_tokens": r.output_tokens,
            "images": r.images,
            "chars":  r.chars,
        }

    # User-level event summary (includes avatar, unlinked events)
    user_event_rows = (await db.execute(
        select(
            GenerationEvent.event_type,
            GenerationEvent.model,
            func.count(GenerationEvent.id).label("calls"),
            func.sum(GenerationEvent.cost_usd).label("cost"),
            func.sum(GenerationEvent.input_tokens).label("input_tokens"),
            func.sum(GenerationEvent.output_tokens).label("output_tokens"),
            func.sum(GenerationEvent.image_count).label("images"),
        )
        .where(GenerationEvent.user_id == user_id)
        .group_by(GenerationEvent.event_type, GenerationEvent.model)
        .order_by(func.sum(GenerationEvent.cost_usd).desc())
    )).all()

    event_summary = [
        {
            "event_type":    r.event_type,
            "model":         r.model,
            "calls":         r.calls,
            "cost":          round(float(r.cost or 0), 4),
            "input_tokens":  r.input_tokens,
            "output_tokens": r.output_tokens,
            "images":        r.images,
        }
        for r in user_event_rows
    ]
    real_total_cost = round(sum(e["cost"] for e in event_summary), 4)
    has_events = bool(event_summary)

    books = []
    total_llm  = 0.0
    total_ilus = 0.0
    total_aud  = 0.0

    for r in book_rows:
        est = _compute_cost(r.model_name, r.illustrated, r.narrated)
        total_llm  += est["llm"]
        total_ilus += est["illustrations"]
        total_aud  += est["audio"]
        prompt = r.raw_prompt
        bid = str(r.id)
        real = book_real.get(bid, {})
        real_book_total = round(sum(v["cost"] for v in real.values()), 4)
        books.append({
            "id":          bid,
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
            "cost":        est,
            "real_cost":   real_book_total if real else None,
            "events":      real,
        })

    grand_est = round(total_llm + total_ilus + total_aud, 4)

    return {
        "user": {
            "id":        str(user.id),
            "email":     user.email,
            "username":  user.username,
            "joined":    user.created_at.isoformat(),
            "last_seen": user.last_seen_at.isoformat() if user.last_seen_at else None,
            "verified":  user.is_email_verified,
            "google":    user.google_id is not None,
            "active":    user.is_active,
        },
        "books": books,
        "event_summary": event_summary,
        "totals": {
            "books":             len(books),
            "illustrated_pages": sum(b["illustrated"] for b in books),
            "narrated_pages":    sum(b["narrated"] for b in books),
            "llm_cost":          round(total_llm,  4),
            "illustration_cost": round(total_ilus, 4),
            "audio_cost":        round(total_aud,  4),
            "total_cost":        grand_est,
            "real_total_cost":   real_total_cost if has_events else None,
        },
    }


@router.get("/events")
async def list_events(
    _: AdminDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Aggregated generation event stats — real spend by type, model, and day."""

    # By event type
    by_type = (await db.execute(
        select(
            GenerationEvent.event_type,
            func.count(GenerationEvent.id).label("calls"),
            func.sum(GenerationEvent.cost_usd).label("cost"),
            func.sum(GenerationEvent.input_tokens).label("input_tokens"),
            func.sum(GenerationEvent.output_tokens).label("output_tokens"),
            func.sum(GenerationEvent.image_count).label("images"),
            func.sum(GenerationEvent.char_count).label("chars"),
        )
        .group_by(GenerationEvent.event_type)
        .order_by(func.sum(GenerationEvent.cost_usd).desc())
    )).all()

    # By model
    by_model = (await db.execute(
        select(
            GenerationEvent.model,
            GenerationEvent.event_type,
            func.count(GenerationEvent.id).label("calls"),
            func.sum(GenerationEvent.cost_usd).label("cost"),
        )
        .group_by(GenerationEvent.model, GenerationEvent.event_type)
        .order_by(func.sum(GenerationEvent.cost_usd).desc())
    )).all()

    # Daily spend (last 30 days)
    daily = (await db.execute(
        select(
            cast(GenerationEvent.created_at, Date).label("day"),
            GenerationEvent.event_type,
            func.sum(GenerationEvent.cost_usd).label("cost"),
            func.count(GenerationEvent.id).label("calls"),
        )
        .where(GenerationEvent.created_at >= _since(30))
        .group_by(cast(GenerationEvent.created_at, Date), GenerationEvent.event_type)
        .order_by(cast(GenerationEvent.created_at, Date).desc())
    )).all()

    # Top spenders
    top_users = (await db.execute(
        select(
            GenerationEvent.user_id,
            User.email,
            func.sum(GenerationEvent.cost_usd).label("total_cost"),
            func.count(GenerationEvent.id).label("events"),
        )
        .join(User, User.id == GenerationEvent.user_id)
        .group_by(GenerationEvent.user_id, User.email)
        .order_by(func.sum(GenerationEvent.cost_usd).desc())
        .limit(20)
    )).all()

    total_cost = round(sum(float(r.cost or 0) for r in by_type), 4)

    return {
        "total_cost": total_cost,
        "by_type": [
            {
                "event_type":    r.event_type,
                "calls":         r.calls,
                "cost":          round(float(r.cost or 0), 4),
                "input_tokens":  r.input_tokens,
                "output_tokens": r.output_tokens,
                "images":        r.images,
                "chars":         r.chars,
            }
            for r in by_type
        ],
        "by_model": [
            {
                "model":      r.model,
                "event_type": r.event_type,
                "calls":      r.calls,
                "cost":       round(float(r.cost or 0), 4),
            }
            for r in by_model
        ],
        "daily": [
            {
                "day":        r.day.isoformat(),
                "event_type": r.event_type,
                "cost":       round(float(r.cost or 0), 4),
                "calls":      r.calls,
            }
            for r in daily
        ],
        "top_users": [
            {
                "user_id":    str(r.user_id),
                "email":      r.email,
                "total_cost": round(float(r.total_cost or 0), 4),
                "events":     r.events,
            }
            for r in top_users
        ],
    }


@router.patch("/users/{user_id}/bypass-limits", dependencies=[Depends(require_admin)])
async def toggle_bypass_limits(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Grant or revoke unlimited platform access for a user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.bypass_limits = not user.bypass_limits
    if user.bypass_limits:
        user.subscription_tier = "studio"
    await db.commit()
    return {"user_id": str(user_id), "email": user.email, "bypass_limits": user.bypass_limits}


@router.patch("/users/{user_id}/tier", dependencies=[Depends(require_admin)])
async def set_user_tier(
    user_id: UUID,
    tier: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set a user's subscription tier directly (support / testing).

    Valid tiers: free, storyteller, studio. Resets the page pool so the new
    tier's allowance takes effect immediately.
    """
    from src.billing.tiers import TIERS
    if tier not in TIERS:
        raise HTTPException(status_code=400, detail=f"Unknown tier '{tier}'. Valid: {', '.join(TIERS)}")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.subscription_tier = tier
    user.subscription_status = "active" if tier != "free" else None
    user.page_pool_used = 0
    # Reset the period usage counters so the new tier starts clean.
    user.avatars_used = 0
    user.avatars_reset_at = None
    await db.commit()
    return {"user_id": str(user_id), "email": user.email, "subscription_tier": user.subscription_tier}


@router.patch("/users/{user_id}/topup", dependencies=[Depends(require_admin)])
async def grant_topup_pages(
    user_id: UUID,
    pages: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Add prepaid top-up pages to a user (support / testing — mirrors a page-pack purchase)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.topup_pages_remaining = (user.topup_pages_remaining or 0) + int(pages)
    await db.commit()
    return {"user_id": str(user_id), "email": user.email, "topup_pages_remaining": user.topup_pages_remaining}


@router.post("/test-user", dependencies=[Depends(require_admin)])
async def upsert_test_user(
    email: str,
    password: str,
    tier: str = "free",
    username: str = "Test User",
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create (or reset) a verified test user at a given tier. Support/testing only."""
    from sqlalchemy import select as _select
    from src.auth.utils import hash_password
    from src.billing.tiers import TIERS
    if tier not in TIERS:
        raise HTTPException(status_code=400, detail=f"Unknown tier '{tier}'. Valid: {', '.join(TIERS)}")
    res = await db.execute(_select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if user is None:
        user = User(email=email, username=username)
        db.add(user)
    user.username = username
    user.password_hash = hash_password(password)
    user.is_email_verified = True
    user.email_verification_token = None
    user.subscription_tier = tier
    user.subscription_status = "active" if tier != "free" else None
    user.page_pool_used = 0
    user.bypass_limits = False
    await db.commit()
    await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email, "subscription_tier": user.subscription_tier}


@router.patch("/books/{book_id}/sample", dependencies=[Depends(require_admin)])
async def toggle_sample_book(
    book_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark or unmark a book as a featured sample (shown on landing page)."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    book.is_sample = not book.is_sample
    if book.is_sample:
        book.visibility = "public"
    await db.commit()
    return {"book_id": str(book_id), "is_sample": book.is_sample, "visibility": book.visibility}
