"""add narration_voice to page table

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-14
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("page", sa.Column("narration_voice", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("page", "narration_voice")
