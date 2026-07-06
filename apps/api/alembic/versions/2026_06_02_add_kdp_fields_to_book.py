"""add kdp_fields to book

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-02

"""

from typing import Sequence, Union
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS kdp_fields JSONB DEFAULT NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS kdp_fields")
