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
   - `ADMIN_API_KEY` — the key in `backend/.env`
   - `CORS_ORIGINS` — your site's URL, e.g. `https://carrecoverynearme.uk`
   - `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` — optional (see below)
   - `SITE_URL` — defaults to `https://carrecoverynearme.uk`; only set it if
     the site lives somewhere else (it builds the tracking link in the alert email)
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
renders every public page to `dist/<path>/index.html` with its own title,
description, canonical URL, social tags and JSON-LD, and writes `sitemap.xml`.
Search engines and link previews get complete HTML; React attaches on load.

The prerender step also writes `dist/_redirects`: one 301 per old
`/breakdown-recovery-<area>` URL to `/car-recovery-<area>`, and 200 rewrites of
`/track/*`, `/driver`, `/admin` and `/privacy` to the empty app shell
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
4. Add at least one driver in `/admin → Drivers`; the driver console picks
   from that roster.
5. Rotate the Neon, Resend and admin keys if this repo has ever been shared.

Then verify:

- Open `https://your-domain/car-recovery-bolton` directly and view source: the
  page should be full HTML with `<title>Car Recovery Bolton …`.
- Open `https://your-domain/breakdown-recovery-bolton`: it should 301 to the
  new address.
- Make a test booking, open the tracking link, sign into `/driver`, go on
  duty and take the job: the tracking page should name the driver and, once
  "On my way" is tapped, show the truck on the map.

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
