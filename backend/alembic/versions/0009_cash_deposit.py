"""cash deposit: cash jobs secure the booking with a card deposit

A cash booking now pays the platform's cut as a deposit on the customer's card
(held at booking, taken when the job is done) and the rest in cash to the
driver. The deposit is stored on the booking so a later change to the fee
percentage doesn't change what a customer was quoted.

Existing bookings keep no deposit: they were booked under the old rules.

Revision ID: 0009_cash_deposit
Revises: 0008_payments
Create Date: 2026-09-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_cash_deposit"
down_revision: Union[str, None] = "0008_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("deposit_pence", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.drop_column("deposit_pence")
