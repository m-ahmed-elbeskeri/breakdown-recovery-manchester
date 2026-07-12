import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  (registers tables)
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def session_factory():
    # One shared in-memory SQLite connection for the whole test.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


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
