# 24/7 Breakdown Recovery Manchester

A fast, SEO-focused landing site for a 24/7 vehicle breakdown & recovery service
covering Manchester and Greater Manchester. Built with Vite + React 19 +
TypeScript and Tailwind CSS v4, with a **FastAPI + Postgres** backend (see
`backend/`) for booking submissions and live dispatch metrics.

Every served area (see `src/config.ts`) gets its own SEO-optimised route
(`/breakdown-recovery-<area>`) with region-specific title, meta tags, canonical
URL, and JSON-LD structured data. The booking flow computes a real driving
distance + ETA (OpenStreetMap/OSRM) and an upfront price for the customer.

## Architecture

```
 Browser (React)  ──HTTP──▶  FastAPI (backend/)  ──▶  Postgres (Neon)
        │                          │
        │ live metrics / bookings  │ SQLAlchemy models + Alembic migrations
        ▼                          ▼
  offline queue (localStorage, auto-resent when the API returns)
```

## Run locally

**Prerequisites:** Node.js 18+, Python 3.11+

### 1. Backend

See [`backend/README.md`](backend/README.md) for the full runbook (create a free
Neon Postgres, install, `alembic upgrade head`, `python seed.py`,
`uvicorn app.main:app --reload`). It listens on `http://localhost:8000`.

### 2. Frontend

```bash
npm install
npm run dev            # http://localhost:3000
```

The site calls `http://localhost:8000` by default. Set `VITE_API_URL` in
`.env.local` to point at a deployed API. **If the API is unreachable the site
still works** — metrics fall back to simulated figures and bookings are queued
in `localStorage`, then re-sent automatically once the API is back. Bookings are
idempotent (client-generated `requestId`), so a retried queued request can never
create a duplicate.

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start the dev server           |
| `npm run build`     | Production build               |
| `npm run preview`   | Preview the production build   |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run lint`      | Lint with ESLint               |
| `npm run format`    | Format with Prettier           |
| `npm test`          | Run unit tests (Vitest)        |

## Project structure

```
src/
  config.ts         Constants + region routing helpers (single source of truth)
  data.ts           Presentational content (services, testimonials, FAQ)
  validation.ts     Booking-form validation (shared by both form gates)
  route.ts          Driving distance + ETA (geocoding + OSRM routing)
  pricing.ts        Price estimate formula (callout + per-mile, night rate)
  seo.ts            Region-aware document <head> / JSON-LD updates
  api.ts            Backend base URL
  metrics.tsx       Live dispatch metrics via context (API, else simulated)
  useBackend.ts     Booking submission with idempotency + offline queue
  icons.tsx         Iconoir icon re-exports
  components/       BookingForm, Services, Testimonials, FaqSection, …
  pages/            PrivacyPolicy, NotFoundPage
backend/            FastAPI + SQLAlchemy + Alembic API (see backend/README.md)
```
