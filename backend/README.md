# Backend — 24/7 Breakdown Recovery API

FastAPI + SQLAlchemy 2.0 + Alembic, backed by Postgres (Neon by default).
Provides the booking + metrics API the website calls.

## Endpoints

| Method | Path            | Auth        | Purpose                                    |
| ------ | --------------- | ----------- | ------------------------------------------ |
| GET    | `/api/health`   | —           | Liveness check                             |
| GET    | `/api/metrics`  | —           | Live dispatch metrics                      |
| POST   | `/api/bookings` | —           | Create a booking (idempotent on requestId) |
| GET    | `/api/bookings` | `x-api-key` | List recent bookings (admin)               |

Interactive docs run at `http://localhost:8000/docs`.

## 1. Get a free Postgres database (Neon)

1. Sign up at **https://neon.tech** (free tier, no card).
2. Create a project → open **Connection Details** → copy the connection string
   (looks like `postgresql://user:pass@ep-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require`).

> Supabase, Render, Railway etc. work too — just paste their Postgres URL. The
> app normalises the driver automatically.

## 2. Configure

```bash
cd backend
cp .env.example .env
# edit .env:  DATABASE_URL = <your Neon URL>,  ADMIN_API_KEY = <a random secret>
```

Generate an admin key: `python -c "import secrets; print(secrets.token_urlsafe(24))"`

## 3. Install

```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate       macOS/Linux:  source .venv/bin/activate
pip install -r requirements-dev.txt
```

## 4. Migrate + seed

```bash
alembic upgrade head     # creates the tables
python seed.py           # inserts the initial metrics row
```

Making a schema change later? Edit `app/models.py`, then:

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## 5. Run

```bash
uvicorn app.main:app --reload --port 8000
```

The website (`../`) talks to `http://localhost:8000` by default. Set
`VITE_API_URL` in the site's `.env.local` to point at a deployed API.

## Tests

```bash
pytest        # runs against in-memory SQLite — no database needed
```

## Notes

- **Bookings are idempotent** on the client-generated `requestId`, so retries
  (including the website's offline queue) can never create duplicates.
- Without `DATABASE_URL` the app falls back to a local `sqlite:///./local.db`
  file — handy for a quick local run, not for production.
- The admin booking list is protected by `ADMIN_API_KEY` because it contains
  customer phone numbers (personal data).
