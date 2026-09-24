"""add brief_options to book so draft progress survives leaving /create

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-24

"""

from typing import Sequence, Union
from alembic import op


revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE book ADD COLUMN IF NOT EXISTS brief_options JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS brief_options")
