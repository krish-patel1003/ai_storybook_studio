"""add generation_events table

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-06
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generation_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=True),
        sa.Column("output_tokens", sa.Integer, nullable=True),
        sa.Column("image_count", sa.Integer, nullable=True),
        sa.Column("char_count", sa.Integer, nullable=True),
        sa.Column("cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_foreign_key(
        "generation_events_user_id_fkey",
        "generation_events", "user",
        ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "generation_events_book_id_fkey",
        "generation_events", "book",
        ["book_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("generation_events_user_id_idx", "generation_events", ["user_id"])
    op.create_index("generation_events_book_id_idx", "generation_events", ["book_id"])
    op.create_index("generation_events_created_at_idx", "generation_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("generation_events")
