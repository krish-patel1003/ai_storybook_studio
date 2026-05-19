"""add model columns to book

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-18

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS model_provider VARCHAR(20) NOT NULL DEFAULT 'gemini',
        ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) NOT NULL DEFAULT 'gemini-2.0-flash'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS model_provider")
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS model_name")
