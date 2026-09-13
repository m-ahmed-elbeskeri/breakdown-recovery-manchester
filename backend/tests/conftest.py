import os
import secrets
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  (registers tables)
from app.compliance import CATALOGUE
from app.db import Base, get_db
from app.main import app
from app.security import hash_password, hash_token, new_token
from app.timeutil import now

PASSWORD = "correct horse battery"


@pytest.fixture
def session_factory():
    # In-memory SQLite by default. Set TEST_DATABASE_URL to a throwaway
    # Postgres to run the same suite against the database production uses.
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        engine = create_engine(url)
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
    else:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, autocommit=False)
    engine.dispose()


@pytest.fixture
def client(session_factory):
    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def seed_metric(session_factory):
    def _seed(rescues=148, drivers=7, avg=24):
        with session_factory() as db:
            db.add(
                models.Metric(
                    rescues_today=rescues, drivers_available=drivers, avg_response_minutes=avg
                )
            )
            db.commit()

    return _seed


# ── Accounts ────────────────────────────────────────────────────────────────


@pytest.fixture
def make_user(session_factory):
    """Create an account. password=None skips hashing, for speed."""

    def _make(role="admin", email=None, name=None, password=None, active=True):
        with session_factory() as db:
            user = models.User(
                email=email or f"{role}-{secrets.token_hex(4)}@example.com",
                name=name or ("Office Admin" if role == "admin" else "Test Driver"),
                role=role,
                password_hash=hash_password(password) if password else None,
                is_active=active,
            )
            db.add(user)
            db.commit()
            return user.id, user.email

    return _make


@pytest.fixture
def session_headers(session_factory):
    """A signed-in session for a user id, made directly rather than by logging in."""

    def _headers(user_id: int) -> dict[str, str]:
        token = new_token()
        with session_factory() as db:
            db.add(
                models.AuthSession(
                    user_id=user_id,
                    token_hash=hash_token(token),
                    expires_at=now() + timedelta(days=1),
                    last_used_at=now(),
                )
            )
            db.commit()
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def admin_headers(make_user, session_headers):
    user_id, _ = make_user(role="admin")
    return session_headers(user_id)


# ── Drivers ─────────────────────────────────────────────────────────────────


def seed_documents(db, driver_id: int, *, include=("always", "motorway"), status="approved"):
    today = date.today()
    for doc_type in CATALOGUE["documents"]:
        if doc_type["rule"] not in include:
            continue
        doc_date = None
        if doc_type["dateKind"] == "expiry":
            doc_date = today + timedelta(days=400)
        elif doc_type["dateKind"] == "issued":
            doc_date = today - timedelta(days=10)
        doc = models.DriverDocument(
            driver_id=driver_id,
            doc_type=doc_type["key"],
            status=status,
            doc_date=doc_date,
            file_name=f"{doc_type['key']}.jpg",
            content_type="image/jpeg",
            size_bytes=4,
            sha256="0" * 64,
        )
        db.add(doc)
        db.flush()
        db.add(models.DriverDocumentFile(document_id=doc.id, data=b"\xff\xd8\xff\xe0"))


@pytest.fixture
def compliant_driver(session_factory):
    """An approved driver holding every document, in date. Returns the driver id."""

    def _make(user_id=None, **fields):
        today = date.today()
        values = dict(
            name="Test Driver",
            phone="07700 900999",
            user_id=user_id,
            application_status="active",
            active=True,
            available=False,
            date_of_birth=date(1985, 5, 1),
            address_line1="1 Test Street",
            town="Salford",
            postcode="M6 5UA",
            emergency_contact_name="Sam Smith",
            emergency_contact_phone="07700 900111",
            licence_number="MORGA657054SM9IJ",
            licence_categories="B,C1",
            licence_expiry=today + timedelta(days=3000),
            licence_points=0,
            licence_checked_at=today,
            vehicle_reg="AB12CDE",
            vehicle_make_model="Iveco Daily",
            vehicle_type="flatbed",
            vehicle_gvw_kg=3500,
            motorway_work=True,
        )
        values.update(fields)
        with session_factory() as db:
            driver = models.Driver(**values)
            db.add(driver)
            db.flush()
            seed_documents(db, driver.id)
            db.commit()
            return driver.id

    return _make


@pytest.fixture
def driver_login(make_user, compliant_driver, session_headers):
    """A driver with an account and a session. Returns (headers, driver_id)."""

    def _login(**fields):
        user_id, _ = make_user(role="driver", name=fields.get("name", "Test Driver"))
        driver_id = compliant_driver(user_id=user_id, **fields)
        return session_headers(user_id), driver_id

    return _login
