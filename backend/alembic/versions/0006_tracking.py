"""tracking: a customer-facing key per booking, timestamps, vehicle, rating

The customer's side of dispatch. Every booking gets an unguessable token that
opens a live tracking page (status, ETA, the driver on their way), and the
timestamps that page shows are also what turn "average response 24 min" from
a seeded figure into a measured one.

Existing rows get a token too, so a booking made before this shipped can
still be handed a tracking link by the operator.

Revision ID: 0006_tracking
Revises: 0005_events
Create Date: 2026-09-13
"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_tracking"
down_revision: Union[str, None] = "0005_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("track_token", sa.String(length=48), nullable=True))
    op.add_column("bookings", sa.Column("vehicle", sa.String(length=80), nullable=True))
    op.add_column("bookings", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("en_route_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("on_scene_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("cancelled_by", sa.String(length=10), nullable=True))
    op.add_column("bookings", sa.Column("rating", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("rating_comment", sa.Text(), nullable=True))

    bind = op.get_bind()
    ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM bookings"))]
    for booking_id in ids:
        bind.execute(
            sa.text("UPDATE bookings SET track_token = :tok WHERE id = :id"),
            {"tok": secrets.token_urlsafe(24), "id": booking_id},
        )

    op.create_index("ix_bookings_track_token", "bookings", ["track_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bookings_track_token", table_name="bookings")
    for column in (
        "rating_comment",
        "rating",
        "cancelled_by",
        "finished_at",
        "on_scene_at",
        "en_route_at",
        "accepted_at",
        "vehicle",
        "track_token",
    ):
        op.drop_column("bookings", column)
