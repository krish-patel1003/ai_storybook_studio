"""add translations JSONB to book (cached reader translations)

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE book ADD COLUMN IF NOT EXISTS translations JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE book DROP COLUMN IF EXISTS translations")
