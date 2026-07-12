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

## Site → point it at the deployed API

Wherever the site is hosted (Vercel, Netlify, Cloudflare Pages, …), set:

```
VITE_API_URL = https://breakdown-recovery-api.onrender.com
```

Then rebuild/redeploy the site. Add that site origin to the API's `CORS_ORIGINS`.

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
