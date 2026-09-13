"""Accounts: first-run setup, signing in, lockout, sessions and password links."""

from datetime import timedelta

from app import models
from app.config import settings
from app.timeutil import now
from tests.conftest import PASSWORD

NEW_PASSWORD = "a brand new phrase"


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ── First run ───────────────────────────────────────────────────────────────


def test_first_admin_is_created_once_with_the_operator_key(client):
    assert client.get("/api/auth/setup").json() == {"needsSetup": True}
    body = {
        "operatorKey": "wrong",
        "name": "Office Admin",
        "email": "Boss@Example.com",
        "password": PASSWORD,
    }
    assert client.post("/api/auth/setup", json=body).status_code == 403

    ok = client.post("/api/auth/setup", json={**body, "operatorKey": settings.admin_api_key})
    assert ok.status_code == 201, ok.text
    session = ok.json()
    assert session["user"]["role"] == "admin"
    assert session["user"]["email"] == "boss@example.com"
    assert client.get("/api/auth/me", headers=bearer(session["token"])).status_code == 200
    assert client.get("/api/auth/setup").json() == {"needsSetup": False}

    again = client.post(
        "/api/auth/setup",
        json={**body, "operatorKey": settings.admin_api_key, "email": "other@example.com"},
    )
    assert again.status_code == 409


def test_setup_refuses_a_weak_password(client):
    res = client.post(
        "/api/auth/setup",
        json={
            "operatorKey": settings.admin_api_key,
            "name": "Office Admin",
            "email": "a@example.com",
            "password": "short",
        },
    )
    assert res.status_code == 422


# ── Signing in ──────────────────────────────────────────────────────────────


def test_login_is_case_insensitive_on_email(client, make_user):
    _, email = make_user(role="admin", password=PASSWORD)
    res = login(client, email.upper())
    assert res.status_code == 200, res.text
    me = client.get("/api/auth/me", headers=bearer(res.json()["token"])).json()
    assert me["email"] == email
    assert me["role"] == "admin"
    assert me["hasPassword"] is True


def test_wrong_password_and_unknown_email_look_the_same(client, make_user):
    _, email = make_user(password=PASSWORD)
    wrong = login(client, email, "not the password")
    unknown = login(client, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_account_locks_after_repeated_failures(client, make_user):
    _, email = make_user(password=PASSWORD)
    for _ in range(settings.login_max_failures):
        assert login(client, email, "not the password").status_code == 401
    locked = login(client, email)
    assert locked.status_code == 429
    assert "Try again" in locked.json()["detail"]


def test_an_account_without_a_password_cannot_sign_in(client, make_user):
    _, email = make_user(password=None)
    assert login(client, email, "anything at all").status_code == 401


def test_disabled_account_cannot_sign_in_or_keep_its_session(
    client, make_user, session_headers, admin_headers
):
    user_id, email = make_user(role="driver", password=PASSWORD)
    headers = session_headers(user_id)
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    res = client.post(
        f"/api/admin/users/{user_id}/active", json={"active": False}, headers=admin_headers
    )
    assert res.status_code == 200, res.text
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert login(client, email).status_code == 401


def test_logout_ends_the_session(client, make_user, session_headers):
    user_id, _ = make_user()
    headers = session_headers(user_id)
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_logout_everywhere_ends_every_session(client, make_user):
    _, email = make_user(password=PASSWORD)
    a = login(client, email).json()["token"]
    b = login(client, email).json()["token"]
    assert client.post("/api/auth/logout-all", headers=bearer(a)).status_code == 204
    assert client.get("/api/auth/me", headers=bearer(a)).status_code == 401
    assert client.get("/api/auth/me", headers=bearer(b)).status_code == 401


def test_expired_session_is_refused(client, make_user, session_factory, session_headers):
    user_id, _ = make_user()
    headers = session_headers(user_id)
    with session_factory() as db:
        for s in db.query(models.AuthSession).all():
            s.expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_tokens_are_stored_hashed(client, make_user, session_factory):
    _, email = make_user(password=PASSWORD)
    token = login(client, email).json()["token"]
    with session_factory() as db:
        stored = [s.token_hash for s in db.query(models.AuthSession).all()]
    assert token not in stored
    assert all(len(h) == 64 for h in stored)


# ── Passwords ───────────────────────────────────────────────────────────────


def test_changing_password_signs_out_everywhere_else(client, make_user):
    _, email = make_user(password=PASSWORD)
    a = login(client, email).json()["token"]
    b = login(client, email).json()["token"]
    res = client.post(
        "/api/auth/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=bearer(a),
    )
    assert res.status_code == 204, res.text
    assert client.get("/api/auth/me", headers=bearer(a)).status_code == 200
    assert client.get("/api/auth/me", headers=bearer(b)).status_code == 401
    assert login(client, email).status_code == 401
    assert login(client, email, NEW_PASSWORD).status_code == 200


def test_changing_password_needs_the_current_one(client, make_user):
    _, email = make_user(password=PASSWORD)
    token = login(client, email).json()["token"]
    res = client.post(
        "/api/auth/password",
        json={"currentPassword": "guessing wildly", "newPassword": NEW_PASSWORD},
        headers=bearer(token),
    )
    assert res.status_code == 403


def test_common_and_email_based_passwords_are_refused(client, make_user):
    _, email = make_user(password=PASSWORD)
    token = login(client, email).json()["token"]
    for weak in ("password123", "aaaaaaaaaaaa", email.split("@")[0] + "12345"):
        res = client.post(
            "/api/auth/password",
            json={"currentPassword": PASSWORD, "newPassword": weak},
            headers=bearer(token),
        )
        assert res.status_code == 422, weak


def test_password_reset_by_email_link(client, make_user, monkeypatch):
    sent = {}
    monkeypatch.setattr(
        "app.auth.send_password_link",
        lambda email, name, link, purpose: sent.update(email=email, link=link, purpose=purpose),
    )
    _, email = make_user(password=PASSWORD)
    old = login(client, email).json()["token"]
    origin = settings.cors_origin_list[0]

    res = client.post("/api/auth/password-reset/request", json={"email": email, "origin": origin})
    assert res.status_code == 204
    assert sent["email"] == email
    assert sent["purpose"] == "reset"
    assert sent["link"].startswith(f"{origin}/reset-password?token=")
    token = sent["link"].split("token=")[1]

    check = client.get("/api/auth/password-reset/check", params={"token": token}).json()
    assert check["valid"] is True and check["purpose"] == "reset"

    done = client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": NEW_PASSWORD}
    )
    assert done.status_code == 200, done.text
    assert client.get("/api/auth/me", headers=bearer(done.json()["token"])).status_code == 200
    assert client.get("/api/auth/me", headers=bearer(old)).status_code == 401

    reused = client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": "another new phrase"}
    )
    assert reused.status_code == 410


def test_reset_links_only_point_at_known_sites(client, make_user, monkeypatch):
    sent = {}
    monkeypatch.setattr(
        "app.auth.send_password_link",
        lambda email, name, link, purpose: sent.update(link=link),
    )
    _, email = make_user(password=PASSWORD)
    client.post(
        "/api/auth/password-reset/request",
        json={"email": email, "origin": "https://evil.example"},
    )
    assert sent["link"].startswith(settings.site_url.rstrip("/"))


def test_reset_request_does_not_reveal_accounts(client, monkeypatch):
    calls = []
    monkeypatch.setattr("app.auth.send_password_link", lambda *a: calls.append(a))
    res = client.post("/api/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert res.status_code == 204
    assert calls == []


def test_reset_requests_are_throttled(client, make_user, monkeypatch):
    calls = []
    monkeypatch.setattr("app.auth.send_password_link", lambda *a: calls.append(a))
    _, email = make_user(password=PASSWORD)
    for _ in range(3):
        client.post("/api/auth/password-reset/request", json={"email": email})
    assert len(calls) == 1


# ── Admin accounts ──────────────────────────────────────────────────────────


def test_admin_invites_another_admin(client, admin_headers):
    res = client.post(
        "/api/admin/users", json={"name": "Second Admin", "email": "two@example.com"}, headers=admin_headers
    )
    assert res.status_code == 201, res.text
    token = res.json()["setupPath"].split("token=")[1].split("&")[0]
    check = client.get("/api/auth/password-reset/check", params={"token": token}).json()
    assert check == {"valid": True, "purpose": "invite", "name": "Second Admin", "email": "two@example.com"}

    done = client.post("/api/auth/password-reset/confirm", json={"token": token, "password": NEW_PASSWORD})
    assert done.status_code == 200
    assert done.json()["user"]["role"] == "admin"
    admins = client.get("/api/admin/users", headers=admin_headers).json()
    assert {a["email"] for a in admins} >= {"two@example.com"}


def test_an_admin_cannot_switch_off_themselves_or_the_last_admin(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    res = client.post(f"/api/admin/users/{me['id']}/active", json={"active": False}, headers=admin_headers)
    assert res.status_code == 409


def test_drivers_cannot_reach_the_office(client, make_user, session_headers):
    user_id, _ = make_user(role="driver")
    headers = session_headers(user_id)
    for path in ("/api/admin/drivers", "/api/admin/telemetry", "/api/admin/audit", "/api/drivers"):
        assert client.get(path, headers=headers).status_code == 403, path


def test_sign_ins_are_audited(client, make_user, admin_headers):
    _, email = make_user(password=PASSWORD)
    login(client, email)
    actions = [e["action"] for e in client.get("/api/admin/audit", headers=admin_headers).json()]
    assert "account.signed_in" in actions
