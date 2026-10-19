import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models import Base


class Purchase(Base):
    """A completed payment — a subscription charge or a top-up page-pack purchase.
    Recorded from the Stripe webhook; shown as billing history on the account page."""

    __tablename__ = "purchase"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)          # "subscription" | "topup"
    description: Mapped[str] = mapped_column(String(120), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="usd")
    tier: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Stripe invoice/session id — unique so repeated webhook deliveries don't duplicate rows.
    stripe_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
