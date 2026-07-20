"""add text_valign to page table

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-20
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "page",
        sa.Column("text_valign", sa.String(length=10), nullable=False, server_default="bottom"),
    )


def downgrade() -> None:
    op.drop_column("page", "text_valign")
