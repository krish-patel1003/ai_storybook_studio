"""add bg_color to page

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-30

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS bg_color VARCHAR(20) DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS bg_color")
