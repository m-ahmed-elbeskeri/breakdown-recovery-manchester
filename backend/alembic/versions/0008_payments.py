"""payments: card holds, the platform's cut and driver payouts

Bookings record how the customer pays (card through the site, or cash to the
driver) and what was taken and how it was split. Drivers get a Stripe Express
account to be paid into. Every movement of money between the platform and a
driver is a row in driver_ledger. Stripe webhook ids are kept so a retried
webhook changes nothing.

Existing bookings are marked cash with no payment status: they were all paid
to the driver on the day.

Revision ID: 0008_payments
Revises: 0007_accounts_and_onboarding
Create Date: 2026-09-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_payments"
down_revision: Union[str, None] = "0007_accounts_and_onboarding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("payment_method", sa.String(length=8), nullable=False, server_default="cash"))
        batch.add_column(sa.Column("payment_status", sa.String(length=20), nullable=False, server_default="none"))
        batch.add_column(sa.Column("stripe_payment_intent_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("stripe_customer_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("stripe_payment_method_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("stripe_charge_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("amount_paid_pence", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("platform_fee_pence", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("driver_net_pence", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("refunded_pence", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_bookings_payment_status", "bookings", ["payment_status"])
    op.create_index("ix_bookings_stripe_payment_intent_id", "bookings", ["stripe_payment_intent_id"])

    with op.batch_alter_table("drivers") as batch:
        batch.add_column(sa.Column("stripe_account_id", sa.String(length=64), nullable=True))
        batch.add_column(
            sa.Column("stripe_details_submitted", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(
            sa.Column("stripe_payouts_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_index("ix_drivers_stripe_account_id", "drivers", ["stripe_account_id"], unique=True)

    op.create_table(
        "driver_ledger",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("driver_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("amount_pence", sa.Integer(), nullable=False),
        sa.Column("stripe_transfer_id", sa.String(length=64), nullable=True),
        sa.Column("stripe_payout_id", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_driver_ledger_driver_id", "driver_ledger", ["driver_id"])
    op.create_index("ix_driver_ledger_booking_id", "driver_ledger", ["booking_id"])

    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("stripe_events")
    op.drop_index("ix_driver_ledger_booking_id", table_name="driver_ledger")
    op.drop_index("ix_driver_ledger_driver_id", table_name="driver_ledger")
    op.drop_table("driver_ledger")

    op.drop_index("ix_drivers_stripe_account_id", table_name="drivers")
    with op.batch_alter_table("drivers") as batch:
        batch.drop_column("stripe_payouts_enabled")
        batch.drop_column("stripe_details_submitted")
        batch.drop_column("stripe_account_id")

    op.drop_index("ix_bookings_stripe_payment_intent_id", table_name="bookings")
    op.drop_index("ix_bookings_payment_status", table_name="bookings")
    with op.batch_alter_table("bookings") as batch:
        for column in (
            "paid_at",
            "refunded_pence",
            "driver_net_pence",
            "platform_fee_pence",
            "amount_paid_pence",
            "stripe_charge_id",
            "stripe_payment_method_id",
            "stripe_customer_id",
            "stripe_payment_intent_id",
            "payment_status",
            "payment_method",
        ):
            batch.drop_column(column)
