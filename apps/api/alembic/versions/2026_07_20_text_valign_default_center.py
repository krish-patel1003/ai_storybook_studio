"""default text_valign to center (and migrate existing rows)

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-20
"""
from typing import Union

from alembic import op

revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New default for future pages.
    op.alter_column("page", "text_valign", server_default="center")
    # The vertical-align feature is new; every existing row still has the old
    # 'bottom' default (no user deliberately chose it), so flip them to center.
    op.execute("UPDATE page SET text_valign = 'center' WHERE text_valign = 'bottom'")


def downgrade() -> None:
    op.alter_column("page", "text_valign", server_default="bottom")
