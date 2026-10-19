"""add pages_charged to book (reserve-at-start page accounting)

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-01

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS pages_charged INTEGER NOT NULL DEFAULT 0
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS pages_charged")
