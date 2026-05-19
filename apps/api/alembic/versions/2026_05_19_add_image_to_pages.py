"""add image fields to page and visual_seed to book

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-19

"""

from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE page
        ADD COLUMN IF NOT EXISTS image_data bytea,
        ADD COLUMN IF NOT EXISTS image_mime VARCHAR(50)
    """)
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS visual_seed INTEGER NOT NULL
        DEFAULT floor(random() * 2147483647)::integer
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS image_data")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS image_mime")
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS visual_seed")
