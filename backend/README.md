# Backend — Car Recovery Near Me API

FastAPI + SQLAlchemy 2.0 + Alembic, backed by Postgres (Neon by default).
Bookings, live dispatch, driver positions, customer tracking and telemetry.

## Endpoints

| Method | Path                        | Auth        | Purpose                                                     |
| ------ | --------------------------- | ----------- | ----------------------------------------------------------- |
| GET    | `/api/health`               | —           | Liveness check                                              |
| GET    | `/api/metrics`              | —           | Bookings in the last 24h, drivers on duty, response time    |
| GET    | `/api/eta?lat&lng`          | —           | Minutes until the nearest free driver could reach a point   |
| POST   | `/api/bookings`             | —           | Create a booking (idempotent on requestId); returns a token |
| GET    | `/api/track/{token}`        | token       | The customer's booking: status, ETA, driver, position       |
| POST   | `/api/track/{token}/cancel` | token       | Customer cancels (until the driver is on scene)             |
| POST   | `/api/track/{token}/rating` | token       | Customer rates a completed job, 1–5 plus a comment          |
| POST   | `/api/events`               | —           | Anonymous funnel events, batched                            |
| GET    | `/api/bookings`             | `x-api-key` | List recent bookings (admin)                                |
| POST   | `/api/bookings/{id}/status` | `x-api-key` | Driver takes / advances / finishes a job                    |
| DELETE | `/api/bookings/{id}`        | `x-api-key` | Remove a job outright                                       |
| GET    | `/api/drivers`              | `x-api-key` | The roster, with live positions                             |
| POST   | `/api/drivers`              | `x-api-key` | Add a driver                                                |
| DELETE | `/api/drivers/{id}`         | `x-api-key` | Retire a driver (soft)                                      |
| POST   | `/api/drivers/{id}/state`   | `x-api-key` | On/off duty, position, free-in minutes                      |
| GET    | `/api/admin/telemetry?days` | `x-api-key` | Funnel, areas, services, devices, referrers                 |

Interactive docs run at `http://localhost:8000/docs`.

### Who can see a driver's position

Nobody, except the customer whose job that driver is on, and only while the
job is `en_route`. `/api/eta` answers in minutes. `/api/track/{token}` returns
the assigned driver's name and phone once a job is accepted, and their
coordinates only between "On my way" and "I'm on scene". The admin endpoints
return everything, and are keyed.

### Metrics are real

`rescuesToday` is the count of non-cancelled bookings in the last 24 hours and
`driversAvailable` is the number of drivers on duty. `avgResponseMinutes` is
the seeded figure until at least five "now" jobs have been timed from booking
to on-scene in the last 30 days, after which it is the measured average and
`measured` is true.

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
python seed.py           # inserts the seeded response time
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
  (including the website's offline queue) can never create duplicates, and a
  retry gets the same tracking token back.
- Without `DATABASE_URL` the app falls back to a local `sqlite:///./local.db`
  file — handy for a quick local run, not for production. Note that `.env` is
  read too, so if it names the Neon database, `alembic upgrade head` migrates
  Neon. Override with `DATABASE_URL=sqlite:///./local.db` on the command line
  to work locally.
- The admin endpoints are protected by `ADMIN_API_KEY` because they contain
  customer phone numbers (personal data). The driver console uses the same key.
