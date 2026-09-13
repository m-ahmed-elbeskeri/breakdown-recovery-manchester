"""Applying a change to a driver's details, with who may change what."""

from fastapi import HTTPException

from . import models, schemas

FIELD_MAP = {
    "name": "name",
    "phone": "phone",
    "dateOfBirth": "date_of_birth",
    "addressLine1": "address_line1",
    "addressLine2": "address_line2",
    "town": "town",
    "postcode": "postcode",
    "emergencyContactName": "emergency_contact_name",
    "emergencyContactPhone": "emergency_contact_phone",
    "licenceNumber": "licence_number",
    "licenceCategories": "licence_categories",
    "licenceExpiry": "licence_expiry",
    "licencePoints": "licence_points",
    "licenceCheckedAt": "licence_checked_at",
    "vehicleReg": "vehicle_reg",
    "vehicleMakeModel": "vehicle_make_model",
    "vehicleType": "vehicle_type",
    "vehicleGvwKg": "vehicle_gvw_kg",
    "operatorLicenceNumber": "operator_licence_number",
    "motorwayWork": "motorway_work",
}

# What a driver can change on their own once their application is in: how to
# reach them. Their licence and truck were what got checked, so changing those
# goes through the office.
CONTACT_FIELDS = {
    "phone",
    "addressLine1",
    "addressLine2",
    "town",
    "postcode",
    "emergencyContactName",
    "emergencyContactPhone",
    "motorwayWork",
}


def apply_profile(
    driver: models.Driver,
    user: models.User | None,
    payload: schemas.DriverProfileIn,
    *,
    allowed: set[str] | None,
    locked_message: str = "",
) -> list[str]:
    """Apply the fields that were sent. Returns the names of those that changed."""
    changed: list[str] = []
    for key in sorted(payload.model_fields_set):
        attr = FIELD_MAP.get(key)
        if attr is None:
            continue
        value = getattr(payload, key)
        if key == "licenceCategories":
            value = ",".join(value) if value else None
        if key == "motorwayWork":
            value = bool(value)
        if key == "name" and not value:
            raise HTTPException(status_code=422, detail="The name can't be blank.")
        if getattr(driver, attr) == value:
            continue
        if allowed is not None and key not in allowed:
            raise HTTPException(status_code=409, detail=locked_message)
        setattr(driver, attr, value)
        changed.append(key)
        if user is not None and key == "name":
            user.name = value
        if user is not None and key == "phone":
            user.phone = value
    return changed
