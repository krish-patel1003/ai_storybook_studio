"""add audio_key to page

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-26

"""

from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE page
        ADD COLUMN IF NOT EXISTS audio_key VARCHAR;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE page
        DROP COLUMN IF EXISTS audio_key;
    """)
