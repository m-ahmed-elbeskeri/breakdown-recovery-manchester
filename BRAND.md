# Recovery Mayte — brand toolbox

The design system for the site. **`src/index.css` is the single source of truth**
— every value below is defined there as a CSS custom property. Change it there
and the whole site follows. Do not hard-code hex values in components.

---

## 1. The name

**Recovery Mayte.** "Mayte" as in _mate_ — the one who turns up when you're stuck.
That word does a lot of work and the rest of the system has to earn it: a
customer meets this brand on the worst ten minutes of their week, on a phone, at
the side of a road. Everything below is chosen to **lower** their pulse, not
raise it.

Written as `Recovery Mayte` in prose. Set as a two-part wordmark in the UI:
`RECOVERY` in ink, `MAYT` in the accent colour. Defined once in
`src/config.ts` as `BRAND_NAME` and `BRAND_WORDMARK`.

### The mark

A round hazard-yellow badge with a face, where **the smile is a tow hook** — the
mouth sweeps down and its right tip curls back up into the hook's throat.
Recovery kit and a grin in one glyph. Round, not square, because rounded shapes
read as friendly and the square badge read as a contractor's logo.

Lives in `src/components/Logo.tsx`, mirrored in `public/favicon.svg`,
`public/logo.svg` and `public/og-image.svg`. **If you change one, change all
four** — they are separate files and will drift.

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

**`slate-*` and `neutral-*` resolve to the same ramp on purpose.** The original
build mixed cool `slate`, pure `neutral` and blue `navy` — three different
colour families — which is what made the page look muddy. Every neutral here is
mixed toward navy (hue ≈ 213), so a light section and a dark panel are visibly
the same family.

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

### Contrast

All combinations in use meet WCAG AA. The ones to watch:

- `neutral-400` on `neutral-950` — 6.5:1 ✓
- `navy-700` on white — 10.7:1 ✓
- `neutral-950` on `yellow-400` — 13:1 ✓
- white on `navy-900` — 16:1 ✓
- `neutral-400` on white — 3.0:1 ✗ — large/decorative text only

---

## 3. Type

Two faces, loaded in `index.html`.

### Anton — `font-display`

Ultra-condensed heavy grotesque. It is loud, and loudness is a limited resource.
**Restricted to three places:**

1. The hero `<h1>`
2. The closing CTA headline
3. Big call-to-action buttons

Always uppercase, always `tracking-tight`.

Do **not** use it for section headings. When every heading was Anton in all
caps, the page read as a construction hoarding, and all-caps removes word-shape
cues — measurably slower to read, which is the wrong trade for someone stressed
and scanning one-handed.

### Inter — `font-sans`

Everything else. Neutral, highly legible at small sizes, excellent in forms.

| Role             | Weight                                 | Case       |
| ---------------- | -------------------------------------- | ---------- |
| Section headings | 800 (`font-extrabold`)                 | Title Case |
| Sub-headings     | 700 (`font-bold`)                      | Title Case |
| Body             | 400–500                                | Sentence   |
| Eyebrow labels   | 900 (`font-black`), `tracking-[0.3em]` | UPPERCASE  |
| Stat figures     | 900                                    | —          |

Small uppercase labels are fine — they're labels, not reading matter.

---

## 4. Surface and depth

**No hard offset shadows.** The original build used `shadow-[Npx_Npx_0_0_#…]`
on cards, buttons and panels — a brutalist doubled-edge effect. At volume it
made every element look duplicated and it was distracting. Use soft elevation:

| Level                           | Use           |
| ------------------------------- | ------------- |
| `shadow-sm` → `hover:shadow-md` | Buttons       |
| `shadow-md` → `hover:shadow-lg` | Primary CTAs  |
| `shadow-lg` / `shadow-xl`       | Cards, panels |

Corners stay square (`rounded-none`) — that's the industrial edge worth keeping.

---

## 5. Motion

Motion is decoration; nobody stranded is enjoying it.

- **No scrolling ticker, no crawling caution tape.** Both were removed. The
  dispatch tape is a static strip; `.hazard-stripes` is a solid yellow rule, not
  a diagonal gradient.
- **Reveal-on-scroll is disabled below 640px** (`src/components/motion.tsx`).
  Flicking quickly down a phone outruns the fade and sections land blank, which
  reads as a broken page.
- Hero image `kenburns` drift and button `sheen` remain; both respect
  `prefers-reduced-motion` via `MotionConfig reducedMotion="user"`.

---

## 6. Voice

Warm, plain, British. We are the mate who turns up.

- **Do:** "We'll come and get you." / "Stuck? We've got you." / "Tell us where
  you are and someone from our Manchester team will be on their way."
- **Don't:** shout reassurance in all caps. "DON'T STAY STRANDED." was the old
  line and it reads as a threat.
- **UK English throughout.** Tyre, not tire. Kerb, not curb.
- **No em dashes** in customer-facing copy. Use a full stop or a comma.
- **Numbers must survive arithmetic.** Rescues-per-day divided by drivers has to
  land on a believable figure — a reader who catches one inflated number stops
  believing the response time too. `src/metrics.tsx` and `backend/seed.py` carry
  matching notes.
- **Price before commitment.** The "From £40" line is derived from `FROM_PRICE`
  in `src/pricing.ts` so it can never drift from the real tariff.

---

## 7. Outstanding before launch

Not design, but the biggest trust gaps on the page:

- The `.co.uk` domain and the `info@` address are still placeholders. Real ones
  go in `src/config.ts` plus the JSON-LD in `index.html`. (The phone number is
  live: `07442 384141`.)
- No company number, trading address, insurer or accreditation is shown.
  "Fully insured" as plain text costs nothing to write, and readers know it.
