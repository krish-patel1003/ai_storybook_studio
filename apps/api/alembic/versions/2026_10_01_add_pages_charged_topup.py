"""add pages_charged_topup to book (exact per-bucket refund split)

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-01

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE book
        ADD COLUMN IF NOT EXISTS pages_charged_topup INTEGER NOT NULL DEFAULT 0
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS pages_charged_topup")
