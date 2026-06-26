"""make uq_page_book_order deferrable so split/reorder ops work within a transaction

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-26

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE page
        DROP CONSTRAINT IF EXISTS uq_page_book_order;

        ALTER TABLE page
        ADD CONSTRAINT uq_page_book_order
            UNIQUE (book_id, "order")
            DEFERRABLE INITIALLY DEFERRED;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE page
        DROP CONSTRAINT IF EXISTS uq_page_book_order;

        ALTER TABLE page
        ADD CONSTRAINT uq_page_book_order
            UNIQUE (book_id, "order");
    """)
