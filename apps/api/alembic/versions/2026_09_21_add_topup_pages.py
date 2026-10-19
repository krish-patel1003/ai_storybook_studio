"""add topup_pages_remaining to user (prepaid page packs)

Revision ID: 0030
Revises: 0029
Create Date: 2026-09-21

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS topup_pages_remaining INTEGER NOT NULL DEFAULT 0
    """)


def downgrade() -> None:
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS topup_pages_remaining')
