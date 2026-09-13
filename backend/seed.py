"""Seed the metrics row.

Only `avg_response_minutes` is still read from this row, and only until enough
real jobs have been timed for the API to quote a measured figure instead (see
`app.main.get_metrics`). Rescues and drivers on duty are counted live.

Safe to run repeatedly: an existing row is updated in place rather than
skipped, so correcting the number here is a one-command deploy.

Usage (from the backend/ directory, with DATABASE_URL set):
    python seed.py
"""

from sqlalchemy import select

from app import models
from app.db import SessionLocal

# The published average until it is measured. Must stay believable — a reader
# who catches one inflated number stops believing the response time too.
AVG_RESPONSE_MINUTES = 24


def main() -> None:
    with SessionLocal() as db:
        row = db.scalars(select(models.Metric)).first()
        if row is None:
            db.add(models.Metric(avg_response_minutes=AVG_RESPONSE_MINUTES))
            db.commit()
            print("seeded metrics row")
            return

        row.avg_response_minutes = AVG_RESPONSE_MINUTES
        db.commit()
        print("updated metrics row to canonical figures")


if __name__ == "__main__":
    main()
