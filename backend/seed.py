"""Seed the single metrics row. Safe to run repeatedly (idempotent).

Usage (from the backend/ directory, with DATABASE_URL set):
    python seed.py
"""

from sqlalchemy import select

from app import models
from app.db import SessionLocal


def main() -> None:
    with SessionLocal() as db:
        if db.scalars(select(models.Metric)).first() is not None:
            print("metrics row already exists — nothing to do")
            return
        db.add(
            models.Metric(rescues_today=148, drivers_available=7, avg_response_minutes=24)
        )
        db.commit()
        print("seeded metrics row")


if __name__ == "__main__":
    main()
