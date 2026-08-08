// A static "dispatch tape" — a hi-vis strip of what we do, clipped to the
// viewport width and faded at both edges (see index.css).

const TICKER_ITEMS = [
  '24/7 Dispatch',
  'Flatbed Recovery',
  'EV & Hybrid',
  '12V Jump Start',
  'Motorway M60 · M61 · M62',
  'Out of Fuel',
  'Auction Transport',
  'Secure Storage',
  'Motorbike Recovery',
  'No Hidden Fees',
];

export function DispatchTicker() {
  return (
    <div className="hazard-stripes border-y-2 border-neutral-950 py-[3px]" aria-hidden="true">
      <div className="marquee bg-neutral-950 text-white">
        <div className="marquee-track">
          {TICKER_ITEMS.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-4 px-6 py-3 font-display text-sm uppercase tracking-[0.15em]"
            >
              {item}
              <span className="text-yellow-400">///</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
