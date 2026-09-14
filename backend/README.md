# Backend — Car Recovery Near Me API

FastAPI + SQLAlchemy 2.0 + Alembic, backed by Postgres (Neon by default).
Bookings, live dispatch, driver positions, customer tracking and telemetry.

## Endpoints

Auth is a per-person session: `Authorization: Bearer <token>` from
`/api/auth/login`. "driver" means a signed-in driver, "admin" a signed-in office
account. The shared `ADMIN_API_KEY` is no longer a login (see Accounts below).

**Public and customer**

| Method | Path                              | Auth  | Purpose                                                     |
| ------ | --------------------------------- | ----- | ----------------------------------------------------------- |
| GET    | `/api/health`                     | —     | Liveness check                                              |
| GET    | `/api/metrics`                    | —     | Bookings in the last 24h, drivers on duty, response time    |
| GET    | `/api/eta?lat&lng`                | —     | Minutes until the nearest free driver could reach a point   |
| POST   | `/api/bookings`                   | —     | Create a booking (idempotent on requestId); returns a token |
| GET    | `/api/track/{token}`              | token | Status, ETA, driver name, truck, position while on the way  |
| GET    | `/api/track/{token}/driver-photo` | token | The assigned driver's approved photo                        |
| POST   | `/api/track/{token}/cancel`       | token | Customer cancels (until the driver is on scene)             |
| POST   | `/api/track/{token}/rating`       | token | Customer rates a completed job, 1–5 plus a comment          |
| POST   | `/api/events`                     | —     | Anonymous funnel events, batched                            |

**Accounts** (`/api/auth`)

| Method   | Path                                           | Auth    | Purpose                                                  |
| -------- | ---------------------------------------------- | ------- | -------------------------------------------------------- |
| GET/POST | `/setup`                                       | op. key | Whether an admin exists; create the first one, once      |
| POST     | `/login`, `/logout`, `/logout-all`             | —/any   | Sign in (locks for 15 min after 5 failures), sign out    |
| GET      | `/me`                                          | any     | Who is signed in                                         |
| POST     | `/password`                                    | any     | Change password (signs out every other device)           |
| POST/GET | `/password-reset/request`, `/check`, `/confirm` | —      | Emailed reset link; also used by invite links            |

**Drivers**

| Method | Path                           | Auth   | Purpose                                                    |
| ------ | ------------------------------ | ------ | ---------------------------------------------------------- |
| POST   | `/api/drivers/apply`           | —      | Create a driver account and a draft application            |
| GET    | `/api/me/driver`               | driver | Profile, documents and compliance (what's missing, why)    |
| POST   | `/api/me/driver/profile`       | driver | Save details (only contact details once submitted)         |
| POST   | `/api/me/driver/submit`        | driver | Send for review; 422 lists anything still missing          |
| POST   | `/api/me/documents`            | driver | Upload a document: raw body, `docType`/`docDate` in query  |
| GET    | `/api/me/documents/{id}/file`  | driver | View your own upload                                       |
| DELETE | `/api/me/documents/{id}`       | driver | Remove an upload that isn't approved                       |
| GET    | `/api/me/jobs`                 | driver | Jobs (approved drivers only; phone only on your own jobs)  |
| POST   | `/api/me/state`                | driver | On/off duty, position, free-in minutes                     |
| POST   | `/api/me/jobs/{id}/status`     | driver | Take, advance, or hand back a job                          |

**Office** (all admin)

| Method   | Path                                                   | Purpose                                                  |
| -------- | ------------------------------------------------------ | -------------------------------------------------------- |
| GET      | `/api/bookings`                                        | Recent bookings with phone numbers and tracking links    |
| POST     | `/api/bookings/{id}/status`, DELETE `/api/bookings/{id}` | Assign, cancel, remove a job                           |
| GET      | `/api/drivers`, DELETE `/api/drivers/{id}`             | Live roster; remove a driver                             |
| GET      | `/api/admin/drivers?status`, `/api/admin/drivers/{id}` | Driver list with document counts; full review record     |
| POST     | `/api/admin/drivers/{id}/profile`                      | Edit details, record the DVLA licence check              |
| POST     | `/api/admin/drivers/{id}/decision`                     | Approve, reject, suspend, reinstate                      |
| POST     | `/api/admin/drivers/{id}/submit`, `/documents`, `/account` | Submit or upload on a driver's behalf; give one a sign-in |
| POST     | `/api/admin/drivers/invite`                            | Invite a driver by email                                 |
| POST/GET | `/api/admin/documents/{id}/review`, `/file`            | Approve or send back a document; view it (audited)       |
| GET      | `/api/admin/compliance`                                | Expired, expiring and missing documents on working drivers |
| GET      | `/api/admin/audit`                                     | Who did what                                             |
| GET/POST | `/api/admin/users`, `/users/{id}/reset-link`, `/users/{id}/active` | Office accounts                              |
| GET      | `/api/admin/analytics?days`                            | Site analytics against the previous period: trend, sources, campaigns, pages, funnels, clicks, speed, errors |
| GET      | `/api/admin/analytics/live`                            | Visits active in the last 5 minutes and the latest events |
| GET      | `/api/admin/telemetry?days`                            | The older booking-funnel summary                         |

Interactive docs run at `http://localhost:8000/docs`.

### Accounts and driver onboarding

- **First admin.** On a fresh database `/admin` shows a one-time setup form.
  It asks for `ADMIN_API_KEY` and creates the first office account. Once any
  admin exists the key does nothing; everybody signs in as themselves.
- **Passwords** are hashed with scrypt. Session tokens are stored hashed and
  last 30 days from last use. Changing or resetting a password signs out
  every other device; suspending a driver signs them out everywhere.
- **Applying.** A driver creates an account at `/drivers/apply`, fills in
  their details, licence and vehicle, and uploads documents. The list of
  documents and the rules for each (which vehicles need it, whether it has an
  expiry, how recent it must be) live in `app/driver_documents.json`, which the
  website imports too.
- **Review.** The office checks each document, records the DVLA licence check
  (valid for 30 days at approval), and approves. A driver can only go on duty
  and take jobs while every required document is approved and in date, and
  only takes motorway jobs with an approved NHSS 17 card.
- **Renewals.** A renewed document replaces the old one only once approved,
  so an expiring driver is never taken off the road while the office catches up.
- **Files** are stored in the database (Render has no persistent disk), typed
  from their content rather than their name, and served with a sandbox policy.
  Every view by the office is written to the audit log.

### Who can see a driver's position

Nobody, except the customer whose job that driver is on, and only while the
job is `en_route`. `/api/eta` answers in minutes. `/api/track/{token}` returns
the assigned driver's name, truck and phone once a job is accepted, and their
coordinates only between "On my way" and "I'm on scene". Drivers see a
customer's phone number only on their own jobs, and never a tracking token.
The office sees everything, and needs an admin sign-in.

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

# The same suite against a real Postgres (a throwaway one, never Neon):
docker run -d --name crnm-pg -e POSTGRES_PASSWORD=pgtest -p 55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgresql+psycopg2://postgres:pgtest@localhost:55432/postgres pytest
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
- `ADMIN_API_KEY` is only used to create the first admin account. Keep it
  secret anyway: on an empty database it is what creates an admin.
- `SITE_URL` builds links in emails when a request doesn't say where it came
  from. Password links use the request's origin only if it is in `CORS_ORIGINS`.
