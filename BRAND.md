# Car Recovery Near Me — brand toolbox

The design system for the site. **`src/index.css` is the single source of truth**
— every value below is defined there as a CSS custom property. Change it there
and the whole site follows. Do not hard-code hex values in components.

---

## 1. The name

**Car Recovery Near Me.** Chosen for search intent, not cleverness: "car
recovery near me" is the single most-searched recovery phrase in the UK, and
the name answers it. It is also what a stranded person is actually thinking.

The domain is **carrecoverynearme.uk**. Checked at Nominet on 13 September
2026: the `.uk` was unregistered; the `.co.uk` was taken, as were
`recoverynearme.co.uk` and `recoverynearme.uk` (the latter parked by a domain
investor). `breakdownnearme.co.uk` and `.uk` were both free but "breakdown"
carries far less search volume, so the decision went to the phrase people use.

Written as `Car Recovery Near Me` in prose. Set as a two-part wordmark in the
UI: `CAR RECOVERY` in ink, `NEAR ME` painted in the accent colour. Defined once
in `src/config.ts` as `BRAND_NAME` and `BRAND_WORDMARK`.

### The mark

A **map pin with a tow hook inside**. The pin is the glyph every phone already
uses for "where you are", which is the "near me"; the hook is what turns up.
Two shapes, so it survives being a 16px favicon (at which size it is simply a
yellow pin, which is the right thing to be).

Lives in `src/components/Logo.tsx`, mirrored in `public/favicon.svg`,
`public/logo.svg` and the templates in `scripts/brand/`. **If you change one,
change them all** — they are separate files and will drift.

### Rendered assets

`public/og-image.png` (the share card) and `public/icons/*.png` are rendered
from `scripts/brand/og-image.html` and `scripts/brand/icon.html` by
`npm run brand:assets`, which drives whatever Chrome or Edge is installed. They
are PNGs because Facebook, WhatsApp, LinkedIn and X ignore SVG share images and
iOS ignores SVG touch icons. Re-run only when the mark, phone number or "from"
price changes; the script refuses to render a card whose phone number does not
match `src/config.ts`.

---

## 2. Colour

Three colours, each with one job. If a colour you want doesn't have a job, it
doesn't go in. This is the usual shape of a disciplined brand palette: a
neutral that does most of the work, one dark, and one accent for action,
split roughly 60 / 30 / 10.

| Colour     | Share | Job                                                            |
| ---------- | ----- | -------------------------------------------------------------- |
| **White**  | ~60%  | Page and card surfaces, including the booking panel.           |
| **Ink**    | ~30%  | Text, figures and small labels; the thin top bar, the dispatch |
|            |       | tape, the closing call to action and the footer.               |
| **Yellow** | ~10%  | The accent (`accent-*`). Buttons with ink text, the headline   |
|            |       | mark, number chips, rules, and figures on ink.                 |

Plus two semantic colours that are not part of the brand and only appear when
they mean something: **red** (`--color-danger`) for errors, **green**
(`--color-success`) for success.

### Rules

- **Yellow is never text on white.** It fails contrast. Small accent text on
  white (eyebrows, links, ticks) is ink.
- **Yellow is never a large background.** At page scale hi-vis yellow reads as
  hazard and raises the pulse of someone already frightened.
- **Light by default.** Dark is for the thin bars, one closing band and the
  footer. A page of dark panels reads as "dark mode", not daylight help.
- **No navy, no second accent.** Navy was tried as a trust colour and dropped;
  teal and blue were tried as replacements for yellow and rejected.

### Ink

A near-neutral cool grey. `slate-*` and `neutral-*` resolve to the same ramp
on purpose.

| Token               | Hex       | Use                                   |
| ------------------- | --------- | ------------------------------------- |
| `slate/neutral-50`  | `#f7f8fa` | Page background, alternating sections |
| `slate/neutral-100` | `#eef0f3` | Subtle fills                          |
| `slate/neutral-200` | `#dde1e7` | Borders, rules                        |
| `slate/neutral-300` | `#c3c9d2` | Disabled text, dividers               |
| `slate/neutral-400` | `#959eab` | Muted text on dark                    |
| `slate/neutral-500` | `#6f7885` | Secondary text on light               |
| `slate/neutral-600` | `#545c68` | Body text on light                    |
| `slate/neutral-700` | `#3e4550` | Strong body text                      |
| `slate/neutral-800` | `#292e36` | Borders and fields on dark            |
| `slate/neutral-900` | `#1b1f25` | Raised surfaces on dark               |
| `slate/neutral-950` | `#111418` | The dark, and headings on light       |

### Yellow (`accent-*`)

| Token        | Hex       | Use                                        |
| ------------ | --------- | ------------------------------------------ |
| `accent-50`  | `#fffbeb` | Tint behind notices in the booking panel   |
| `accent-200` | `#fde68a` | Tint borders                               |
| `accent-300` | `#ffd94f` | Button hover                               |
| `accent-400` | `#f5c518` | **The action colour** (always ink text)    |
| `accent-500` | `#d9a800` | Rules on light                             |
| `accent-700` | `#7a5c00` | Dark gold chips with white text (consoles) |

`red-*` and `blue-*` classes are legacy aliases kept for the staff consoles;
they resolve into this palette. Don't write new ones.

---

## 3. Type

Two faces, loaded in `index.html`.

### Anton — `font-display`

Ultra-condensed heavy grotesque. It is loud, and loudness is a limited resource.
**Restricted to three places:**

1. The hero `<h1>`
2. The closing CTA headline
3. Big call-to-action buttons

Always uppercase, always `tracking-tight`. Do **not** use it for section
headings: all-caps removes word-shape cues, which is the wrong trade for someone
stressed and scanning one-handed.

### Inter — `font-sans`

Everything else. Neutral, highly legible at small sizes, excellent in forms.

| Role             | Weight                                 | Case       |
| ---------------- | -------------------------------------- | ---------- |
| Section headings | 800 (`font-extrabold`)                 | Title Case |
| Sub-headings     | 700 (`font-bold`)                      | Title Case |
| Body             | 400–500                                | Sentence   |
| Eyebrow labels   | 900 (`font-black`), `tracking-[0.3em]` | UPPERCASE  |
| Stat figures     | 900                                    | —          |

---

## 4. Surface and depth

**No hard offset shadows.** Use soft elevation:

| Level                           | Use           |
| ------------------------------- | ------------- |
| `shadow-sm` → `hover:shadow-md` | Buttons       |
| `shadow-md` → `hover:shadow-lg` | Primary CTAs  |
| `shadow-lg` / `shadow-xl`       | Cards, panels |

Corners stay square (`rounded-none`) — that's the industrial edge worth keeping.
Softness comes from elevation and spacing, not radius.

No blinking dots or pulsing lights on status badges. To someone already
stressed they read as an alarm, not as "live".

---

## 5. Motion

Motion is decoration; nobody stranded is enjoying it.

- **Nothing above the fold animates in.** The hero and the booking form render
  visible in the prerendered HTML and stay that way. A page that fades in is a
  page that is invisible for the slowest second of the visit, and that second is
  when a search engine takes its snapshot.
- **Reveal-on-scroll** (`src/components/motion.tsx`) is for sections below the
  fold, on desktop only, and only after hydration. On phones and in the
  prerendered HTML it renders a plain element.
- No scrolling ticker, no crawling caution tape. `.hazard-stripes` is a solid
  yellow rule.
- Hero image `kenburns` drift and button `sheen` remain; both respect
  `prefers-reduced-motion` via `MotionConfig reducedMotion="user"`.

---

## 6. Voice

Warm, plain, British. We are the people who turn up.

- **Do:** "We'll come and get you." / "Stuck? We've got you." / "Tell us where
  you are and someone from our Manchester team will be on their way."
- **Don't:** shout reassurance in all caps. "DON'T STAY STRANDED." reads as a
  threat.
- **UK English throughout.** Tyre, not tire. Kerb, not curb.
- **No em dashes** in customer-facing copy. Use a full stop or a comma.
  `src/services.test.ts` enforces this for the service pages.
- **Numbers must be real.** The dispatch panel counts real bookings and real
  drivers on duty, and quotes the measured response time once enough jobs have
  been timed (`backend/app/main.py`). A reader who catches one invented number
  stops believing the response time too.
- **Price before commitment.** The "From £40" line is derived from `FROM_PRICE`
  in `src/pricing.ts` so it can never drift from the real tariff, and the prices
  page shows the whole tariff.

---

## 7. Outstanding before launch

- Register **carrecoverynearme.uk** (and ideally the `.co.uk` if it ever
  frees up) and point Cloudflare Pages at it. `SITE_URL` in `src/config.ts`,
  `index.html`, `public/robots.txt` and the backend's `SITE_URL` already say it.
- The `hello@carrecoverynearme.uk` address needs a mailbox.
- No company number, trading address, insurer or accreditation is shown.
  "Fully insured" as plain text costs nothing to write, and readers know it.
- The testimonials are labelled illustrative. Real ratings now arrive through
  the tracking page; once there are a few dozen, show the real average instead.
