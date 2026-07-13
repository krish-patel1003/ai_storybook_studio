"""add subscription fields to user table

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-08
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("stripe_customer_id", sa.String(64), nullable=True))
    op.add_column("user", sa.Column("stripe_subscription_id", sa.String(64), nullable=True))
    op.add_column("user", sa.Column("subscription_tier", sa.String(32), nullable=False, server_default="free"))
    op.add_column("user", sa.Column("subscription_status", sa.String(32), nullable=True))
    op.add_column("user", sa.Column("subscription_period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user", sa.Column("page_pool_used", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("user", sa.Column("page_pool_reset_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_user_stripe_customer_id", "user", ["stripe_customer_id"], unique=True)
    op.create_index("ix_user_stripe_subscription_id", "user", ["stripe_subscription_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_stripe_subscription_id", table_name="user")
    op.drop_index("ix_user_stripe_customer_id", table_name="user")
    op.drop_column("user", "page_pool_reset_at")
    op.drop_column("user", "page_pool_used")
    op.drop_column("user", "subscription_period_end")
    op.drop_column("user", "subscription_status")
    op.drop_column("user", "subscription_tier")
    op.drop_column("user", "stripe_subscription_id")
    op.drop_column("user", "stripe_customer_id")
