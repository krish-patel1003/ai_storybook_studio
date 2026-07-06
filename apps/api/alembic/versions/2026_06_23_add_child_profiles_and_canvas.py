"""add child profiles, canvas_overlay, child_profile_id on book

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-23

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Child profile table
    op.execute("""
        CREATE TABLE IF NOT EXISTS child_profile (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            name        VARCHAR(100) NOT NULL,
            age         INTEGER NOT NULL,
            gender      VARCHAR(20) NOT NULL DEFAULT 'unspecified',
            grade_level VARCHAR(20) NOT NULL DEFAULT 'K',
            interests   JSONB NOT NULL DEFAULT '[]',
            reading_level VARCHAR(20) NOT NULL DEFAULT 'beginner',
            avatar_emoji  VARCHAR(10) NOT NULL DEFAULT '⭐',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_child_profile_user_id ON child_profile(user_id)")

    # Add child_profile_id to book
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS child_profile_id UUID REFERENCES child_profile(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_book_child_profile_id ON book(child_profile_id)")

    # Add canvas_overlay to page
    op.execute("""
        ALTER TABLE page
        ADD COLUMN IF NOT EXISTS canvas_overlay JSONB
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS canvas_overlay")
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS child_profile_id")
    op.execute("DROP TABLE IF EXISTS child_profile")
