# Car Recovery Near Me

**carrecoverynearme.uk** — 24/7 car recovery, towing and roadside help across
Greater Manchester, run the way a taxi app runs: the price on the screen before
the customer hands over a phone number, a live wait measured from where the
nearest driver actually is, and a tracking page that shows the driver coming to
them.

Built with Vite + React 19 + TypeScript and Tailwind CSS v4, with a
**FastAPI + Postgres** backend (see `backend/`) for bookings, live dispatch,
driver positions and customer tracking.

## What the site does

- **Area pages.** Every served area (`src/config.ts`) gets its own page at
  `/car-recovery-<area>` with a region-specific title, description, canonical
  URL, FAQ and JSON-LD. The old `/breakdown-recovery-<area>` URLs 301 to the new
  ones (`public/_redirects`).
- **Service pages.** `/tow-truck-near-me`, `/jump-start-near-me`,
  `/flat-tyre-near-me`, `/out-of-fuel-near-me`, `/motorway-recovery-manchester`,
  `/electric-car-recovery-manchester`, `/motorbike-recovery-manchester`,
  `/vehicle-transport-manchester` and `/breakdown-recovery-manchester`, each with
  its own copy, price line and FAQ (`src/services.ts`), and the booking form
  preselected to that service.
- **A prices page** (`/pricing`) with the full tariff and worked examples, all
  computed from `src/pricing.ts` so it can never disagree with the form.
- **Booking form.** Real driving distance and ETA (OpenStreetMap/OSRM), an
  upfront price, motorway detection, and an optional vehicle field so the
  driver knows what to look for.
- **Customer tracking** at `/track/<token>`: status, live ETA, the driver's
  name and phone, their position on a map while on the way, cancel, and rate
  the job afterwards.
- **Driver console** at `/driver` (installable PWA): on/off duty, live position,
  take and advance jobs, buzz-and-banner alerts for new jobs and customer
  cancellations.
- **Admin** at `/admin`: bookings with driver, vehicle, rating and tracking
  links; the driver roster; anonymous funnel telemetry.
- **Prerendered.** Every public page is built to static HTML at build time
  (`scripts/prerender.mjs`) so search engines and link previews get the whole
  page, not an empty `<div id="root">`. React hydrates on load.

## Architecture

```
 Browser (React)  ──HTTP──▶  FastAPI (backend/)  ──▶  Postgres (Neon)
        │                          │
        │ bookings, live ETA,      │ SQLAlchemy models + Alembic migrations
        │ tracking, driver console │ drivers' live positions never leave
        ▼                          │ the API except to the customer whose
  offline queue (localStorage,     │ job that driver is on, while on the way
  auto-resent when the API returns)
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

| Command                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                            |
| `npm run build`        | Production build: client, then SSR bundle, then prerender       |
| `npm run build:spa`    | Client build only (no prerendered pages, no sitemap)            |
| `npm run preview`      | Preview the production build                                    |
| `npm run brand:assets` | Re-render `og-image.png` and the app icons with headless Chrome |
| `npm run typecheck`    | Type-check with `tsc --noEmit`                                  |
| `npm run lint`         | Lint with ESLint                                                |
| `npm run format`       | Format with Prettier                                            |
| `npm test`             | Run unit tests (Vitest)                                         |

## Project structure

```
src/
  config.ts         Brand, domain, phone, regions, routing helpers (single source of truth)
  routes.ts         Which page a path is; the list of pages to prerender
  seo.ts            Pure <head> builders per page type + the client hook that applies them
  services.ts       Service page content (copy, price lines, FAQs)
  pricingContent.ts The prices page as data, computed from pricing.ts
  data.ts           Presentational content (trust items, services grid, FAQ, testimonials)
  validation.ts     Booking-form validation (shared by both form gates)
  route.ts          Driving distance + ETA (geocoding + OSRM routing), motorway detection
  pricing.ts        Price estimate formula (callout + per-mile, night, motorway)
  track.ts          Customer tracking API client + status wording
  driver.ts         Driver-console API client + job diffing for alerts
  api.ts            Backend base URL
  metrics.tsx       Live dispatch metrics via context (API, else simulated)
  useBackend.ts     Booking submission with idempotency + offline queue
  telemetry.ts      Anonymous funnel events
  icons.tsx         Iconoir icon re-exports
  entry-server.tsx  Build-time renderer used by scripts/prerender.mjs
  components/       Hero, Layout (header/footer/how-it-works), BookingForm, TrackMap, …
  pages/            LandingPage (areas), ServicePage, PricingPage, TrackPage,
                    DriverPage, AdminPage, PrivacyPolicy, NotFoundPage
scripts/
  prerender.mjs     Writes dist/<path>/index.html for every public page + sitemap.xml
  render-brand.mjs  Renders the PNG share card and icons from scripts/brand/*.html
backend/            FastAPI + SQLAlchemy + Alembic API (see backend/README.md)
```
