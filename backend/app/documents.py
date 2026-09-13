"""Storing and serving a driver's documents.

Files are sniffed, not trusted: the type is read from the bytes, the name is
cleaned, and the response that serves one back is sandboxed so an uploaded
PDF can never run script in the admin's browser.
"""

import hashlib
import re
from datetime import date

from fastapi import HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, models
from .compliance import DOC_TYPES, check_doc_date, check_upload
from .timeutil import today_uk

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")
_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def safe_file_name(name: str | None, doc_key: str, content_type: str) -> str:
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = _SAFE_NAME.sub("", base).strip(" .")[:100]
    stem = base.rsplit(".", 1)[0] if "." in base else base
    return f"{stem or doc_key}{_EXTENSIONS[content_type]}"


def store_document(
    db: Session,
    driver: models.Driver,
    *,
    doc_key: str,
    data: bytes,
    doc_date: date | None,
    reference: str | None,
    file_name: str | None,
    uploader: models.User,
) -> models.DriverDocument:
    doc_type = DOC_TYPES.get(doc_key)
    if doc_type is None:
        raise HTTPException(status_code=422, detail="Unknown document type.")
    try:
        content_type = check_upload(doc_type, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if doc_type["dateKind"] is None:
        doc_date = None
    problem = check_doc_date(doc_type, doc_date, today_uk())
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    reference = " ".join((reference or "").split())[:60] or None

    # Anything still waiting or turned down is replaced by this. An approved
    # copy stays in force until this one is approved, so a driver renewing
    # their insurance is not taken off the road in the meantime.
    for old in db.scalars(
        select(models.DriverDocument).where(
            models.DriverDocument.driver_id == driver.id,
            models.DriverDocument.doc_type == doc_key,
            models.DriverDocument.superseded.is_(False),
            models.DriverDocument.status.in_(("pending", "rejected")),
        )
    ).all():
        old.superseded = True

    doc = models.DriverDocument(
        driver_id=driver.id,
        doc_type=doc_key,
        status="pending",
        doc_date=doc_date,
        reference=reference,
        file_name=safe_file_name(file_name, doc_key, content_type),
        content_type=content_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        uploaded_by_user_id=uploader.id,
    )
    db.add(doc)
    db.flush()
    db.add(models.DriverDocumentFile(document_id=doc.id, data=data))
    audit.record(
        db,
        uploader,
        "document.uploaded",
        target_type="document",
        target_id=doc.id,
        detail={"driverId": driver.id, "docType": doc_key},
    )
    return doc


def file_response(db: Session, doc: models.DriverDocument) -> Response:
    stored = db.get(models.DriverDocumentFile, doc.id)
    if stored is None:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=stored.data,
        media_type=doc.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.file_name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        },
    )
