"""add remake_count to page (per-page remake allowance)

Revision ID: 0031
Revises: 0030
Create Date: 2026-09-28

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE page
        ADD COLUMN IF NOT EXISTS remake_count INTEGER NOT NULL DEFAULT 0
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS remake_count")
