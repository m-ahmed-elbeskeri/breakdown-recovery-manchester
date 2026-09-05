"""add pickup coordinates to bookings

The browser already geocodes the pickup address to draw a distance estimate;
before this it threw the result away. Keeping it lets the operator alert carry
a real map pin instead of a text search, which is the difference between a
driver arriving at the right lay-by and the right street name.

Both columns are nullable: geocoding is best-effort and must never be allowed
to block a booking from a frightened customer at the roadside.

Revision ID: 0002_pickup_coords
Revises: 0001_initial
Create Date: 2026-09-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_pickup_coords"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("pickup_lat", sa.Float(), nullable=True))
    op.add_column("bookings", sa.Column("pickup_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "pickup_lng")
    op.drop_column("bookings", "pickup_lat")
