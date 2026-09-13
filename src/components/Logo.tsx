// The brand mark for Car Recovery Near Me: a hazard-yellow map pin, and inside it
// a tow hook. The pin says "near me" — it is the glyph every phone already
// uses for "where you are" — and the hook says what turns up. Drawn from
// scratch rather than an icon-library glyph so it reads as a real logo, and
// kept to two shapes so it survives being a 16px favicon: at that size it is a
// yellow pin, which is exactly the right thing to be.
//
// Mirrored in public/favicon.svg, public/logo.svg and the brand templates in
// scripts/brand/. If you change one, change them all.

export function Logo({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* the pin */}
      <path
        d="M24 46 C20.5 40.5 9 31 9 20 A15 15 0 1 1 39 20 C39 31 27.5 40.5 24 46 Z"
        fill="#f5c518"
        stroke="#0e151d"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* the tow hook: eye, shank, curl */}
      <circle cx="26.5" cy="10.5" r="2.3" fill="none" stroke="#0e151d" strokeWidth="2.6" />
      <path
        d="M26.5 12.8 V19.5 C26.5 25 19 25.5 19 21"
        fill="none"
        stroke="#0e151d"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
