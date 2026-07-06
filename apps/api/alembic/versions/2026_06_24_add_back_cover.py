"""add is_back_cover to page

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-24

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS is_back_cover BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS is_back_cover")
