"""events: anonymous site telemetry

Answers the questions the operator actually has — which area pages bring work,
where people give up in the booking form, how many ring instead of booking,
and whether a driver being on duty changes any of it.

Anonymous by construction: no name, address, phone, IP or cookie. A session id
generated per browser tab is enough to follow one visit through the funnel and
dies with the tab, which keeps this out of consent-banner territory.

Revision ID: 0005_events
Revises: 0004_drivers
Create Date: 2026-09-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_events"
down_revision: Union[str, None] = "0004_drivers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("session_id", sa.String(length=40), nullable=False),
        sa.Column("path", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=60), nullable=True),
        sa.Column("device", sa.String(length=20), nullable=True),
        sa.Column("referrer", sa.String(length=120), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_name", "events", ["name"])
    op.create_index("ix_events_session_id", "events", ["session_id"])
    op.create_index("ix_events_region", "events", ["region"])
    op.create_index("ix_events_created_at", "events", ["created_at"])
    # Every dashboard query filters by date and groups by name.
    op.create_index("ix_events_created_name", "events", ["created_at", "name"])


def downgrade() -> None:
    op.drop_index("ix_events_created_name", table_name="events")
    op.drop_index("ix_events_created_at", table_name="events")
    op.drop_index("ix_events_region", table_name="events")
    op.drop_index("ix_events_session_id", table_name="events")
    op.drop_index("ix_events_name", table_name="events")
    op.drop_table("events")
