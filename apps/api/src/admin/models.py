import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models import Base


class TestRun(Base):
    """A stored load/scalability/resilience test run, shown on the admin
    /test-results dashboard. `summary` holds the full JSON report produced by
    scripts/loadtest.py."""

    __tablename__ = "test_run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="load test")
    summary: Mapped[dict] = mapped_column(JSONB, nullable=False)
