"""Turning rows into the JSON the site reads. No decisions are made here."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .compliance import DOC_TYPES, Compliance, evaluate, valid_until
from .eta import minutes_until
from .timeutil import iso, iso_date, today_uk


def names_by_user_id(db: Session, ids: set[int | None]) -> dict[int, str]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    return {u.id: u.name for u in db.scalars(select(models.User).where(models.User.id.in_(wanted)))}


def driver_names(db: Session) -> dict[int, str]:
    return {d.id: d.name for d in db.scalars(select(models.Driver)).all()}


def booking_out(
    b: models.Booking,
    names: dict[int, str] | None = None,
    *,
    for_driver_id: int | None = None,
) -> schemas.BookingOut:
    """`for_driver_id` set means a driver is reading: the customer's number is
    shown only on their own jobs, and the tracking token never."""
    viewer_is_driver = for_driver_id is not None
    phone_visible = not viewer_is_driver or b.driver_id == for_driver_id
    return schemas.BookingOut(
        id=b.id,
        region=b.region,
        location=b.location,
        destination=b.destination,
        phone=b.phone if phone_visible else None,
        service=b.service,
        timing=b.timing,
        scheduledFor=b.scheduled_for,
        vehicle=b.vehicle,
        pickupLat=b.pickup_lat,
        pickupLng=b.pickup_lng,
        motorway=b.motorway,
        distanceMiles=b.distance_miles,
        durationMinutes=b.duration_minutes,
        price=b.price,
        driverId=b.driver_id,
        driverName=(names or {}).get(b.driver_id) if b.driver_id is not None else None,
        status=b.status,
        trackToken=None if viewer_is_driver else b.track_token,
        createdAt=iso(b.created_at) or "",
        acceptedAt=iso(b.accepted_at),
        enRouteAt=iso(b.en_route_at),
        onSceneAt=iso(b.on_scene_at),
        finishedAt=iso(b.finished_at),
        cancelledBy=b.cancelled_by,
        rating=b.rating,
        ratingComment=b.rating_comment,
    )


def driver_out(d: models.Driver) -> schemas.DriverOut:
    return schemas.DriverOut(
        id=d.id,
        name=d.name,
        phone=d.phone,
        available=d.available,
        lat=d.lat,
        lng=d.lng,
        locatedAt=iso(d.located_at),
        currentBookingId=d.current_booking_id,
        busyUntil=iso(d.busy_until),
        busyMinutes=minutes_until(d.busy_until),
    )


def document_out(doc: models.DriverDocument, names: dict[int, str]) -> schemas.DocumentOut:
    doc_type = DOC_TYPES.get(doc.doc_type, {"label": doc.doc_type, "dateKind": None})
    return schemas.DocumentOut(
        id=doc.id,
        docType=doc.doc_type,
        label=doc_type["label"],
        status=doc.status,  # type: ignore[arg-type]
        docDate=iso_date(doc.doc_date),
        validUntil=iso_date(valid_until(doc_type, doc)) if doc.doc_type in DOC_TYPES else None,
        reference=doc.reference,
        fileName=doc.file_name,
        contentType=doc.content_type,
        sizeBytes=doc.size_bytes,
        uploadedAt=iso(doc.uploaded_at) or "",
        reviewedAt=iso(doc.reviewed_at),
        reviewedBy=names.get(doc.reviewed_by_user_id) if doc.reviewed_by_user_id else None,
        rejectionReason=doc.rejection_reason,
        superseded=doc.superseded,
    )


def compliance_out(c: Compliance) -> schemas.ComplianceOut:
    return schemas.ComplianceOut(
        items=[
            schemas.DocStateOut(
                key=i.key,
                label=i.label,
                group=i.group,
                required=i.required,
                state=i.state,  # type: ignore[arg-type]
                validUntil=iso_date(i.valid_until),
                currentDocId=i.current_doc_id,
                approvedDocId=i.approved_doc_id,
                replacementPending=i.replacement_pending,
                rejectionReason=i.rejection_reason,
            )
            for i in c.items
        ],
        submitBlockers=c.submit_blockers,
        approvalBlockers=c.approval_blockers,
        workBlockers=c.work_blockers,
        motorwayBlockers=c.motorway_blockers,
        canSubmit=not c.submit_blockers,
        canApprove=not c.approval_blockers,
        canWork=not c.work_blockers,
        canMotorway=not c.motorway_blockers,
    )


def driver_documents(db: Session, driver_id: int) -> list[models.DriverDocument]:
    return list(
        db.scalars(
            select(models.DriverDocument)
            .where(models.DriverDocument.driver_id == driver_id)
            .order_by(models.DriverDocument.id.desc())
        ).all()
    )


def profile_out(
    db: Session,
    driver: models.Driver,
    docs: list[models.DriverDocument] | None = None,
) -> schemas.DriverProfileOut:
    docs = docs if docs is not None else driver_documents(db, driver.id)
    result = evaluate(driver, docs, today_uk())
    user = db.get(models.User, driver.user_id) if driver.user_id else None
    names = names_by_user_id(
        db, {d.reviewed_by_user_id for d in docs} | {driver.reviewed_by_user_id}
    )
    photo = next((i for i in result.items if i.key == "profile_photo"), None)
    return schemas.DriverProfileOut(
        id=driver.id,
        userId=driver.user_id,
        email=user.email if user else None,
        name=driver.name,
        phone=driver.phone,
        status=driver.application_status,  # type: ignore[arg-type]
        active=driver.active,
        submittedAt=iso(driver.submitted_at),
        reviewedAt=iso(driver.reviewed_at),
        reviewedBy=names.get(driver.reviewed_by_user_id) if driver.reviewed_by_user_id else None,
        reviewNote=driver.review_note,
        dateOfBirth=iso_date(driver.date_of_birth),
        addressLine1=driver.address_line1,
        addressLine2=driver.address_line2,
        town=driver.town,
        postcode=driver.postcode,
        emergencyContactName=driver.emergency_contact_name,
        emergencyContactPhone=driver.emergency_contact_phone,
        licenceNumber=driver.licence_number,
        licenceCategories=[c for c in (driver.licence_categories or "").split(",") if c],
        licenceExpiry=iso_date(driver.licence_expiry),
        licencePoints=driver.licence_points,
        licenceCheckedAt=iso_date(driver.licence_checked_at),
        vehicleReg=driver.vehicle_reg,
        vehicleMakeModel=driver.vehicle_make_model,
        vehicleType=driver.vehicle_type,
        vehicleGvwKg=driver.vehicle_gvw_kg,
        operatorLicenceNumber=driver.operator_licence_number,
        motorwayWork=driver.motorway_work,
        hasPhoto=bool(photo and photo.approved_doc_id),
        live=driver_out(driver),
        documents=[document_out(d, names) for d in docs if not d.superseded],
        compliance=compliance_out(result),
    )


def user_out(db: Session, user: models.User) -> schemas.UserOut:
    driver = (
        db.scalars(select(models.Driver).where(models.Driver.user_id == user.id)).first()
        if user.role == "driver"
        else None
    )
    return schemas.UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,  # type: ignore[arg-type]
        isActive=user.is_active,
        hasPassword=user.password_hash is not None,
        lastLoginAt=iso(user.last_login_at),
        createdAt=iso(user.created_at) or "",
        driverId=driver.id if driver else None,
        driverStatus=driver.application_status if driver else None,
    )


def audit_out(e: models.AuditEvent) -> schemas.AuditOut:
    return schemas.AuditOut(
        id=e.id,
        createdAt=iso(e.created_at) or "",
        actorUserId=e.actor_user_id,
        actorLabel=e.actor_label,
        action=e.action,
        targetType=e.target_type,
        targetId=e.target_id,
        detail=e.detail,
    )
