# AGENTS.md

Instructions for AI coding agents working on **Car Recovery Near Me**
(carrecoverynearme.uk). `CLAUDE.md` imports this file (`@AGENTS.md`), so there is one
copy to keep up to date.

The product: 24/7 car recovery across Greater Manchester. The price is shown on
screen before the customer hands over a phone number, the wait is measured from
where the nearest driver actually is, and the customer tracks the driver live.
Read `README.md` for features, `BRAND.md` for the design system and `DEPLOY.md`
before shipping anything.

## Stack and commands

- Frontend: Vite + React 19 + TypeScript + Tailwind CSS v4 (`src/`).
- Backend: FastAPI + Postgres with Alembic migrations (`backend/`).

```sh
npm run dev          # site on :3000 (bound to localhost / ::1)
npm run typecheck
npm run lint
npm run format:check
npm test             # vitest
npm run build        # SPA + SSR build + prerender of every public page
```

Run typecheck, lint and tests before calling a change done. Only run Prettier
on the files you changed, not whole folders.

## Design rules (the ones that keep getting broken)

`src/index.css` holds the tokens and `BRAND.md` explains them. Do not hard-code
hex values in components.

### Three colours, one job each

| Colour | Share | Job                                                                 |
| ------ | ----- | ------------------------------------------------------------------- |
| White  | ~60%  | Surfaces, including the booking panel. Light by default.            |
| Ink    | ~30%  | Text, figures, small labels; the top bar, dispatch tape, closing    |
|        |       | CTA band and footer are the only dark areas.                        |
| Yellow | ~10%  | `accent-400` buttons (ink text, `accent-300` hover), headline mark, |
|        |       | number chips, rules, figures on ink.                                |

- Yellow is final. Teal and blue were tried and rejected; navy was dropped.
  Don't add a second accent.
- Yellow is never text on white (fails contrast) and never a large
  background. Accent text on white (eyebrows, links, ticks) is ink.
- Don't turn sections dark. A page of dark panels reads as "dark mode".
- Red (`--color-danger`) is for errors only, green (`--color-success`) for
  success only. Neither is a brand colour.
- `red-*` and `blue-*` classes are legacy aliases. Don't write new ones; use
  `accent-*` and `slate-*`/`neutral-*` directly.
- Hard-coded hex lives only in the logo files (`Logo.tsx`, `public/*.svg`,
  `scripts/brand/`), the map pin in `TrackMap.tsx` and email HTML in
  `backend/app/notify.py`. Change those together, then run
  `npm run brand:assets`.

### Shape

- **Square corners everywhere** (`rounded-none`). No `rounded-lg`, `-xl`,
  `-2xl` or pill badges. The owner has rejected rounded elements. The only
  `rounded-full` allowed is on avatars and tiny status dots.
- "Modern" here means spacing, soft shadows, lighter borders and calmer type,
  not radius.

### Tone and psychology

The reader is stranded and stressed. Design to calm them down, not to hype them up.

- No blinking or pulsing dots on badges or labels. They read as alarms.
- Prefer sentence case over shouted capitals for anything longer than a label.
- Put risk reversal ("No payment to see your price", "Free to cancel") right
  next to the action it unblocks.
- Word benefits as what the reader gets ("Price before you book"), not as a
  policy name ("Price up front").
- Nothing above the fold animates in; the hero must paint from prerendered HTML.

## Copy rules

- Never compare the service to a taxi app or Uber, anywhere: copy, SEO text,
  READMEs or comments. Describe the features directly.
- Never invent claims, figures, reviews or star ratings. The testimonials are
  illustrative and say so; don't add stars or anything that makes them look
  like verified reviews.
- Every promise in the UI must match how the product behaves (for example the
  card is only held until the job is done, and cancelling is free).

## Deploying and data (read DEPLOY.md first)

- The site is a Cloudflare Pages **direct upload** via Wrangler. A git push
  does not deploy it.
- The backend deploys manually on Render.
- `backend/.env` may point at the **production** database. Don't run
  `alembic upgrade` against it unless the matching backend deploy follows
  straight away. A migration that runs ahead of the live code takes the API
  down. For local work use `DATABASE_URL=sqlite:///./local.db`.
- Only commit, push or deploy when asked.
