"""add is_sample to book table

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-13
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "book",
        sa.Column(
            "is_sample",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.create_index("ix_book_is_sample", "book", ["is_sample"])


def downgrade() -> None:
    op.drop_index("ix_book_is_sample", table_name="book")
    op.drop_column("book", "is_sample")
