"""add reference_image_key to character

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-19

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE character ADD COLUMN IF NOT EXISTS reference_image_key VARCHAR(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE character DROP COLUMN IF EXISTS reference_image_key")
