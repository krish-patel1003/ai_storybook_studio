"""add visibility to book

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-19

"""

from typing import Sequence, Union
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS visibility")
