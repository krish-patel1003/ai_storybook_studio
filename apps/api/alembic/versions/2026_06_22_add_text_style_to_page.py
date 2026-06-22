"""add text_align and text_position to page

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-22

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE page
        ADD COLUMN IF NOT EXISTS text_align VARCHAR(10) NOT NULL DEFAULT 'center',
        ADD COLUMN IF NOT EXISTS text_position VARCHAR(10) NOT NULL DEFAULT 'bottom'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS text_align")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS text_position")
