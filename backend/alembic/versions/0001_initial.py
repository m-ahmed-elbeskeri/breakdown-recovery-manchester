"""initial schema: bookings + metrics

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("destination", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("service", sa.String(length=40), nullable=False),
        sa.Column("timing", sa.String(length=10), nullable=False),
        sa.Column("scheduled_for", sa.String(length=40), nullable=True),
        sa.Column("distance_miles", sa.Float(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bookings_request_id", "bookings", ["request_id"], unique=True)
    op.create_index("ix_bookings_status", "bookings", ["status"])
    op.create_index("ix_bookings_created_at", "bookings", ["created_at"])

    op.create_table(
        "metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rescues_today", sa.Integer(), nullable=False),
        sa.Column("drivers_available", sa.Integer(), nullable=False),
        sa.Column("avg_response_minutes", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("metrics")
    op.drop_index("ix_bookings_created_at", table_name="bookings")
    op.drop_index("ix_bookings_status", table_name="bookings")
    op.drop_index("ix_bookings_request_id", table_name="bookings")
    op.drop_table("bookings")
