"""Driver applications, documents, review, and who is allowed to work."""

from datetime import date, timedelta

from app import models
from app.compliance import CATALOGUE, MAX_UPLOAD_BYTES
from tests.conftest import PASSWORD

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
PDF = b"%PDF-1.4\n" + b"\x00" * 200
TODAY = date.today()

PROFILE = {
    "dateOfBirth": "1985-05-01",
    "addressLine1": "1 Test Street",
    "town": "Salford",
    "postcode": "m65ua",
    "emergencyContactName": "Sam Smith",
    "emergencyContactPhone": "07700900111",
    "licenceNumber": "morga 657054 sm9ij",
    "licenceCategories": ["b"],
    "licenceExpiry": (TODAY + timedelta(days=3000)).isoformat(),
    "licencePoints": 0,
    "vehicleReg": "ab12 cde",
    "vehicleMakeModel": "Iveco Daily",
    "vehicleType": "flatbed",
    "vehicleGvwKg": 3500,
}


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def apply(client, email="dave@example.com", **overrides):
    body = {
        "name": "Dave Driver",
        "email": email,
        "phone": "07700 900123",
        "password": PASSWORD,
        "consent": True,
        **overrides,
    }
    return client.post("/api/drivers/apply", json=body)


def applicant(client, email="dave@example.com"):
    res = apply(client, email=email)
    assert res.status_code == 201, res.text
    return bearer(res.json()["token"])


def upload(client, headers, doc_type, data=PDF, **params):
    return client.post(
        "/api/me/documents",
        params={"docType": doc_type, **params},
        content=data,
        headers={**headers, "Content-Type": "application/octet-stream"},
    )


def date_for(doc_type):
    if doc_type["dateKind"] == "expiry":
        return (TODAY + timedelta(days=365)).isoformat()
    if doc_type["dateKind"] == "issued":
        return (TODAY - timedelta(days=5)).isoformat()
    return None


def upload_required(client, headers, rules=("always",)):
    for doc_type in CATALOGUE["documents"]:
        if doc_type["rule"] not in rules:
            continue
        params = {"docDate": date_for(doc_type)} if date_for(doc_type) else {}
        data = JPEG if doc_type["accept"] == "image" else PDF
        res = upload(client, headers, doc_type["key"], data, **params)
        assert res.status_code == 201, (doc_type["key"], res.text)


def ready_application(client, email="dave@example.com"):
    headers = applicant(client, email)
    assert client.post("/api/me/driver/profile", json=PROFILE, headers=headers).status_code == 200
    upload_required(client, headers)
    res = client.post("/api/me/driver/submit", headers=headers)
    assert res.status_code == 200, res.text
    return headers, res.json()["id"]


def approve_everything(client, admin_headers, driver_id):
    detail = client.get(f"/api/admin/drivers/{driver_id}", headers=admin_headers).json()
    for doc in detail["profile"]["documents"]:
        if doc["status"] == "pending":
            res = client.post(
                f"/api/admin/documents/{doc['id']}/review",
                json={"decision": "approve"},
                headers=admin_headers,
            )
            assert res.status_code == 200, res.text
    res = client.post(
        f"/api/admin/drivers/{driver_id}/profile",
        json={"licenceCheckedAt": TODAY.isoformat()},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    return client.post(
        f"/api/admin/drivers/{driver_id}/decision", json={"decision": "approve"}, headers=admin_headers
    )


def book(client, request_id, **overrides):
    payload = {
        "requestId": request_id,
        "region": "Manchester",
        "location": "M1 1AA",
        "phone": "07700900456",
        "service": "towing",
        "destination": "Bolton",
        "timing": "now",
        "pickupLat": 53.4772,
        "pickupLng": -2.2309,
        "price": 95,
        **overrides,
    }
    res = client.post("/api/bookings", json=payload)
    assert res.status_code == 201, res.text
    return res.json()["bookingId"]


def take(client, headers, booking_id, status="accepted"):
    return client.post(f"/api/me/jobs/{booking_id}/status", json={"status": status}, headers=headers)


# ── Applying ────────────────────────────────────────────────────────────────


def test_applying_creates_a_draft_and_signs_in(client):
    res = apply(client)
    assert res.status_code == 201, res.text
    session = res.json()
    assert session["user"]["role"] == "driver"
    assert session["user"]["driverStatus"] == "draft"
    profile = client.get("/api/me/driver", headers=bearer(session["token"])).json()
    assert profile["status"] == "draft"
    assert profile["compliance"]["canSubmit"] is False
    assert profile["compliance"]["canWork"] is False


def test_one_account_per_email(client):
    applicant(client, "dave@example.com")
    assert apply(client, email="DAVE@example.com").status_code == 409


def test_application_details_are_checked(client):
    assert apply(client, password="short").status_code == 422
    assert apply(client, consent=False).status_code == 422
    assert apply(client, phone="12345").status_code == 422
    assert apply(client, email="not-an-email").status_code == 422


# ── Profile ─────────────────────────────────────────────────────────────────


def test_profile_is_tidied_and_checked(client):
    headers = applicant(client)
    res = client.post("/api/me/driver/profile", json=PROFILE, headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["postcode"] == "M6 5UA"
    assert body["vehicleReg"] == "AB12CDE"
    assert body["licenceNumber"] == "MORGA657054SM9IJ"
    assert body["licenceCategories"] == ["B"]

    for bad in (
        {"postcode": "not a postcode"},
        {"licenceNumber": "123"},
        {"licenceCategories": ["Z"]},
        {"vehicleType": "rocket"},
        {"dateOfBirth": "2100-01-01"},
    ):
        assert client.post("/api/me/driver/profile", json=bad, headers=headers).status_code == 422, bad


def test_licence_categories_must_cover_the_vehicle(client):
    headers = applicant(client)
    heavy = {**PROFILE, "vehicleGvwKg": 7000, "licenceCategories": ["B"]}
    body = client.post("/api/me/driver/profile", json=heavy, headers=headers).json()
    blockers = " ".join(body["compliance"]["submitBlockers"])
    assert "category C1" in blockers
    required = {i["key"] for i in body["compliance"]["items"] if i["required"]}
    assert {"driver_cpc", "tacho_card", "operator_licence"} <= required


def test_applicants_must_be_old_enough(client):
    headers = applicant(client)
    young = {**PROFILE, "dateOfBirth": (TODAY - timedelta(days=365 * 19)).isoformat()}
    body = client.post("/api/me/driver/profile", json=young, headers=headers).json()
    assert any("at least 21" in b for b in body["compliance"]["submitBlockers"])


# ── Documents ───────────────────────────────────────────────────────────────


def test_uploads_are_judged_by_their_contents(client):
    headers = applicant(client)
    assert upload(client, headers, "dbs", b"just some text", docDate=TODAY.isoformat()).status_code == 422
    assert upload(client, headers, "profile_photo", PDF).status_code == 422
    photo = upload(client, headers, "profile_photo", PNG, fileName="../../me.exe")
    assert photo.status_code == 201, photo.text
    assert photo.json()["contentType"] == "image/png"
    assert photo.json()["fileName"] == "me.png"
    assert upload(client, headers, "no_such_thing", PDF).status_code == 422


def test_document_dates_are_checked(client):
    headers = applicant(client)
    assert upload(client, headers, "insurance_motor", PDF).status_code == 422, "expiry required"
    past = (TODAY - timedelta(days=1)).isoformat()
    assert upload(client, headers, "insurance_motor", PDF, docDate=past).status_code == 422
    old = (TODAY - timedelta(days=400)).isoformat()
    assert upload(client, headers, "dbs", PDF, docDate=old).status_code == 422
    future = (TODAY + timedelta(days=5)).isoformat()
    assert upload(client, headers, "dbs", PDF, docDate=future).status_code == 422
    ok = upload(client, headers, "insurance_motor", PDF, docDate=future, reference="  POL 123  ")
    assert ok.status_code == 201
    assert ok.json()["reference"] == "POL 123"


def test_oversized_uploads_are_refused(client):
    headers = applicant(client)
    big = b"%PDF-" + b"\x00" * (MAX_UPLOAD_BYTES + 2048)
    assert upload(client, headers, "v5c", big).status_code == 413


def test_uploading_again_replaces_the_waiting_copy(client):
    headers = applicant(client)
    day = (TODAY - timedelta(days=5)).isoformat()
    upload(client, headers, "dbs", PDF, docDate=day)
    upload(client, headers, "dbs", PDF, docDate=day)
    docs = client.get("/api/me/driver", headers=headers).json()["documents"]
    assert len([d for d in docs if d["docType"] == "dbs"]) == 1


def test_waiting_documents_can_be_removed_but_approved_ones_cannot(client, admin_headers):
    headers, driver_id = ready_application(client)
    docs = client.get("/api/me/driver", headers=headers).json()["documents"]
    v5c = next(d for d in docs if d["docType"] == "v5c")
    client.post(f"/api/admin/documents/{v5c['id']}/review", json={"decision": "approve"}, headers=admin_headers)
    assert client.delete(f"/api/me/documents/{v5c['id']}", headers=headers).status_code == 409

    extra = upload(client, headers, "recovery_training", PDF).json()
    assert client.delete(f"/api/me/documents/{extra['id']}", headers=headers).status_code == 204


def test_documents_are_private(client, admin_headers):
    dave = applicant(client, "dave@example.com")
    sam = applicant(client, "sam@example.com")
    doc = upload(client, dave, "v5c", PDF).json()

    assert client.get(f"/api/me/documents/{doc['id']}/file").status_code == 401
    assert client.get(f"/api/me/documents/{doc['id']}/file", headers=sam).status_code == 404
    own = client.get(f"/api/me/documents/{doc['id']}/file", headers=dave)
    assert own.status_code == 200
    assert own.content == PDF
    assert "sandbox" in own.headers["content-security-policy"]

    viewed = client.get(f"/api/admin/documents/{doc['id']}/file", headers=admin_headers)
    assert viewed.status_code == 200
    actions = [e["action"] for e in client.get("/api/admin/audit", headers=admin_headers).json()]
    assert "document.viewed" in actions


# ── Submitting and review ───────────────────────────────────────────────────


def test_an_application_cannot_be_sent_half_done(client):
    headers = applicant(client)
    res = client.post("/api/me/driver/submit", headers=headers)
    assert res.status_code == 422
    assert len(res.json()["detail"]["blockers"]) > 3


def test_licence_and_vehicle_are_locked_once_sent(client):
    headers, _ = ready_application(client)
    locked = client.post("/api/me/driver/profile", json={"vehicleReg": "XY99ZZZ"}, headers=headers)
    assert locked.status_code == 409
    contact = client.post("/api/me/driver/profile", json={"phone": "07700 900777"}, headers=headers)
    assert contact.status_code == 200


def test_approval_waits_for_every_document_and_a_dvla_check(client, admin_headers):
    _, driver_id = ready_application(client)
    res = client.post(
        f"/api/admin/drivers/{driver_id}/decision", json={"decision": "approve"}, headers=admin_headers
    )
    assert res.status_code == 409
    blockers = " ".join(res.json()["detail"]["blockers"])
    assert "still needs reviewing" in blockers
    assert "check-driving-information" in blockers


def test_the_full_review(client, admin_headers):
    headers, driver_id = ready_application(client)
    detail = client.get(f"/api/admin/drivers/{driver_id}", headers=admin_headers).json()
    assert detail["profile"]["status"] == "submitted"
    dbs = next(d for d in detail["profile"]["documents"] if d["docType"] == "dbs")

    # A rejection needs a reason the driver can act on.
    assert client.post(
        f"/api/admin/documents/{dbs['id']}/review", json={"decision": "reject"}, headers=admin_headers
    ).status_code == 422
    client.post(
        f"/api/admin/documents/{dbs['id']}/review",
        json={"decision": "reject", "reason": "The certificate number is cut off."},
        headers=admin_headers,
    )
    # So does turning down the application.
    assert client.post(
        f"/api/admin/drivers/{driver_id}/decision", json={"decision": "reject"}, headers=admin_headers
    ).status_code == 422
    client.post(
        f"/api/admin/drivers/{driver_id}/decision",
        json={"decision": "reject", "note": "Please send a clearer DBS certificate."},
        headers=admin_headers,
    )

    mine = client.get("/api/me/driver", headers=headers).json()
    assert mine["status"] == "rejected"
    assert mine["reviewNote"] == "Please send a clearer DBS certificate."
    state = next(i for i in mine["compliance"]["items"] if i["key"] == "dbs")
    assert state["state"] == "rejected"
    assert state["rejectionReason"] == "The certificate number is cut off."

    assert upload(client, headers, "dbs", PDF, docDate=(TODAY - timedelta(days=3)).isoformat()).status_code == 201
    assert client.post("/api/me/driver/submit", headers=headers).status_code == 200

    approved = approve_everything(client, admin_headers, driver_id)
    assert approved.status_code == 200, approved.text
    assert approved.json()["profile"]["status"] == "active"
    actions = {e["action"] for e in approved.json()["audit"]}
    assert {"driver.approved", "document.rejected", "document.approved", "driver.licence_checked"} <= actions

    assert client.get("/api/me/jobs", headers=headers).status_code == 200
    assert client.post("/api/me/state", json={"available": True}, headers=headers).status_code == 200


def test_applicants_cannot_work(client):
    headers = applicant(client)
    assert client.get("/api/me/jobs", headers=headers).status_code == 403
    assert client.post("/api/me/state", json={"available": True}, headers=headers).status_code == 403


def test_the_queue_puts_applications_waiting_for_review_first(client, admin_headers):
    applicant(client, "early@example.com")
    ready_application(client, "ready@example.com")
    rows = client.get("/api/admin/drivers", headers=admin_headers).json()
    assert rows[0]["status"] == "submitted"
    assert rows[0]["pendingDocs"] > 0


# ── On the road ─────────────────────────────────────────────────────────────


def _set_doc_date(session_factory, driver_id, doc_type, when):
    with session_factory() as db:
        doc = (
            db.query(models.DriverDocument)
            .filter_by(driver_id=driver_id, doc_type=doc_type, superseded=False)
            .one()
        )
        doc.doc_date = when
        db.commit()


def test_lapsed_insurance_takes_a_driver_off_the_road(client, driver_login, session_factory):
    headers, driver_id = driver_login()
    _set_doc_date(session_factory, driver_id, "insurance_motor", TODAY - timedelta(days=1))

    res = client.post("/api/me/state", json={"available": True}, headers=headers)
    assert res.status_code == 409
    assert any("Recovery vehicle insurance" in b for b in res.json()["detail"]["blockers"])

    job = book(client, "lapsed")
    assert take(client, headers, job).status_code == 409


def test_a_renewal_keeps_the_driver_working_until_it_is_approved(
    client, driver_login, admin_headers
):
    headers, driver_id = driver_login()
    renewal = upload(
        client, headers, "insurance_motor", PDF, docDate=(TODAY + timedelta(days=700)).isoformat()
    ).json()
    mine = client.get("/api/me/driver", headers=headers).json()
    item = next(i for i in mine["compliance"]["items"] if i["key"] == "insurance_motor")
    assert mine["compliance"]["canWork"] is True
    assert item["replacementPending"] is True

    client.post(f"/api/admin/documents/{renewal['id']}/review", json={"decision": "approve"}, headers=admin_headers)
    history = client.get(f"/api/admin/drivers/{driver_id}", headers=admin_headers).json()["history"]
    insurance = [d for d in history if d["docType"] == "insurance_motor"]
    assert [d["superseded"] for d in insurance] == [False, True]


def test_motorway_jobs_need_the_motorway_card(client, driver_login):
    headers, _ = driver_login(motorway_work=False)
    motorway = book(client, "m60", motorway=True)
    ordinary = book(client, "street")
    res = take(client, headers, motorway)
    assert res.status_code == 409
    assert "motorway" in res.json()["detail"]["message"]
    assert take(client, headers, ordinary).status_code == 200


def test_drivers_see_waiting_jobs_without_the_customers_number(client, driver_login):
    headers, driver_id = driver_login()
    job = book(client, "privacy")
    waiting = client.get("/api/me/jobs", headers=headers).json()
    row = next(j for j in waiting if j["id"] == job)
    assert row["phone"] is None
    assert row["trackToken"] is None

    taken = take(client, headers, job).json()
    assert taken["phone"] == "07700 900456"
    assert taken["trackToken"] is None


def test_drivers_never_see_other_drivers_jobs(client, driver_login):
    dave, _ = driver_login(name="Dave")
    sam, _ = driver_login(name="Sam")
    job = book(client, "daves")
    take(client, dave, job)
    assert all(j["id"] != job for j in client.get("/api/me/jobs", headers=sam).json())


def test_one_job_at_a_time(client, driver_login):
    headers, _ = driver_login()
    first = book(client, "first")
    second = book(client, "second")
    assert take(client, headers, first).status_code == 200
    res = take(client, headers, second)
    assert res.status_code == 409
    assert f"#{first}" in res.json()["detail"]


def test_a_job_can_be_handed_back_until_the_driver_arrives(client, driver_login):
    headers, _ = driver_login()
    job = book(client, "handback")
    take(client, headers, job)
    released = take(client, headers, job, "pending").json()
    assert released["status"] == "pending"
    assert released["driverId"] is None

    take(client, headers, job)
    take(client, headers, job, "on_scene")
    assert take(client, headers, job, "pending").status_code == 409


def test_drivers_cannot_move_a_job_backwards_or_cancel_it(client, driver_login):
    headers, _ = driver_login()
    job = book(client, "backwards")
    take(client, headers, job)
    take(client, headers, job, "en_route")
    assert take(client, headers, job, "accepted").status_code == 409
    assert take(client, headers, job, "cancelled").status_code == 422


def test_position_is_not_recorded_off_duty(client, driver_login, admin_headers):
    headers, driver_id = driver_login()
    client.post("/api/me/state", json={"lat": 53.5, "lng": -2.2}, headers=headers)
    roster = client.get("/api/drivers", headers=admin_headers).json()
    me = next(d for d in roster if d["id"] == driver_id)
    assert me["lat"] is None


def test_suspension_signs_the_driver_out_and_hands_their_jobs_back(client, driver_login, admin_headers):
    headers, driver_id = driver_login()
    job = book(client, "suspend")
    take(client, headers, job)

    assert client.post(
        f"/api/admin/drivers/{driver_id}/decision", json={"decision": "suspend"}, headers=admin_headers
    ).status_code == 422
    res = client.post(
        f"/api/admin/drivers/{driver_id}/decision",
        json={"decision": "suspend", "note": "Complaint under investigation."},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert client.get("/api/me/driver", headers=headers).status_code == 401
    booking = next(b for b in client.get("/api/bookings", headers=admin_headers).json() if b["id"] == job)
    assert booking["status"] == "pending"
    assert booking["driverId"] is None

    back = client.post(
        f"/api/admin/drivers/{driver_id}/decision", json={"decision": "reinstate"}, headers=admin_headers
    )
    assert back.json()["profile"]["status"] == "active"


def test_the_office_cannot_assign_a_driver_who_cannot_work(
    client, compliant_driver, session_factory, admin_headers
):
    driver_id = compliant_driver()
    _set_doc_date(session_factory, driver_id, "mot", TODAY - timedelta(days=2))
    job = book(client, "assign")
    res = client.post(
        f"/api/bookings/{job}/status", json={"status": "accepted", "driverId": driver_id}, headers=admin_headers
    )
    assert res.status_code == 409
    assert any("MOT" in b for b in res.json()["detail"]["blockers"])


# ── The office ──────────────────────────────────────────────────────────────


def test_compliance_report_flags_what_is_about_to_lapse(client, driver_login, session_factory, admin_headers):
    _, driver_id = driver_login()
    _set_doc_date(session_factory, driver_id, "insurance_git", TODAY + timedelta(days=10))
    rows = client.get("/api/admin/compliance", headers=admin_headers).json()
    row = next(r for r in rows if r["driverId"] == driver_id and r["key"] == "insurance_git")
    assert row["state"] == "expiring"
    assert row["blocksWork"] is True


def test_an_invited_driver_sets_a_password_and_starts_their_application(client, admin_headers):
    res = client.post(
        "/api/admin/drivers/invite",
        json={"name": "Pat Newstart", "email": "pat@example.com", "phone": "07700 900321"},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    token = res.json()["setupPath"].split("token=")[1].split("&")[0]
    done = client.post("/api/auth/password-reset/confirm", json={"token": token, "password": "pat's own phrase"})
    assert done.status_code == 200, done.text
    assert done.json()["user"]["driverStatus"] == "draft"


def test_an_existing_driver_can_be_given_an_account(client, compliant_driver, admin_headers):
    driver_id = compliant_driver(name="Old Hand")
    res = client.post(
        f"/api/admin/drivers/{driver_id}/account", json={"email": "oldhand@example.com"}, headers=admin_headers
    )
    assert res.status_code == 201, res.text
    token = res.json()["setupPath"].split("token=")[1].split("&")[0]
    session = client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": "old hand's phrase"}
    ).json()
    mine = client.get("/api/me/driver", headers=bearer(session["token"])).json()
    assert mine["id"] == driver_id
    assert mine["status"] == "active"
    assert mine["compliance"]["canWork"] is True


def test_the_office_can_upload_on_a_drivers_behalf(client, admin_headers):
    applicant(client)
    driver_id = client.get("/api/admin/drivers", headers=admin_headers).json()[0]["id"]
    res = client.post(
        f"/api/admin/drivers/{driver_id}/documents",
        params={"docType": "v5c"},
        content=PDF,
        headers={**admin_headers, "Content-Type": "application/octet-stream"},
    )
    assert res.status_code == 201, res.text
