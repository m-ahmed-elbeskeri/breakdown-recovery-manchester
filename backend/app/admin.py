"""The office: reviewing applications, checking paperwork, managing accounts.

Every endpoint here needs an admin session, and every decision is written to
the audit log with the name of the admin who made it.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import audit, dispatch, models, schemas
from .auth import (
    create_password_token,
    email_taken,
    require_admin,
    revoke_sessions,
    setup_path,
)
from .compliance import DOC_TYPES, EXPIRING_SOON_DAYS, check_doc_date, evaluate
from .config import settings
from .db import get_db
from .documents import file_response, store_document
from .drivers import read_upload
from .profiles import apply_profile
from .serialize import (
    audit_out,
    document_out,
    driver_documents,
    names_by_user_id,
    profile_out,
    user_out,
)
from .timeutil import iso_date, now, today_uk

router = APIRouter(prefix="/api/admin", tags=["admin"])

# The queue reads top to bottom in the order someone needs to act.
_STATUS_ORDER = {"submitted": 0, "active": 1, "suspended": 2, "draft": 3, "rejected": 4}


def _driver(db: Session, driver_id: int) -> models.Driver:
    driver = db.get(models.Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


def _detail(db: Session, driver: models.Driver) -> schemas.AdminDriverDetailOut:
    docs = driver_documents(db, driver.id)
    names = names_by_user_id(db, {d.reviewed_by_user_id for d in docs})
    doc_ids = [d.id for d in docs]
    conditions = [
        (models.AuditEvent.target_type == "driver") & (models.AuditEvent.target_id == driver.id)
    ]
    if doc_ids:
        conditions.append(
            (models.AuditEvent.target_type == "document")
            & (models.AuditEvent.target_id.in_(doc_ids))
        )
    if driver.user_id:
        conditions.append(
            (models.AuditEvent.target_type == "user")
            & (models.AuditEvent.target_id == driver.user_id)
        )
    events = db.scalars(
        select(models.AuditEvent)
        .where(or_(*conditions))
        .order_by(models.AuditEvent.id.desc())
        .limit(200)
    ).all()
    return schemas.AdminDriverDetailOut(
        profile=profile_out(db, driver, docs),
        history=[document_out(d, names) for d in docs],
        audit=[audit_out(e) for e in events],
    )


# ── Drivers ─────────────────────────────────────────────────────────────────


@router.get("/drivers", response_model=list[schemas.DriverSummaryOut])
def list_drivers(
    status: str | None = None,
    include_removed: bool = False,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(models.Driver)
    if not include_removed:
        query = query.where(models.Driver.active)
    if status:
        query = query.where(models.Driver.application_status == status)
    drivers = db.scalars(query).all()
    ids = [d.id for d in drivers]
    docs_by_driver: dict[int, list[models.DriverDocument]] = {i: [] for i in ids}
    if ids:
        for doc in db.scalars(
            select(models.DriverDocument).where(models.DriverDocument.driver_id.in_(ids))
        ).all():
            docs_by_driver[doc.driver_id].append(doc)
    users = {
        u.id: u
        for u in db.scalars(
            select(models.User).where(models.User.id.in_([d.user_id for d in drivers if d.user_id]))
        ).all()
    } if drivers else {}
    today = today_uk()

    rows = []
    for d in drivers:
        result = evaluate(d, docs_by_driver.get(d.id, []), today)
        user = users.get(d.user_id) if d.user_id else None
        rows.append(
            schemas.DriverSummaryOut(
                id=d.id,
                name=d.name,
                email=user.email if user else None,
                phone=d.phone,
                status=d.application_status,
                active=d.active,
                available=d.available,
                hasAccount=user is not None,
                lastLoginAt=user.last_login_at.isoformat() if user and user.last_login_at else None,
                submittedAt=d.submitted_at.isoformat() if d.submitted_at else None,
                reviewedAt=d.reviewed_at.isoformat() if d.reviewed_at else None,
                vehicleReg=d.vehicle_reg,
                vehicleType=d.vehicle_type,
                vehicleGvwKg=d.vehicle_gvw_kg,
                motorwayWork=d.motorway_work,
                pendingDocs=sum(
                    1 for i in result.items if i.state == "pending" or i.replacement_pending
                ),
                missingDocs=sum(
                    1 for i in result.items if i.required and i.state in ("missing", "rejected")
                ),
                expiringDocs=sum(1 for i in result.items if i.state == "expiring"),
                expiredDocs=sum(1 for i in result.items if i.state == "expired"),
                canWork=not result.work_blockers,
            )
        )
    rows.sort(key=lambda r: (_STATUS_ORDER.get(r.status, 9), r.submittedAt or "", r.name.lower()))
    return rows


@router.get("/drivers/{driver_id}", response_model=schemas.AdminDriverDetailOut)
def get_driver(
    driver_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _detail(db, _driver(db, driver_id))


@router.post("/drivers/{driver_id}/profile", response_model=schemas.AdminDriverDetailOut)
def update_driver(
    driver_id: int,
    payload: schemas.AdminDriverProfileIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    driver = _driver(db, driver_id)
    user = db.get(models.User, driver.user_id) if driver.user_id else None
    changed = apply_profile(driver, user, payload, allowed=None)
    if "licenceCheckedAt" in changed:
        audit.record(
            db,
            admin,
            "driver.licence_checked",
            target_type="driver",
            target_id=driver.id,
            detail={"checkedOn": iso_date(driver.licence_checked_at)},
        )
    others = [f for f in changed if f != "licenceCheckedAt"]
    if others:
        audit.record(
            db, admin, "driver.updated", target_type="driver", target_id=driver.id, detail={"fields": others}
        )
    db.commit()
    return _detail(db, driver)


@router.post("/drivers/{driver_id}/submit", response_model=schemas.AdminDriverDetailOut)
def submit_for_driver(
    driver_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send an application for review on a driver's behalf, e.g. existing staff
    whose paperwork the office uploaded."""
    driver = _driver(db, driver_id)
    if driver.application_status not in ("draft", "rejected"):
        raise HTTPException(status_code=409, detail="This application has already been sent.")
    result = dispatch.compliance_for(db, driver)
    if result.submit_blockers:
        raise dispatch.blocked(422, "A few things are still needed.", result.submit_blockers)
    driver.application_status = "submitted"
    driver.submitted_at = now()
    audit.record(db, admin, "driver.submitted", target_type="driver", target_id=driver.id, detail={"byAdmin": True})
    db.commit()
    return _detail(db, driver)


@router.post("/drivers/{driver_id}/decision", response_model=schemas.AdminDriverDetailOut)
def decide(
    driver_id: int,
    payload: schemas.DriverDecisionIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    driver = _driver(db, driver_id)
    note = " ".join((payload.note or "").split()) or None
    status = driver.application_status

    if payload.decision == "approve":
        result = dispatch.compliance_for(db, driver)
        if result.approval_blockers:
            raise dispatch.blocked(409, "This driver can't be approved yet.", result.approval_blockers)
        driver.application_status = "active"
    elif payload.decision == "reject":
        if status != "submitted":
            raise HTTPException(status_code=409, detail="Only a submitted application can be turned down.")
        if not note:
            raise HTTPException(status_code=422, detail="Say why, so the driver knows what to fix.")
        driver.application_status = "rejected"
    elif payload.decision == "suspend":
        if status != "active":
            raise HTTPException(status_code=409, detail="Only an active driver can be suspended.")
        if not note:
            raise HTTPException(status_code=422, detail="Record why the driver is being suspended.")
        driver.application_status = "suspended"
        driver.available = False
        dispatch.release_driver_jobs(db, driver, admin)
        if driver.user_id:
            revoke_sessions(db, driver.user_id)
    else:  # reinstate
        if status != "suspended":
            raise HTTPException(status_code=409, detail="Only a suspended driver can be reinstated.")
        driver.application_status = "active"

    driver.reviewed_at = now()
    driver.reviewed_by_user_id = admin.id
    driver.review_note = note
    past_tense = {
        "approve": "approved",
        "reject": "rejected",
        "suspend": "suspended",
        "reinstate": "reinstated",
    }
    audit.record(
        db,
        admin,
        f"driver.{past_tense[payload.decision]}",
        target_type="driver",
        target_id=driver.id,
        detail={"note": note[:200]} if note else None,
    )
    db.commit()
    return _detail(db, driver)


@router.post("/drivers/invite", response_model=schemas.InviteOut, status_code=201)
def invite_driver(
    payload: schemas.InviteDriverIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = models.User(email=payload.email, name=payload.name, phone=payload.phone, role="driver")
    db.add(user)
    db.flush()
    driver = models.Driver(user_id=user.id, name=payload.name, phone=payload.phone, application_status="draft")
    db.add(driver)
    db.flush()
    token, expires = create_password_token(
        db, user, purpose="invite", lifetime=timedelta(hours=settings.invite_link_hours), created_by=admin
    )
    audit.record(db, admin, "driver.invited", target_type="driver", target_id=driver.id)
    db.commit()
    return schemas.InviteOut(userId=user.id, driverId=driver.id, setupPath=setup_path(token, "invite"), expiresAt=expires)


@router.post("/drivers/{driver_id}/account", response_model=schemas.InviteOut, status_code=201)
def link_account(
    driver_id: int,
    payload: schemas.LinkAccountIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Give a driver who predates accounts a sign-in of their own."""
    driver = _driver(db, driver_id)
    if driver.user_id is not None:
        raise HTTPException(status_code=409, detail="This driver already has an account.")
    if email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = models.User(email=payload.email, name=driver.name, phone=driver.phone, role="driver")
    db.add(user)
    db.flush()
    driver.user_id = user.id
    token, expires = create_password_token(
        db, user, purpose="invite", lifetime=timedelta(hours=settings.invite_link_hours), created_by=admin
    )
    audit.record(db, admin, "driver.account_linked", target_type="driver", target_id=driver.id)
    db.commit()
    return schemas.InviteOut(userId=user.id, driverId=driver.id, setupPath=setup_path(token, "invite"), expiresAt=expires)


@router.post("/drivers/{driver_id}/documents", response_model=schemas.DocumentOut, status_code=201)
async def upload_for_driver(
    driver_id: int,
    request: Request,
    docType: str,
    docDate: date | None = None,
    reference: str | None = None,
    fileName: str | None = None,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload a document a driver sent in some other way, e.g. by email."""
    data = await read_upload(request)

    def _store():
        driver = _driver(db, driver_id)
        doc = store_document(
            db, driver, doc_key=docType, data=data, doc_date=docDate,
            reference=reference, file_name=fileName, uploader=admin,
        )
        db.commit()
        db.refresh(doc)
        return document_out(doc, {})

    return await run_in_threadpool(_store)


# ── Documents ───────────────────────────────────────────────────────────────


@router.post("/documents/{document_id}/review", response_model=schemas.AdminDriverDetailOut)
def review_document(
    document_id: int,
    payload: schemas.DocumentReviewIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    doc = db.get(models.DriverDocument, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.superseded:
        raise HTTPException(status_code=409, detail="A newer copy has replaced this one.")
    driver = _driver(db, doc.driver_id)
    doc_type = DOC_TYPES[doc.doc_type]

    # The admin can correct what the driver typed, having read the document.
    if "docDate" in payload.model_fields_set and doc_type["dateKind"] is not None:
        doc.doc_date = payload.docDate
    if "reference" in payload.model_fields_set:
        doc.reference = " ".join((payload.reference or "").split())[:60] or None

    if payload.decision == "approve":
        problem = check_doc_date(doc_type, doc.doc_date, today_uk())
        if problem:
            raise HTTPException(status_code=422, detail=f"Can't approve: {problem}")
        for older in db.scalars(
            select(models.DriverDocument).where(
                models.DriverDocument.driver_id == doc.driver_id,
                models.DriverDocument.doc_type == doc.doc_type,
                models.DriverDocument.id != doc.id,
                models.DriverDocument.superseded.is_(False),
            )
        ).all():
            older.superseded = True
        doc.status = "approved"
        doc.rejection_reason = None
    else:
        reason = " ".join((payload.reason or "").split())
        if not reason:
            raise HTTPException(status_code=422, detail="Say what is wrong, so the driver can fix it.")
        doc.status = "rejected"
        doc.rejection_reason = reason

    doc.reviewed_at = now()
    doc.reviewed_by_user_id = admin.id
    audit.record(
        db,
        admin,
        f"document.{'approved' if payload.decision == 'approve' else 'rejected'}",
        target_type="document",
        target_id=doc.id,
        detail={"driverId": doc.driver_id, "docType": doc.doc_type, "reason": doc.rejection_reason},
    )
    db.commit()
    return _detail(db, driver)


@router.get("/documents/{document_id}/file")
def document_file(
    document_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Response:
    doc = db.get(models.DriverDocument, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    # Documents hold passport scans and addresses. Who looked, and when, is
    # part of the record.
    audit.record(
        db, admin, "document.viewed", target_type="document", target_id=doc.id,
        detail={"driverId": doc.driver_id, "docType": doc.doc_type},
    )
    db.commit()
    return file_response(db, doc)


@router.get("/compliance", response_model=list[schemas.ComplianceRowOut])
def compliance_report(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Everything on a working driver that has lapsed or is about to."""
    drivers = db.scalars(
        select(models.Driver).where(
            models.Driver.active, models.Driver.application_status.in_(("active", "suspended"))
        )
    ).all()
    today = today_uk()
    rows: list[schemas.ComplianceRowOut] = []
    for d in drivers:
        result = dispatch.compliance_for(db, d)
        for item in result.items:
            if not item.required:
                continue
            blocks = DOC_TYPES[item.key]["blocks"] == "work"
            if item.state in ("expiring", "expired") or (
                blocks and item.state in ("missing", "rejected", "pending")
            ):
                rows.append(
                    schemas.ComplianceRowOut(
                        driverId=d.id, driverName=d.name, driverStatus=d.application_status,
                        key=item.key, label=item.label, state=item.state,
                        validUntil=iso_date(item.valid_until), blocksWork=blocks,
                    )
                )
        if d.licence_expiry and d.licence_expiry <= today + timedelta(days=EXPIRING_SOON_DAYS):
            rows.append(
                schemas.ComplianceRowOut(
                    driverId=d.id, driverName=d.name, driverStatus=d.application_status,
                    key="licence_expiry", label="Driving licence (DVLA record)",
                    state="expired" if d.licence_expiry < today else "expiring",
                    validUntil=iso_date(d.licence_expiry), blocksWork=True,
                )
            )
    severity = {"expired": 0, "missing": 1, "rejected": 1, "pending": 2, "expiring": 3}
    rows.sort(key=lambda r: (severity.get(r.state, 9), r.validUntil or "9999", r.driverName))
    return rows


@router.get("/audit", response_model=list[schemas.AuditOut])
def audit_log(
    limit: int = 100,
    before_id: int | None = None,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(models.AuditEvent).order_by(models.AuditEvent.id.desc()).limit(max(1, min(limit, 500)))
    if before_id is not None:
        query = query.where(models.AuditEvent.id < before_id)
    return [audit_out(e) for e in db.scalars(query).all()]


# ── Accounts ────────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[schemas.UserOut])
def list_admins(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(
        select(models.User).where(models.User.role == "admin").order_by(models.User.name)
    ).all()
    return [user_out(db, u) for u in users]


@router.post("/users", response_model=schemas.InviteOut, status_code=201)
def create_admin(
    payload: schemas.CreateAdminIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = models.User(email=payload.email, name=" ".join(payload.name.split()), role="admin")
    db.add(user)
    db.flush()
    token, expires = create_password_token(
        db, user, purpose="invite", lifetime=timedelta(hours=settings.invite_link_hours), created_by=admin
    )
    audit.record(db, admin, "account.admin_invited", target_type="user", target_id=user.id)
    db.commit()
    return schemas.InviteOut(userId=user.id, setupPath=setup_path(token, "invite"), expiresAt=expires)


@router.post("/users/{user_id}/reset-link", response_model=schemas.InviteOut)
def reset_link(
    user_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """A link to send somebody who has forgotten their password, or never set one."""
    user = db.get(models.User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Account not found")
    purpose = "invite" if user.password_hash is None else "reset"
    token, expires = create_password_token(
        db, user, purpose=purpose, lifetime=timedelta(hours=settings.invite_link_hours), created_by=admin
    )
    audit.record(db, admin, "account.reset_link_created", target_type="user", target_id=user.id)
    driver = db.scalars(select(models.Driver).where(models.Driver.user_id == user.id)).first()
    db.commit()
    return schemas.InviteOut(
        userId=user.id, driverId=driver.id if driver else None,
        setupPath=setup_path(token, purpose), expiresAt=expires,
    )


@router.post("/users/{user_id}/active", response_model=schemas.UserOut)
def set_user_active(
    user_id: int,
    payload: schemas.UserActiveIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.id == admin.id and not payload.active:
        raise HTTPException(status_code=409, detail="You can't turn off your own account.")
    if user.role == "admin" and not payload.active:
        others = db.scalar(
            select(func.count()).select_from(models.User).where(
                models.User.role == "admin", models.User.is_active, models.User.id != user.id
            )
        )
        if not others:
            raise HTTPException(status_code=409, detail="There must always be at least one admin.")
    user.is_active = payload.active
    if not payload.active:
        revoke_sessions(db, user.id)
        driver = db.scalars(select(models.Driver).where(models.Driver.user_id == user.id)).first()
        if driver is not None:
            driver.available = False
    audit.record(
        db, admin, "account.enabled" if payload.active else "account.disabled",
        target_type="user", target_id=user.id,
    )
    db.commit()
    return user_out(db, user)
