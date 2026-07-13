"""add bypass_limits to user table

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-13
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels = None
depends_on = None

TEST_USER_EMAIL = "patel.krish1003@gmail.com"


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "bypass_limits",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    # Grant unlimited access to the test user
    op.execute(
        f"UPDATE \"user\" SET bypass_limits = true, subscription_tier = 'creator' "
        f"WHERE email = '{TEST_USER_EMAIL}'"
    )


def downgrade() -> None:
    op.drop_column("user", "bypass_limits")
