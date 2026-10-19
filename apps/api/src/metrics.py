"""
Prometheus metrics for the Storybook API.

HTTP request metrics (count, latency, status) are collected by
prometheus-fastapi-instrumentator (wired in main.py). This module adds
application-level business metrics that matter for alerting — generation
outcomes, quota reserve/refund, avatar generation, and unhandled errors — and
exposes helpers to increment them from anywhere in the codebase.

All metrics live on the default prometheus_client REGISTRY, so a single
generate_latest() in the /metrics route serves everything.
"""
from __future__ import annotations

from prometheus_client import Counter, Gauge

# ── Generation pipeline ────────────────────────────────────────────────────────
generation_total = Counter(
    "storybook_generation_total",
    "Book generation attempts, labelled by outcome.",
    ["result"],  # started | success | failure
)
generation_in_progress = Gauge(
    "storybook_generation_in_progress",
    "Book generations currently running on this instance.",
)

# ── Quota / billing ─────────────────────────────────────────────────────────────
pages_reserved_total = Counter(
    "storybook_pages_reserved_total",
    "Pages reserved from user pools at generation commit (reserve-at-start).",
)
pages_refunded_total = Counter(
    "storybook_pages_refunded_total",
    "Pages refunded to user pools after a failed generation (compensating action).",
)

# ── Avatars ─────────────────────────────────────────────────────────────────────
avatars_generated_total = Counter(
    "storybook_avatars_generated_total",
    "AI avatar images successfully generated.",
)

# ── Errors ──────────────────────────────────────────────────────────────────────
unhandled_errors_total = Counter(
    "storybook_unhandled_errors_total",
    "Unhandled exceptions caught by the global handler, by request path.",
    ["path"],
)


def record_generation_started() -> None:
    generation_total.labels(result="started").inc()
    generation_in_progress.inc()


def record_generation_finished(success: bool) -> None:
    generation_total.labels(result="success" if success else "failure").inc()
    try:
        generation_in_progress.dec()
    except Exception:
        pass


def record_pages_reserved(n: int) -> None:
    if n > 0:
        pages_reserved_total.inc(n)


def record_pages_refunded(n: int) -> None:
    if n > 0:
        pages_refunded_total.inc(n)


def record_avatar_generated() -> None:
    avatars_generated_total.inc()


def record_unhandled_error(path: str) -> None:
    try:
        unhandled_errors_total.labels(path=path or "unknown").inc()
    except Exception:
        pass
