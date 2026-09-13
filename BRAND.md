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

Three roles, and only three. If a colour you want doesn't have a role, it
doesn't go in.

| Role       | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| **Navy**   | Trust. Accents, links, structure, big reassurance panels. |
| **Yellow** | Action. Buttons, and only things meant to be tapped.      |
| **Ink**    | One neutral ramp for text, surfaces and borders.          |

### Why navy carries the trust

Every UK breakdown and emergency service reaches for blue — AA, RAC, police,
NHS. It reads calm, institutional, competent. That is exactly the feeling
someone stranded needs.

### Why yellow is never a background

Hi-vis yellow at page scale is the colour language of _hazard_, not _help_. It
raises arousal in a reader who is already frightened, and it's the
cheapest-feeling colour in UK service branding. As a small action colour it's
outstanding: it grabs the eye and it's unmissable on a dark panel. So it's
confined to buttons, badges and rules.

There is also **no true red** in the palette. Red is the universal error colour;
a page peppered with red accents hums with low-level alarm. It's reserved for
validation failures alone.

### Ink

| Token               | Hex       | Use                                   |
| ------------------- | --------- | ------------------------------------- |
| `slate/neutral-50`  | `#f5f7fa` | Page background, alternating sections |
| `slate/neutral-100` | `#eaeef3` | Subtle fills                          |
| `slate/neutral-200` | `#d8dfe8` | Borders, rules                        |
| `slate/neutral-300` | `#bac5d2` | Disabled text, dividers               |
| `slate/neutral-400` | `#8f9dae` | Muted text on dark panels             |
| `slate/neutral-500` | `#6d7c8e` | Secondary text on light               |
| `slate/neutral-600` | `#52606f` | Body text on light                    |
| `slate/neutral-700` | `#3b4753` | Strong body text                      |
| `slate/neutral-800` | `#26303b` | Dark panel surfaces                   |
| `slate/neutral-900` | `#18202a` | Darker panel surfaces                 |
| `slate/neutral-950` | `#0e151d` | Primary dark panel, headings on light |

**`slate-*` and `neutral-*` resolve to the same ramp on purpose.** Every
neutral here is mixed toward navy (hue ≈ 213), so a light section and a dark
panel are visibly the same family.

### Navy

| Token      | Hex       | Use                                    |
| ---------- | --------- | -------------------------------------- |
| `navy-50`  | `#eef4fb` | Tint background                        |
| `navy-100` | `#d8e6f5` | Body text on navy panels               |
| `navy-200` | `#b3cdea` | Muted text on navy                     |
| `navy-300` | `#85aeda` | Secondary text on navy                 |
| `navy-400` | `#5288c2` | Decorative                             |
| `navy-500` | `#2f68a6` | Decorative                             |
| `navy-600` | `#245488` | Hover on navy accents                  |
| `navy-700` | `#1b4069` | **Accent text on light** (10.7:1)      |
| `navy-800` | `#143050` | Card surfaces on navy                  |
| `navy-900` | `#0d2038` | **Reassurance panels** (CTA, coverage) |
| `navy-950` | `#081525` | Deepest surface                        |

### Yellow

| Token        | Hex       | Use                           |
| ------------ | --------- | ----------------------------- |
| `yellow-300` | `#ffd94f` | Button hover                  |
| `yellow-400` | `#f5c518` | **The action colour**         |
| `yellow-500` | `#d9a800` | Pressed, or on light surfaces |

Text on yellow is always `neutral-950`. Never white — it fails contrast.

### Semantic

| Token                 | Hex       | Use                        |
| --------------------- | --------- | -------------------------- |
| `--color-danger`      | `#c0392b` | Validation errors, light   |
| `--color-danger-soft` | `#ff8a7a` | Validation errors, on dark |
| `--color-success`     | `#1f7a4d` | Confirmations              |

### Legacy remaps

The markup still carries `red-*` and `blue-*` class names from the original
build. Rather than rewrite hundreds of class names, those scales resolve into
the system in `index.css`:

- `red-600` / `red-700` → navy (accent text on light)
- `red-400` / `red-500` → yellow (accent text on dark panels)
- `blue-50` / `blue-100` → navy tints

New work should use `navy-*`, `yellow-*` and `slate-*` directly.

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
- **Price before commitment.** The "From £55" line is derived from `FROM_PRICE`
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
