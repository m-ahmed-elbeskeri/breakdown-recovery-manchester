"""Signing in, signing out, and setting a password.

Sessions are bearer tokens rather than cookies. The site and the API live on
different domains, and a cross-site cookie is exactly what Safari and Chrome
now block by default; a token in a header works everywhere and cannot be
ridden by another site's form either.
"""

import hmac
from dataclasses import dataclass
from datetime import timedelta
from math import ceil

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import audit, models, schemas
from .config import settings
from .db import get_db
from .notify import send_password_link
from .security import hash_password, hash_token, new_token, password_problem, verify_password
from .serialize import user_out
from .timeutil import aware, iso, now

router = APIRouter(prefix="/api/auth", tags=["auth"])

SIGN_IN_AGAIN = "Your session has ended. Sign in again."


@dataclass
class Principal:
    user: models.User
    session: models.AuthSession


def current_principal(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Principal:
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    session = db.scalars(
        select(models.AuthSession).where(models.AuthSession.token_hash == hash_token(token))
    ).first()
    moment = now()
    if session is None or aware(session.expires_at) <= moment:
        raise HTTPException(status_code=401, detail=SIGN_IN_AGAIN)
    user = db.get(models.User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail=SIGN_IN_AGAIN)
    # Sliding expiry: somebody using the app every week stays signed in, and a
    # phone left in a drawer for a month does not.
    if moment - aware(session.last_used_at) > timedelta(hours=1):
        session.last_used_at = moment
        session.expires_at = moment + timedelta(days=settings.session_days)
        db.commit()
    return Principal(user=user, session=session)


def require_user(principal: Principal = Depends(current_principal)) -> models.User:
    return principal.user


def require_admin(user: models.User = Depends(require_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only.")
    return user


def revoke_sessions(db: Session, user_id: int, keep_session_id: int | None = None) -> None:
    query = delete(models.AuthSession).where(models.AuthSession.user_id == user_id)
    if keep_session_id is not None:
        query = query.where(models.AuthSession.id != keep_session_id)
    db.execute(query)


def start_session(db: Session, user: models.User, request: Request | None) -> schemas.SessionOut:
    moment = now()
    # Tidy this person's dead sessions while we are here.
    db.execute(
        delete(models.AuthSession).where(
            models.AuthSession.user_id == user.id,
            models.AuthSession.expires_at <= moment,
        )
    )
    token = new_token()
    expires = moment + timedelta(days=settings.session_days)
    agent = request.headers.get("user-agent") if request is not None else None
    db.add(
        models.AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=expires,
            last_used_at=moment,
            user_agent=(agent or "")[:160] or None,
        )
    )
    user.last_login_at = moment
    user.failed_logins = 0
    user.locked_until = None
    db.flush()
    return schemas.SessionOut(token=token, expiresAt=iso(expires) or "", user=user_out(db, user))


def set_password(
    db: Session, user: models.User, password: str, *, keep_session_id: int | None = None
) -> None:
    problem = password_problem(password, user.email)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    user.password_hash = hash_password(password)
    user.password_changed_at = now()
    user.failed_logins = 0
    user.locked_until = None
    revoke_sessions(db, user.id, keep_session_id)


def create_password_token(
    db: Session,
    user: models.User,
    *,
    purpose: str,
    lifetime: timedelta,
    created_by: models.User | None,
) -> tuple[str, str]:
    """Returns (token, expiresAt). Earlier unused links for this person stop working."""
    moment = now()
    for old in db.scalars(
        select(models.PasswordToken).where(
            models.PasswordToken.user_id == user.id,
            models.PasswordToken.used_at.is_(None),
        )
    ).all():
        old.used_at = moment
    token = new_token()
    expires = moment + lifetime
    db.add(
        models.PasswordToken(
            user_id=user.id,
            token_hash=hash_token(token),
            purpose=purpose,
            expires_at=expires,
            created_by_user_id=created_by.id if created_by else None,
        )
    )
    return token, iso(expires) or ""


def setup_path(token: str, purpose: str) -> str:
    return f"/reset-password?token={token}" + ("&invite=1" if purpose == "invite" else "")


def email_taken(db: Session, email: str) -> bool:
    return db.scalars(select(models.User).where(models.User.email == email)).first() is not None


def _active_admin_exists(db: Session) -> bool:
    return (
        db.scalars(
            select(models.User).where(models.User.role == "admin", models.User.is_active)
        ).first()
        is not None
    )


# ── First run ───────────────────────────────────────────────────────────────


@router.get("/setup", response_model=schemas.SetupStatusOut)
def setup_status(db: Session = Depends(get_db)) -> schemas.SetupStatusOut:
    return schemas.SetupStatusOut(needsSetup=not _active_admin_exists(db))


@router.post("/setup", response_model=schemas.SessionOut, status_code=201)
def setup(
    payload: schemas.SetupIn, request: Request, db: Session = Depends(get_db)
) -> schemas.SessionOut:
    """Create the first admin. Needs the operator key, and only works once."""
    if _active_admin_exists(db):
        raise HTTPException(status_code=409, detail="Setup is already done. Sign in instead.")
    key = settings.admin_api_key or ""
    if not key or not hmac.compare_digest(payload.operatorKey.encode(), key.encode()):
        raise HTTPException(status_code=403, detail="That operator key is not right.")
    if email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = models.User(email=payload.email, name=payload.name, role="admin")
    db.add(user)
    db.flush()
    set_password(db, user, payload.password)
    audit.record(db, user, "account.admin_created", target_type="user", target_id=user.id, detail={"via": "setup"})
    out = start_session(db, user, request)
    db.commit()
    return out


# ── Signing in and out ──────────────────────────────────────────────────────


@router.post("/login", response_model=schemas.SessionOut)
def login(
    payload: schemas.LoginIn, request: Request, db: Session = Depends(get_db)
) -> schemas.SessionOut:
    email = payload.email.strip().lower()
    user = db.scalars(select(models.User).where(models.User.email == email)).first()
    moment = now()

    if user is not None and user.locked_until and aware(user.locked_until) > moment:
        minutes = max(1, ceil((aware(user.locked_until) - moment).total_seconds() / 60))
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}, or reset your password.",
        )

    ok = verify_password(payload.password, user.password_hash if user else None)
    if not ok or user is None or not user.is_active:
        if user is not None:
            user.failed_logins = (user.failed_logins or 0) + 1
            if user.failed_logins >= settings.login_max_failures:
                user.locked_until = moment + timedelta(minutes=settings.login_lock_minutes)
                user.failed_logins = 0
                audit.record(db, None, "account.locked", target_type="user", target_id=user.id)
            db.commit()
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    out = start_session(db, user, request)
    audit.record(db, user, "account.signed_in", target_type="user", target_id=user.id)
    db.commit()
    return out


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(require_user), db: Session = Depends(get_db)) -> schemas.UserOut:
    return user_out(db, user)


@router.post("/logout", status_code=204)
def logout(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> None:
    db.delete(principal.session)
    db.commit()


@router.post("/logout-all", status_code=204)
def logout_all(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)) -> None:
    revoke_sessions(db, principal.user.id)
    audit.record(db, principal.user, "account.signed_out_everywhere", target_type="user", target_id=principal.user.id)
    db.commit()


@router.post("/password", status_code=204)
def change_password(
    payload: schemas.PasswordChangeIn,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> None:
    user = principal.user
    if not verify_password(payload.currentPassword, user.password_hash):
        raise HTTPException(status_code=403, detail="Your current password is not right.")
    # Everywhere else is signed out: if the password is being changed because
    # somebody else knew it, their session should not survive the change.
    set_password(db, user, payload.newPassword, keep_session_id=principal.session.id)
    audit.record(db, user, "account.password_changed", target_type="user", target_id=user.id)
    db.commit()


# ── Reset and invite links ──────────────────────────────────────────────────


def _link_base(origin: str | None) -> str:
    cleaned = (origin or "").rstrip("/")
    if cleaned and cleaned in settings.cors_origin_list:
        return cleaned
    return settings.site_url.rstrip("/")


@router.post("/password-reset/request", status_code=204)
def request_reset(
    payload: schemas.ResetRequestIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> None:
    """Always 204, so the form cannot be used to find out who has an account."""
    email = payload.email.strip().lower()
    user = db.scalars(select(models.User).where(models.User.email == email)).first()
    if user is None or not user.is_active:
        return
    recent = db.scalars(
        select(models.PasswordToken).where(
            models.PasswordToken.user_id == user.id,
            models.PasswordToken.created_at >= now() - timedelta(minutes=15),
            models.PasswordToken.created_by_user_id.is_(None),
        )
    ).first()
    if recent is not None:
        return
    token, _ = create_password_token(
        db,
        user,
        purpose="reset",
        lifetime=timedelta(minutes=settings.reset_link_minutes),
        created_by=None,
    )
    audit.record(db, None, "account.reset_requested", target_type="user", target_id=user.id)
    db.commit()
    link = _link_base(payload.origin) + setup_path(token, "reset")
    background.add_task(send_password_link, user.email, user.name, link, "reset")


def _live_token(db: Session, token: str) -> tuple[models.PasswordToken, models.User] | None:
    row = db.scalars(
        select(models.PasswordToken).where(models.PasswordToken.token_hash == hash_token(token))
    ).first()
    if row is None or row.used_at is not None or aware(row.expires_at) <= now():
        return None
    user = db.get(models.User, row.user_id)
    if user is None or not user.is_active:
        return None
    return row, user


@router.get("/password-reset/check", response_model=schemas.PasswordTokenOut)
def check_reset(token: str, db: Session = Depends(get_db)) -> schemas.PasswordTokenOut:
    found = _live_token(db, token)
    if found is None:
        return schemas.PasswordTokenOut(valid=False)
    row, user = found
    return schemas.PasswordTokenOut(valid=True, purpose=row.purpose, name=user.name, email=user.email)  # type: ignore[arg-type]


@router.post("/password-reset/confirm", response_model=schemas.SessionOut)
def confirm_reset(
    payload: schemas.ResetConfirmIn, request: Request, db: Session = Depends(get_db)
) -> schemas.SessionOut:
    found = _live_token(db, payload.token)
    if found is None:
        raise HTTPException(
            status_code=410,
            detail="That link has expired or already been used. Ask for a new one.",
        )
    row, user = found
    set_password(db, user, payload.password)
    row.used_at = now()
    audit.record(
        db,
        user,
        "account.password_set" if row.purpose == "invite" else "account.password_reset",
        target_type="user",
        target_id=user.id,
    )
    out = start_session(db, user, request)
    db.commit()
    return out
