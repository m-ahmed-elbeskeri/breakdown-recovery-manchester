# Deploying

The **database** (Neon) is already hosted. This covers putting the **backend
API** on the internet and pointing the **site** at it.

## Backend → Render (free, no card)

Render reads `render.yaml` and builds `backend/Dockerfile` (which runs
`alembic upgrade head` on every deploy, so schema changes ship automatically).

1. **Put the code on GitHub** (Render deploys from a repo):
   ```bash
   gh repo create car-recovery-near-me --private --source=. --push
   # (or create a repo on github.com and `git remote add origin … && git push -u origin main`)
   ```
2. Sign up at **https://render.com** (GitHub login is easiest, no card for the free tier).
3. **New → Blueprint** → select this repo. Render detects `render.yaml`.
4. When prompted, fill the secret env vars:
   - `DATABASE_URL` — your Neon string (same one in `backend/.env`)
   - `ADMIN_API_KEY` — the key in `backend/.env`. It is only asked for once, to
     create the first admin account (see "Before you go live")
   - `CORS_ORIGINS` — your site's URL, e.g. `https://carrecoverynearme.uk`
   - `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` — optional (see below)
   - `SITE_URL` — defaults to `https://carrecoverynearme.uk`; only set it if
     the site lives somewhere else (it builds the tracking link in the alert
     email, and password links when a request doesn't say where it came from).
     Until the domain is live, set it to the `pages.dev` address
5. **Apply** → wait for the build. Your API is live at the service URL Render
   shows, which gets a random suffix when the name is taken. This project's is
   `https://breakdown-recovery-api-dxja.onrender.com` (health: `/api/health`).

> Free instances sleep after ~15 min idle and cold-start in a few seconds. The
> site handles this gracefully (queued bookings, simulated metrics) until it wakes.

## Site → Cloudflare Pages (free, no card)

**Use Cloudflare Pages, not Vercel.** Vercel's free Hobby tier is licensed for
non-commercial use only, and this is a commercial site. Cloudflare Pages allows
commercial projects, has no bandwidth cap, and does not sleep. Netlify is a fine
second choice (100 GB/month free).

1. Push the repo to GitHub (same repo as the backend — see step 1 above).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Environment variables → add:
   ```
   VITE_API_URL = https://breakdown-recovery-api-dxja.onrender.com
   ```
   This is baked in at build time, so **changing it later needs a redeploy**,
   not just a settings save.
5. Deploy. The site is live at `https://<project>.pages.dev`.
6. Go back to the API's `CORS_ORIGINS` on Render and add that exact origin
   (comma-separated, no trailing slash). Until you do, the browser will block
   every API call and the site will silently fall back to simulated metrics.

### What `npm run build` produces

Three steps: the client bundle, an SSR bundle, then `scripts/prerender.mjs`
renders every public page to `dist/<page>.html` with its own title,
description, canonical URL, social tags and JSON-LD, and writes `sitemap.xml`.
Search engines and link previews get complete HTML; React attaches on load.

The prerender step also writes `dist/_redirects`: one 301 per old
`/breakdown-recovery-<area>` URL to `/car-recovery-<area>`, and 200 rewrites of
`/track/*`, `/driver/*`, `/admin/*`, `/drivers/apply`, `/login`,
`/forgot-password`, `/reset-password` and `/privacy` to the empty app shell
`app.html`. There is deliberately **no catch-all rule and no wildcard 301**.
Cloudflare Pages applies redirects before static files, so a catch-all would
serve the empty shell instead of every prerendered page, and a
`/breakdown-recovery-*` wildcard would hijack the
`/breakdown-recovery-manchester` service page. Unknown URLs fall through to
Pages' built-in single-page-app handling, and the app shows its 404 page.
`public/_headers` sets asset caching and basic security headers.

### Deploying with Wrangler instead of Git

The Pages project `recovery-mayte` is a direct-upload project, so a push does
not rebuild it. From the repo root:

```bash
VITE_API_URL=https://breakdown-recovery-api-dxja.onrender.com npm run build
npx wrangler pages deploy dist --project-name recovery-mayte --branch main
```

Use `--branch <anything-else>` to get a preview URL first.

## Before you go live

1. **Register the domain: `carrecoverynearme.uk`** (~£8–12/year). It was
   unregistered at Nominet on 13 September 2026. Add it as a custom domain on
   the Pages project; Cloudflare issues the certificate free.
2. Everything already says that domain — `src/config.ts` (`SITE_URL`, drives
   canonical URLs, JSON-LD and the sitemap), `index.html`, `public/robots.txt`,
   `scripts/brand/og-image.html`, and the backend default `SITE_URL`. If you end
   up on a different domain, change those and run `npm run brand:assets`.
3. Create the `hello@carrecoverynearme.uk` mailbox (it is in the footer and the
   structured data), or change `CONTACT_EMAIL` in `src/config.ts`.
4. **Create the first admin.** Open `/admin`. On a database with no admin it
   shows a setup form: enter `ADMIN_API_KEY`, your name, email and a password.
   From then on the key does nothing and everyone signs in at `/login`. Add
   other office staff under `/admin → Team`.
5. **Give existing drivers a sign-in.** Drivers who were on the roster before
   accounts existed are kept as approved. Open each one under
   `/admin → Drivers`, create a sign-in with their email, and send them the
   link. Upload their documents there too, so the compliance page can track
   expiry dates. Until their required documents are approved and in date they
   can't go on duty.
6. New drivers apply at `/drive-with-us` → `/drivers/apply`. Each application
   appears under `/admin → Drivers → To review`.
7. Rotate the Neon, Resend and admin keys if this repo has ever been shared.

### Shipping a schema change

The API migrates the database when it boots. Deploy the API first and let it
finish, then deploy the site. **Never run `alembic upgrade head` against Neon
from your own machine** (`backend/.env` points there): the database moves
ahead of the code Render is running, and every restart fails with "Can't locate
revision" until the new code is deployed.

Then verify:

- Open `https://your-domain/car-recovery-bolton` directly and view source: the
  page should be full HTML with `<title>Car Recovery Bolton …`.
- Open `https://your-domain/breakdown-recovery-bolton`: it should 301 to the
  new address.
- Make a test booking, open the tracking link, sign in as an approved driver
  at `/login`, go on duty and take the job: the tracking page should name the
  driver, show their photo and registration, and, once "On my way" is tapped,
  show the truck on the map.

## Card payments and driver payouts (Stripe Connect)

How the money works:

- **Card jobs.** The customer's card is held when they book and only charged
  when the driver marks the job done. The platform keeps its cut
  (`PLATFORM_FEE_PERCENT`, default 20) and sends the driver the rest. The card
  is also saved, so a job booked more than a week ahead can still be charged
  after the hold runs out. Cancelling before the job is done releases the hold.
- **Cash jobs.** The customer pays the platform's cut as a **deposit** on
  their card (held at booking, taken when the job is done, released if they
  cancel) and pays the rest to the driver in cash. Nothing is then owed either
  way. The driver app shows exactly how much cash to collect. If the customer
  never pays the deposit, the driver collects the full price and the cut is
  recorded against the driver: it comes off their next card job, or the
  office records it under **Admin → Payments** when the driver pays directly.
- **Payouts.** Drivers set up payouts on Stripe's own pages from
  **Earnings** in the driver app. Stripe checks their ID and bank account. The
  money waits in their Stripe balance until they cash out: a standard payout
  is free and takes two to three working days, and an instant one costs
  Stripe's 1% (at least 50p), which is taken from the driver's next earnings.

Until the keys below are set, card payment is simply not offered, and every
booking is paid to the driver as before.

1. **You** create the Stripe account at https://dashboard.stripe.com, as the
   business, with the bank account the platform's cut is paid into.
2. **Connect → Get started**: choose a marketplace, with **Express**
   connected accounts in the United Kingdom. Under Connect settings, add the
   platform's name, icon and colour, which drivers see during setup.
3. **Settings → Payouts → Instant Payouts**: switch them on for connected
   accounts.
4. **Developers → API keys**: copy the publishable and secret keys. Start in
   test mode (`pk_test_…`, `sk_test_…`).
5. **Developers → Webhooks**, two endpoints, both pointing at
   `https://breakdown-recovery-api-dxja.onrender.com/api/payments/webhook`:
   - Events on **your account**: `payment_intent.amount_capturable_updated`,
     `payment_intent.succeeded`, `payment_intent.payment_failed`,
     `payment_intent.canceled`, `charge.refunded`. Copy its signing secret.
   - Events on **connected accounts**: `account.updated`. Copy its signing
     secret.
6. On Render, add to the API's environment and save, which redeploys:
   ```
   STRIPE_SECRET_KEY              = sk_test_…
   STRIPE_PUBLISHABLE_KEY         = pk_test_…
   STRIPE_WEBHOOK_SECRET          = whsec_… (your account's endpoint)
   STRIPE_CONNECT_WEBHOOK_SECRET  = whsec_… (connected accounts' endpoint)
   PLATFORM_FEE_PERCENT           = 20
   ```
   The site reads these from the API, so it needs no rebuild.
7. **Settings → Payment method domains**: add `recovery-mayte.pages.dev`
   (and `carrecoverynearme.uk` once it's live) so Apple Pay appears.
8. Test end to end in test mode: book with card `4242 4242 4242 4242`, set up
   a driver's payouts with Stripe's test identity details, take and finish the
   job, and check **Admin → Payments**. Then swap in the live keys and the live
   webhook secrets.
9. Before taking real money, publish customer and driver terms that state the
   platform's cut, when a card is charged, and the cancellation rules.

## Email alerts (optional)

1. Sign up at **https://resend.com** (free tier).
2. Create an API key. Without a verified domain you can send from
   `onboarding@resend.dev` **to the email you signed up with**.
3. Set on the API (Render env vars or `backend/.env` locally):
   - `RESEND_API_KEY` = your key
   - `NOTIFY_EMAIL_TO` = your email
4. Every new booking now emails you the customer's details, a map pin, and the
   customer's tracking link (handy to text to someone who booked by phone).

## Alternatives

`render.yaml` is Render-specific, but `backend/Dockerfile` is portable — the same
image runs on **Fly.io** (`fly launch`), **Railway**, **Koyeb**, etc. Only the
env vars need setting on whichever host you pick.
