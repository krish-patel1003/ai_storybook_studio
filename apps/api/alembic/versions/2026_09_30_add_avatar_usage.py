"""add avatar usage metering columns to user

Revision ID: 0032
Revises: 0031
Create Date: 2026-09-30

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS avatars_used INTEGER NOT NULL DEFAULT 0
    """)
    op.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS avatars_reset_at TIMESTAMPTZ
    """)


def downgrade() -> None:
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS avatars_reset_at')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS avatars_used')
