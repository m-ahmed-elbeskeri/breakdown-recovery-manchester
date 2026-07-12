// Custom brand mark: a bold tow-hook — the universal symbol of vehicle recovery
// — on a brutalist red badge with a hard black offset shadow, echoing the
// site's shadow-[Npx] aesthetic. Drawn from scratch (not an icon-library glyph)
// so it reads as a designed logo rather than a generic truck.

export function Logo({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* hard offset shadow */}
      <rect x="6" y="6" width="40" height="40" fill="#0a0a0a" />
      {/* hazard-yellow badge */}
      <rect x="0" y="0" width="40" height="40" fill="#f5c518" />
      {/* tow-hook glyph */}
      <g fill="none" stroke="#141414" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="10" r="2.7" />
        <path d="M20 12.7 V 23 C 20 28.6 13.4 29 13.1 23" />
      </g>
    </svg>
  );
}
