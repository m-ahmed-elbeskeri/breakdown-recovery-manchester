"""flag motorway / hard-shoulder jobs

Detected from the pickup the customer gives, and carried through to the
operator alert. It changes the price, but more importantly it changes how the
crew approaches: a live carriageway needs high-visibility kit, a different
stopping procedure, and National Highways or police notification.

Defaults to false and is non-nullable — every existing booking predates the
detection, and "unknown" is not a useful third state for a safety flag.

Revision ID: 0003_motorway
Revises: 0002_pickup_coords
Create Date: 2026-09-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_motorway"
down_revision: Union[str, None] = "0002_pickup_coords"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("motorway", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("bookings", "motorway")
