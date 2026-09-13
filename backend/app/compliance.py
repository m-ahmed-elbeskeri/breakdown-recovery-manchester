"""What a driver has to hold before they can work, and whether they hold it.

The list of documents lives in driver_documents.json, which the website
imports too, so the upload screen and these rules can never describe two
different sets of paperwork.

Three separate questions, because they have three different answers:

- Can this application be submitted?  Details complete, every required
  document uploaded.
- Can an admin approve it?  Every required document approved and in date,
  and the licence checked with DVLA recently.
- Can this driver work right now?  Account active, and nothing that matters
  on the road (licence, insurance, MOT, right to work) has lapsed since.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from . import models

CATALOGUE = json.loads(
    Path(__file__).with_name("driver_documents.json").read_text(encoding="utf-8")
)
DOC_TYPES: dict[str, dict] = {d["key"]: d for d in CATALOGUE["documents"]}
MAX_UPLOAD_BYTES: int = CATALOGUE["maxUploadBytes"]
EXPIRING_SOON_DAYS: int = CATALOGUE["expiringSoonDays"]
MINIMUM_AGE: int = CATALOGUE["minimumAge"]
HGV_WEIGHT_KG: int = CATALOGUE["hgvWeightKg"]
LICENCE_CHECK_VALID_DAYS: int = CATALOGUE["licenceCheckValidDays"]
LICENCE_CATEGORIES: list[str] = CATALOGUE["licenceCategories"]
VEHICLE_TYPES: set[str] = {v["key"] for v in CATALOGUE["vehicleTypes"]}

# DVLA driving licence number: five characters of surname (padded with 9s),
# six digits of birth date, two initials (padded with 9s), a check digit and
# two letters.
LICENCE_NUMBER = re.compile(r"^[A-Z9]{5}\d{6}[A-Z9]{2}\d[A-Z]{2}$")
UK_POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$")
UK_REGISTRATION = re.compile(r"^[A-Z0-9]{2,8}$")


# ── Uploads ─────────────────────────────────────────────────────────────────

_SIGNATURES: list[tuple[str, bytes, int]] = [
    ("image/jpeg", b"\xff\xd8\xff", 0),
    ("image/png", b"\x89PNG\r\n\x1a\n", 0),
    ("application/pdf", b"%PDF-", 0),
]


def sniff_content_type(data: bytes) -> str | None:
    """The real type of a file, from its first bytes. The browser's claim is ignored."""
    for content_type, signature, offset in _SIGNATURES:
        if data[offset : offset + len(signature)] == signature:
            return content_type
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def check_upload(doc_type: dict, data: bytes) -> str:
    """Return the file's content type, or raise ValueError saying what is wrong."""
    if not data:
        raise ValueError("That file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"That file is over {MAX_UPLOAD_BYTES // 1_000_000} MB. A photo or a smaller PDF will do."
        )
    content_type = sniff_content_type(data)
    if content_type is None:
        raise ValueError("Upload a photo (JPEG, PNG or WebP) or a PDF.")
    if doc_type["accept"] == "image" and not content_type.startswith("image/"):
        raise ValueError("This one needs to be a photo, not a PDF.")
    return content_type


def check_doc_date(doc_type: dict, doc_date: date | None, today: date) -> str | None:
    """Why a document's date will not do, or None."""
    kind = doc_type["dateKind"]
    if kind is None:
        return None
    if doc_date is None:
        if doc_type["dateRequired"]:
            return "Add the expiry date." if kind == "expiry" else "Add the date it was issued."
        return None
    if kind == "expiry":
        if doc_date < today:
            return f"That document expired on {doc_date:%d %b %Y}. Upload a current one."
        if doc_date > today + timedelta(days=366 * 15):
            return "Check the expiry date."
    if kind == "issued":
        if doc_date > today:
            return "The issue date can't be in the future."
        max_age = doc_type.get("maxAgeDays")
        if max_age and doc_date < today - timedelta(days=max_age):
            months = round(max_age / 30.4)
            span = f"{months} months" if months < 12 else "12 months"
            return f"It needs to have been issued in the last {span}."
    return None


# ── Profile rules ───────────────────────────────────────────────────────────


def is_hgv(driver: models.Driver) -> bool:
    return (driver.vehicle_gvw_kg or 0) > HGV_WEIGHT_KG


def required_category(gvw_kg: int | None) -> str:
    """The licence category needed for a vehicle of this gross weight."""
    if not gvw_kg or gvw_kg <= HGV_WEIGHT_KG:
        return "B"
    if gvw_kg <= 7500:
        return "C1"
    return "C"


def categories_of(driver: models.Driver) -> set[str]:
    return {c.strip().upper() for c in (driver.licence_categories or "").split(",") if c.strip()}


def licence_covers_vehicle(driver: models.Driver) -> bool:
    held = categories_of(driver)
    needed = required_category(driver.vehicle_gvw_kg)
    if needed == "B":
        return bool(held & {"B", "C1", "C"})
    if needed == "C1":
        return bool(held & {"C1", "C"})
    return "C" in held


def age_on(birth: date, today: date) -> int:
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


_PROFILE_FIELDS = [
    ("name", "your name"),
    ("phone", "your phone number"),
    ("date_of_birth", "date of birth"),
    ("address_line1", "address"),
    ("town", "town"),
    ("postcode", "postcode"),
    ("emergency_contact_name", "emergency contact"),
    ("emergency_contact_phone", "emergency contact's phone"),
    ("licence_number", "licence number"),
    ("licence_categories", "licence categories"),
    ("licence_expiry", "licence expiry date"),
    ("vehicle_reg", "vehicle registration"),
    ("vehicle_make_model", "vehicle make and model"),
    ("vehicle_type", "vehicle type"),
    ("vehicle_gvw_kg", "vehicle gross weight"),
]


def profile_problems(driver: models.Driver, today: date) -> list[str]:
    problems: list[str] = []
    missing = [label for attr, label in _PROFILE_FIELDS if getattr(driver, attr) in (None, "")]
    if missing:
        problems.append("Add " + ", ".join(missing) + ".")
    if driver.date_of_birth and age_on(driver.date_of_birth, today) < MINIMUM_AGE:
        problems.append(f"Drivers need to be at least {MINIMUM_AGE}.")
    if driver.licence_expiry and driver.licence_expiry < today:
        problems.append("Your driving licence has expired.")
    if driver.licence_categories and driver.vehicle_gvw_kg and not licence_covers_vehicle(driver):
        problems.append(
            f"A {driver.vehicle_gvw_kg:,} kg vehicle needs category "
            f"{required_category(driver.vehicle_gvw_kg)} on your licence."
        )
    return problems


# ── Documents ───────────────────────────────────────────────────────────────


def applies(doc_type: dict, driver: models.Driver) -> bool:
    """Whether this document is required of this driver."""
    rule = doc_type["rule"]
    if rule == "always":
        return True
    if rule == "hgv":
        return is_hgv(driver)
    if rule == "motorway":
        return bool(driver.motorway_work)
    return False


def valid_until(doc_type: dict, doc: models.DriverDocument) -> date | None:
    if doc.doc_date is None:
        return None
    if doc_type["dateKind"] == "expiry":
        return doc.doc_date
    if doc_type["dateKind"] == "issued" and doc_type.get("maxAgeDays"):
        return doc.doc_date + timedelta(days=doc_type["maxAgeDays"])
    return None


@dataclass
class DocState:
    key: str
    label: str
    group: str
    required: bool
    # missing | pending | rejected | approved | expiring | expired
    state: str
    valid_until: date | None = None
    current_doc_id: int | None = None
    approved_doc_id: int | None = None
    replacement_pending: bool = False
    rejection_reason: str | None = None


@dataclass
class Compliance:
    items: list[DocState] = field(default_factory=list)
    submit_blockers: list[str] = field(default_factory=list)
    approval_blockers: list[str] = field(default_factory=list)
    work_blockers: list[str] = field(default_factory=list)
    motorway_blockers: list[str] = field(default_factory=list)

    @property
    def expiring(self) -> list[DocState]:
        return [i for i in self.items if i.state in ("expiring", "expired") and i.approved_doc_id]


def _doc_state(
    doc_type: dict,
    driver: models.Driver,
    docs: list[models.DriverDocument],
    today: date,
) -> DocState:
    # Newest first. Ids only ever grow, so they order uploads without comparing
    # timestamps that SQLite hands back naive and Postgres hands back aware.
    live = sorted(
        (d for d in docs if d.doc_type == doc_type["key"] and not d.superseded),
        key=lambda d: d.id,
        reverse=True,
    )
    latest = live[0] if live else None
    approved = next((d for d in live if d.status == "approved"), None)
    item = DocState(
        key=doc_type["key"],
        label=doc_type["label"],
        group=doc_type["group"],
        required=applies(doc_type, driver),
        state="missing",
        current_doc_id=latest.id if latest else None,
    )
    if approved is not None:
        item.approved_doc_id = approved.id
        item.replacement_pending = latest is not None and latest.id != approved.id and latest.status == "pending"
        # A proof of address only has to be recent on the day the application
        # is approved; nobody re-proves where they live every quarter.
        ignore_expiry = doc_type.get("onlyAtApproval") and driver.application_status != "submitted"
        until = None if ignore_expiry else valid_until(doc_type, approved)
        item.valid_until = until
        if until is not None and until < today:
            item.state = "expired"
        elif until is not None and until <= today + timedelta(days=EXPIRING_SOON_DAYS):
            item.state = "expiring"
        else:
            item.state = "approved"
    elif latest is not None and latest.status == "pending":
        item.state = "pending"
        item.valid_until = valid_until(doc_type, latest)
    elif latest is not None and latest.status == "rejected":
        item.state = "rejected"
        item.rejection_reason = latest.rejection_reason
    return item


def evaluate(driver: models.Driver, docs: list[models.DriverDocument], today: date) -> Compliance:
    result = Compliance()
    uploaded_types = {d.doc_type for d in docs if not d.superseded}
    for doc_type in CATALOGUE["documents"]:
        if not (
            applies(doc_type, driver)
            or doc_type["rule"] == "optional"
            or doc_type["key"] in uploaded_types
        ):
            continue
        result.items.append(_doc_state(doc_type, driver, docs, today))

    profile = profile_problems(driver, today)
    required = [i for i in result.items if i.required]

    # Submit: details complete and something uploaded against every requirement.
    result.submit_blockers = list(profile)
    for item in required:
        if item.state == "missing":
            result.submit_blockers.append(f"Upload your {item.label.lower()}.")
        elif item.state == "rejected":
            reason = f": {item.rejection_reason}" if item.rejection_reason else "."
            result.submit_blockers.append(f"Replace your {item.label.lower()}{reason}")

    # Approve: every requirement checked by a person and in date.
    if driver.application_status != "submitted":
        result.approval_blockers.append("Only a submitted application can be approved.")
    result.approval_blockers.extend(profile)
    for item in required:
        problem = {
            "missing": "has not been uploaded",
            "pending": "still needs reviewing",
            "rejected": "was rejected and has not been replaced",
            "expired": "has expired",
        }.get(item.state)
        if problem:
            result.approval_blockers.append(f"{item.label} {problem}.")
    checked = driver.licence_checked_at
    if checked is None or checked < today - timedelta(days=LICENCE_CHECK_VALID_DAYS):
        result.approval_blockers.append(
            "Check the licence at gov.uk/check-driving-information and record the date."
        )

    # Work: nothing that matters on the road has lapsed.
    if driver.application_status != "active" or not driver.active:
        result.work_blockers.append("Your account is not active.")
    if driver.licence_expiry and driver.licence_expiry < today:
        result.work_blockers.append("Your driving licence has expired.")
    for item in required:
        doc_type = DOC_TYPES[item.key]
        if doc_type["blocks"] != "work":
            continue
        if item.state in ("missing", "pending", "rejected"):
            result.work_blockers.append(f"{item.label} is not approved yet.")
        elif item.state == "expired":
            result.work_blockers.append(f"{item.label} has expired. Upload the new one.")

    result.motorway_blockers = list(result.work_blockers)
    if not driver.motorway_work:
        result.motorway_blockers.append("You are not set up for motorway work.")
    else:
        motorway = next((i for i in result.items if i.key == "nhss17"), None)
        if motorway is None or motorway.state not in ("approved", "expiring"):
            result.motorway_blockers.append(
                "Your motorway recovery card (NHSS 17) is not approved and in date."
            )
    return result
