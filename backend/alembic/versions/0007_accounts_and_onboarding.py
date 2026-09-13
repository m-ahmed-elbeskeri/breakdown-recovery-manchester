"""accounts and driver onboarding

Per-person accounts (admins and drivers) replace the shared operator key.
Drivers apply, fill in their licence and vehicle details, and upload the
documents a recovery driver has to hold; admins review each document, check
the licence with DVLA and approve the driver before they can be dispatched.

Existing driver rows are marked "active" so the roster that is already working
keeps working. They have no account, so nobody can sign in as them until an
admin invites them or removes them.

Revision ID: 0007_accounts_and_onboarding
Revises: 0006_tracking
Create Date: 2026-09-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_accounts_and_onboarding"
down_revision: Union[str, None] = "0006_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_now = sa.func.now()


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("user_agent", sa.String(length=160), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)

    op.create_table(
        "password_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=10), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
    )
    op.create_index("ix_password_tokens_user_id", "password_tokens", ["user_id"])
    op.create_index(
        "ix_password_tokens_token_hash", "password_tokens", ["token_hash"], unique=True
    )

    op.create_table(
        "driver_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("driver_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("doc_date", sa.Date(), nullable=True),
        sa.Column("reference", sa.String(length=60), nullable=True),
        sa.Column("file_name", sa.String(length=120), nullable=False),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("superseded", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_driver_documents_driver_id", "driver_documents", ["driver_id"])
    op.create_index("ix_driver_documents_status", "driver_documents", ["status"])
    op.create_index("ix_driver_documents_superseded", "driver_documents", ["superseded"])
    op.create_index(
        "ix_driver_documents_driver_type", "driver_documents", ["driver_id", "doc_type"]
    )

    op.create_table(
        "driver_document_files",
        sa.Column("document_id", sa.Integer(), primary_key=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
    )

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_label", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"])
    op.create_index("ix_audit_events_action", "audit_events", ["action"])
    op.create_index("ix_audit_events_target", "audit_events", ["target_type", "target_id"])

    with op.batch_alter_table("drivers") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        # "active" for the rows that exist today; new rows get "draft" from the model.
        batch.add_column(
            sa.Column(
                "application_status",
                sa.String(length=12),
                nullable=False,
                server_default="active",
            )
        )
        batch.add_column(sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("review_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("date_of_birth", sa.Date(), nullable=True))
        batch.add_column(sa.Column("address_line1", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("address_line2", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("town", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("postcode", sa.String(length=10), nullable=True))
        batch.add_column(sa.Column("emergency_contact_name", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("emergency_contact_phone", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("licence_number", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("licence_categories", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("licence_expiry", sa.Date(), nullable=True))
        batch.add_column(sa.Column("licence_points", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("licence_checked_at", sa.Date(), nullable=True))
        batch.add_column(sa.Column("vehicle_reg", sa.String(length=10), nullable=True))
        batch.add_column(sa.Column("vehicle_make_model", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("vehicle_type", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("vehicle_gvw_kg", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("operator_licence_number", sa.String(length=20), nullable=True))
        batch.add_column(
            sa.Column("motorway_work", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_index("ix_drivers_user_id", "drivers", ["user_id"], unique=True)
    op.create_index("ix_drivers_application_status", "drivers", ["application_status"])


def downgrade() -> None:
    op.drop_index("ix_drivers_application_status", table_name="drivers")
    op.drop_index("ix_drivers_user_id", table_name="drivers")
    with op.batch_alter_table("drivers") as batch:
        for column in (
            "motorway_work",
            "operator_licence_number",
            "vehicle_gvw_kg",
            "vehicle_type",
            "vehicle_make_model",
            "vehicle_reg",
            "licence_checked_at",
            "licence_points",
            "licence_expiry",
            "licence_categories",
            "licence_number",
            "emergency_contact_phone",
            "emergency_contact_name",
            "postcode",
            "town",
            "address_line2",
            "address_line1",
            "date_of_birth",
            "review_note",
            "reviewed_by_user_id",
            "reviewed_at",
            "submitted_at",
            "application_status",
            "user_id",
        ):
            batch.drop_column(column)

    op.drop_table("audit_events")
    op.drop_table("driver_document_files")
    op.drop_table("driver_documents")
    op.drop_table("password_tokens")
    op.drop_table("auth_sessions")
    op.drop_table("users")
