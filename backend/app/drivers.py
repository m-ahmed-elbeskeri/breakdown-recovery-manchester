"""The driver's side: applying, keeping paperwork current, and working.

Everything under /api/me is about the signed-in driver and nobody else. A
driver can never name another driver's id here, so there is nothing to guess.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, dispatch, models, schemas
from .auth import email_taken, require_user, start_session, set_password
from .compliance import MAX_UPLOAD_BYTES
from .db import get_db
from .documents import file_response, store_document
from .notify import send_application_submitted
from .profiles import CONTACT_FIELDS, apply_profile
from .serialize import booking_out, document_out, driver_names, driver_out, profile_out
from .timeutil import now

router = APIRouter(prefix="/api", tags=["drivers"])


@dataclass
class DriverContext:
    user: models.User
    driver: models.Driver


def current_driver(
    user: models.User = Depends(require_user), db: Session = Depends(get_db)
) -> DriverContext:
    if user.role != "driver":
        raise HTTPException(status_code=403, detail="This is for drivers.")
    driver = db.scalars(select(models.Driver).where(models.Driver.user_id == user.id)).first()
    if driver is None or not driver.active:
        raise HTTPException(status_code=403, detail="No driver profile is linked to this account.")
    return DriverContext(user=user, driver=driver)


def _require_working_driver(ctx: DriverContext) -> None:
    if ctx.driver.application_status != "active":
        raise HTTPException(status_code=403, detail="Your account isn't active yet.")


# ── Applying ────────────────────────────────────────────────────────────────


@router.post("/drivers/apply", response_model=schemas.SessionOut, status_code=201)
def apply(
    payload: schemas.ApplyIn, request: Request, db: Session = Depends(get_db)
) -> schemas.SessionOut:
    if email_taken(db, payload.email):
        raise HTTPException(
            status_code=409,
            detail="An account with that email already exists. Sign in instead.",
        )
    user = models.User(email=payload.email, name=payload.name, phone=payload.phone, role="driver")
    db.add(user)
    db.flush()
    set_password(db, user, payload.password)
    driver = models.Driver(
        user_id=user.id,
        name=payload.name,
        phone=payload.phone,
        application_status="draft",
        available=False,
        active=True,
    )
    db.add(driver)
    db.flush()
    audit.record(db, user, "driver.applied", target_type="driver", target_id=driver.id)
    out = start_session(db, user, request)
    db.commit()
    return out


@router.get("/me/driver", response_model=schemas.DriverProfileOut)
def my_profile(ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)):
    return profile_out(db, ctx.driver)


@router.post("/me/driver/profile", response_model=schemas.DriverProfileOut)
def update_my_profile(
    payload: schemas.DriverProfileIn,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    status = ctx.driver.application_status
    if status in ("draft", "rejected"):
        allowed = None
        message = ""
    elif status == "submitted":
        allowed = CONTACT_FIELDS
        message = "Your application is being checked. Ring the office to change your licence or vehicle details."
    else:
        allowed = CONTACT_FIELDS
        message = "Ring the office to change your licence or vehicle details. They need checking again."
    changed = apply_profile(ctx.driver, ctx.user, payload, allowed=allowed, locked_message=message)
    if changed:
        audit.record(
            db,
            ctx.user,
            "driver.updated",
            target_type="driver",
            target_id=ctx.driver.id,
            detail={"fields": changed},
        )
    db.commit()
    return profile_out(db, ctx.driver)


@router.post("/me/driver/submit", response_model=schemas.DriverProfileOut)
def submit_application(
    background: BackgroundTasks,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    driver = ctx.driver
    if driver.application_status not in ("draft", "rejected"):
        raise HTTPException(status_code=409, detail="Your application has already been sent.")
    result = dispatch.compliance_for(db, driver)
    if result.submit_blockers:
        raise dispatch.blocked(422, "A few things are still needed.", result.submit_blockers)
    driver.application_status = "submitted"
    driver.submitted_at = now()
    audit.record(db, ctx.user, "driver.submitted", target_type="driver", target_id=driver.id)
    db.commit()
    background.add_task(send_application_submitted, driver.name, driver.id)
    return profile_out(db, driver)


# ── Documents ───────────────────────────────────────────────────────────────


async def read_upload(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES + 1024:
        raise HTTPException(
            status_code=413,
            detail=f"That file is over {MAX_UPLOAD_BYTES // 1_000_000} MB. A photo or a smaller PDF will do.",
        )
    return await request.body()


@router.post("/me/documents", response_model=schemas.DocumentOut, status_code=201)
async def upload_my_document(
    request: Request,
    docType: str,
    docDate: date | None = None,
    reference: str | None = None,
    fileName: str | None = None,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    """The file is the raw request body; what it is goes in the query string.

    Raw rather than multipart so the upload needs no form-parsing library on
    the server and the browser can report progress on a plain request.
    """
    if ctx.driver.application_status == "suspended":
        raise HTTPException(status_code=403, detail="Your account is suspended.")
    data = await read_upload(request)

    def _store():
        doc = store_document(
            db,
            ctx.driver,
            doc_key=docType,
            data=data,
            doc_date=docDate,
            reference=reference,
            file_name=fileName,
            uploader=ctx.user,
        )
        db.commit()
        db.refresh(doc)
        return document_out(doc, {})

    return await run_in_threadpool(_store)


def _own_document(db: Session, ctx: DriverContext, document_id: int) -> models.DriverDocument:
    doc = db.get(models.DriverDocument, document_id)
    # Somebody else's document is "not found", not "forbidden": the id alone
    # must not confirm that it exists.
    if doc is None or doc.driver_id != ctx.driver.id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/me/documents/{document_id}/file")
def my_document_file(
    document_id: int,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
) -> Response:
    return file_response(db, _own_document(db, ctx, document_id))


@router.delete("/me/documents/{document_id}", status_code=204)
def delete_my_document(
    document_id: int,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
) -> None:
    doc = _own_document(db, ctx, document_id)
    if doc.status == "approved":
        raise HTTPException(
            status_code=409, detail="An approved document can't be removed. Upload a new one instead."
        )
    stored = db.get(models.DriverDocumentFile, doc.id)
    if stored is not None:
        db.delete(stored)
    audit.record(
        db,
        ctx.user,
        "document.deleted",
        target_type="document",
        target_id=doc.id,
        detail={"driverId": ctx.driver.id, "docType": doc.doc_type},
    )
    db.delete(doc)
    db.commit()


# ── Working ─────────────────────────────────────────────────────────────────


@router.get("/me/jobs", response_model=list[schemas.BookingOut])
def my_jobs(ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)):
    """Jobs waiting for anyone, and this driver's own. Nobody else's."""
    _require_working_driver(ctx)
    moment = now()
    waiting = db.scalars(
        select(models.Booking)
        .where(
            models.Booking.status == "pending",
            models.Booking.driver_id.is_(None),
            models.Booking.created_at >= moment - timedelta(days=7),
        )
        .order_by(models.Booking.created_at.desc())
        .limit(50)
    ).all()
    mine = db.scalars(
        select(models.Booking)
        .where(
            models.Booking.driver_id == ctx.driver.id,
            models.Booking.created_at >= moment - timedelta(days=30),
        )
        .order_by(models.Booking.created_at.desc())
        .limit(50)
    ).all()
    names = driver_names(db)
    return [booking_out(b, names, for_driver_id=ctx.driver.id) for b in [*waiting, *mine]]


@router.post("/me/state", response_model=schemas.DriverOut)
def my_state(
    payload: schemas.DriverStateIn,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    driver = ctx.driver
    was_available = driver.available
    going_on = payload.available is True and not was_available
    if going_on or payload.busyMinutes is not None:
        _require_working_driver(ctx)
    if going_on:
        dispatch.check_can_go_on_duty(db, driver, who="You")
    dispatch.apply_state(driver, payload, position_when_off_duty=False)
    if driver.available != was_available:
        audit.record(
            db,
            ctx.user,
            "driver.on_duty" if driver.available else "driver.off_duty",
            target_type="driver",
            target_id=driver.id,
        )
    db.commit()
    db.refresh(driver)
    return driver_out(driver)


@router.post("/me/jobs/{booking_id}/status", response_model=schemas.BookingOut)
def my_job_status(
    booking_id: int,
    payload: schemas.DriverJobStatusIn,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    _require_working_driver(ctx)
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Job not found")
    dispatch.set_job_status(
        db, booking, payload.status, driver=ctx.driver, actor=ctx.user, by_admin=False
    )
    db.commit()
    db.refresh(booking)
    return booking_out(booking, driver_names(db), for_driver_id=ctx.driver.id)
