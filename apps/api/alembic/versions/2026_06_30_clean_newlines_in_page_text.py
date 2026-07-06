"""clean newlines from page text

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-30

Replace all newline characters in page.text with a single space and collapse
any resulting double-spaces.  Picture-book page text is always a single flowing
prose block — explicit line breaks cause rendering gaps in both the studio
preview and the reader.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Replace every newline (chr 10) with a space, then collapse runs of 2+
    # spaces into one, then trim leading/trailing whitespace.
    op.execute("""
        UPDATE page
        SET text = trim(
            regexp_replace(
                replace(text, chr(10), ' '),
                ' {2,}', ' ', 'g'
            )
        )
        WHERE text IS NOT NULL
          AND text LIKE '%' || chr(10) || '%'
    """)


def downgrade() -> None:
    pass  # text cleanup is not reversible
