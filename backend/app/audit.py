"""Who did what, and when.

Every decision about a driver or an account is written here: an application
submitted, a document approved or rejected, a driver suspended, a document
opened. It is the record the operator needs if an insurer or a customer ever
asks how someone came to be sent to a job.

`detail` holds short labels and field names. Never document contents, never a
password, never a token.
"""

from sqlalchemy.orm import Session

from . import models


def record(
    db: Session,
    actor: "models.User | None",
    action: str,
    *,
    target_type: str | None = None,
    target_id: int | None = None,
    detail: dict | None = None,
) -> None:
    """Add an audit event to the session. The caller commits."""
    db.add(
        models.AuditEvent(
            actor_user_id=actor.id if actor is not None else None,
            actor_label=(actor.name if actor is not None else "System")[:80],
            action=action[:40],
            target_type=target_type,
            target_id=target_id,
            detail=detail or None,
        )
    )
