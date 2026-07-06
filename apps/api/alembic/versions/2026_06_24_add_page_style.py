"""add per-page style columns (font_size, font_family, text_color, text_mode)

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-24

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS font_size FLOAT DEFAULT NULL")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS font_family VARCHAR(50) DEFAULT NULL")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS text_color VARCHAR(20) DEFAULT NULL")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS text_mode SMALLINT DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS font_size")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS font_family")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS text_color")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS text_mode")
