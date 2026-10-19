"""add illustration_started to book (route continue → editor once pictures begun)

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-13

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS illustration_started BOOLEAN NOT NULL DEFAULT false
    """)
    # Backfill: any book that already has at least one illustrated page has
    # clearly started illustration.
    op.execute("""
        UPDATE book SET illustration_started = true
        WHERE id IN (SELECT DISTINCT book_id FROM page WHERE image_key IS NOT NULL)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS illustration_started")
