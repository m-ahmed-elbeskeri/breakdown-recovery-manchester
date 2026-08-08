# Deploying

The **database** (Neon) is already hosted. This covers putting the **backend
API** on the internet and pointing the **site** at it.

## Backend → Render (free, no card)

Render reads `render.yaml` and builds `backend/Dockerfile` (which runs
`alembic upgrade head` on every deploy, so schema changes ship automatically).

1. **Put the code on GitHub** (Render deploys from a repo):
   ```bash
   git init && git add . && git commit -m "Initial commit"
   gh repo create breakdown-recovery-manchester --private --source=. --push
   # (or create a repo on github.com and `git remote add origin … && git push -u origin main`)
   ```
2. Sign up at **https://render.com** (GitHub login is easiest, no card for the free tier).
3. **New → Blueprint** → select this repo. Render detects `render.yaml`.
4. When prompted, fill the secret env vars:
   - `DATABASE_URL` — your Neon string (same one in `backend/.env`)
   - `ADMIN_API_KEY` — the key in `backend/.env`
   - `CORS_ORIGINS` — your site's URL, e.g. `https://your-site.example`
   - `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` — optional (see below)
5. **Apply** → wait for the build. Your API is live at
   `https://breakdown-recovery-api.onrender.com` (health: `/api/health`).

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
   VITE_API_URL = https://breakdown-recovery-api.onrender.com
   ```
   This is baked in at build time, so **changing it later needs a redeploy**,
   not just a settings save.
5. Deploy. The site is live at `https://<project>.pages.dev`.
6. Go back to the API's `CORS_ORIGINS` on Render and add that exact origin
   (comma-separated, no trailing slash). Until you do, the browser will block
   every API call and the site will silently fall back to simulated metrics.

### Why `public/_redirects` matters

Routing is client-side, so only `index.html` exists on disk. `public/_redirects`
rewrites everything to it with a **200**. Without that file, all 35 area pages
(`/breakdown-recovery-bolton` and friends) return a hard 404 when opened
directly or refreshed — including to Googlebot, which would sink the per-area
SEO the whole site is built around. `public/_headers` sets asset caching and
basic security headers. Both files are copied into `dist/` by the build and are
understood by Cloudflare Pages and Netlify alike.

## Before you go live

Hosting is free. A domain is not (~£8–12/year for a `.co.uk`) — you can launch
on the free `*.pages.dev` subdomain, but a real domain is worth it for a local
business, and Cloudflare will issue the SSL certificate free either way.

Once you know the final domain, these still contain the placeholder
`breakdown-recovery-manchester.co.uk` and must all be updated together:

- [ ] `src/config.ts` — `SITE_URL` (drives canonical URLs and JSON-LD)
- [ ] `public/robots.txt` — the `Sitemap:` line
- [ ] `public/sitemap.xml` — all 36 `<loc>` entries
- [ ] `index.html` — canonical link, `og:url`, `og:image`, `twitter:image`, and
      the `@id`/`url`/`logo`/`email` fields in the JSON-LD block

And the details that are still placeholders regardless of domain:

- [ ] **Phone number** — `PHONE_TEL` / `PHONE_DISPLAY` in `src/config.ts`, plus
      `telephone` in the `index.html` JSON-LD and the noscript block. It is
      currently `0161 000 0000`, which reads as obviously fake to a customer.
- [ ] **Email** — `email` in the JSON-LD
- [ ] **Company number / trading address / insurer** — not currently shown
      anywhere; see the last section of `BRAND.md`
- [ ] Rotate the Neon, Resend and admin keys if this repo has ever been shared

Then verify: open a region URL directly (not by clicking) — e.g.
`https://your-domain/breakdown-recovery-bolton` — and confirm it renders rather
than 404s. That single check proves the `_redirects` rule is live.

## Email alerts (optional)

1. Sign up at **https://resend.com** (free tier).
2. Create an API key. Without a verified domain you can send from
   `onboarding@resend.dev` **to the email you signed up with**.
3. Set on the API (Render env vars or `backend/.env` locally):
   - `RESEND_API_KEY` = your key
   - `NOTIFY_EMAIL_TO` = your email
4. Every new booking now emails you the customer's details.

## Alternatives

`render.yaml` is Render-specific, but `backend/Dockerfile` is portable — the same
image runs on **Fly.io** (`fly launch`), **Railway**, **Koyeb**, etc. Only the
env vars need setting on whichever host you pick.
