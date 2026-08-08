"""Seed the single metrics row to the canonical starting figures.

Safe to run repeatedly: an existing row is updated in place rather than
skipped, so correcting the numbers here is a one-command deploy.

Usage (from the backend/ directory, with DATABASE_URL set):
    python seed.py
"""

from sqlalchemy import select

from app import models
from app.db import SessionLocal

# Must stay believable against each other — see the note in src/metrics.tsx.
RESCUES_TODAY = 32
DRIVERS_AVAILABLE = 7
AVG_RESPONSE_MINUTES = 24


def main() -> None:
    with SessionLocal() as db:
        row = db.scalars(select(models.Metric)).first()
        if row is None:
            db.add(
                models.Metric(
                    rescues_today=RESCUES_TODAY,
                    drivers_available=DRIVERS_AVAILABLE,
                    avg_response_minutes=AVG_RESPONSE_MINUTES,
                )
            )
            db.commit()
            print("seeded metrics row")
            return

        row.rescues_today = RESCUES_TODAY
        row.drivers_available = DRIVERS_AVAILABLE
        row.avg_response_minutes = AVG_RESPONSE_MINUTES
        db.commit()
        print("updated metrics row to canonical figures")


if __name__ == "__main__":
    main()
