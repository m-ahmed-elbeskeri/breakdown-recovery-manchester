"""drivers: availability, live position, the job in hand

Backs the driver console and the live ETA. A real table rather than a single
state row, because the model is a fleet that switches itself on and off:
dispatch asks "who is free and nearest", which is the same question with one
driver or forty. Seeded with one driver so today's single-truck operation works
the moment this lands.

Revision ID: 0004_drivers
Revises: 0003_motorway
Create Date: 2026-09-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_drivers"
down_revision: Union[str, None] = "0003_motorway"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "drivers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("available", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("located_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_booking_id", sa.Integer(), nullable=True),
        sa.Column("busy_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_drivers_available", "drivers", ["available"])
    op.create_index("ix_drivers_active", "drivers", ["active"])

    op.add_column("bookings", sa.Column("driver_id", sa.Integer(), nullable=True))
    op.create_index("ix_bookings_driver_id", "bookings", ["driver_id"])

    # One driver to start, off duty. Gives the console something to switch on
    # rather than an empty roster on first load.
    op.execute(
        "INSERT INTO drivers (name, available, active) VALUES ('Driver 1', false, true)"
    )


def downgrade() -> None:
    op.drop_index("ix_bookings_driver_id", table_name="bookings")
    op.drop_column("bookings", "driver_id")
    op.drop_index("ix_drivers_active", table_name="drivers")
    op.drop_index("ix_drivers_available", table_name="drivers")
    op.drop_table("drivers")
