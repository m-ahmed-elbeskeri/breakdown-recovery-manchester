// Custom brand mark for Recovery Mayte — "mayt" as in mate, the one who turns up
// when you're stuck. So the mark is a friendly face on a round hazard-yellow
// badge, and the smile *is* a tow hook: the mouth sweeps down and its right tip
// curls back up into the hook's throat. Recovery kit and a grin in one glyph.
// Drawn from scratch (not an icon-library glyph) so it reads as a real logo.

export function Logo({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* round hazard-yellow badge with a soft dark ring */}
      <circle cx="24" cy="24" r="22" fill="#f5c518" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="#0e151d" strokeWidth="3" />

      {/* eyes */}
      <circle cx="17" cy="19.5" r="2.6" fill="#0e151d" />
      <circle cx="31" cy="19.5" r="2.6" fill="#0e151d" />

      {/* smile that becomes a tow hook at its right tip */}
      <path
        d="M14.5 27.5 C 17.5 34.5, 27.5 35.5, 31.5 29.5 C 33.2 26.8, 30.2 25.2, 29.8 28.4"
        fill="none"
        stroke="#0e151d"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
