// The top of every public page: headline on the left, booking form on the
// right. No entrance animation on anything here. This is the first thing a
// stranded person sees and the prerendered HTML has to paint it before any
// script runs; a hero that fades in is a hero that is invisible for the
// slowest second of the visit.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Home, PhoneCall } from '../icons';
import { PHONE_TEL } from '../config';
import { BookingForm } from './BookingForm';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=80';

function LiveBadge() {
  // Deliberately no driver count here. Real availability is quoted where it
  // can be acted on: as a wait to your own pickup, in the booking panel.
  return (
    <div className="inline-flex items-center gap-2 bg-neutral-950 border-2 border-yellow-400 text-yellow-400 px-3 sm:px-4 py-1.5 sm:py-2 rounded-none text-xs sm:text-sm font-bold mb-3 lg:mb-6 uppercase tracking-wider">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-yellow-400 opacity-75"></span>
        <span className="relative inline-flex rounded-none h-3 w-3 bg-yellow-400"></span>
      </span>
      Recovery Drivers On Call 24/7
    </div>
  );
}

export interface HeroProps {
  regionName: string;
  /** Small line above the headline, e.g. "Stuck? We've got you." */
  eyebrow: string;
  /** The h1 in two lines. The second is set on the yellow block. */
  headline: [string, string];
  /** Three short reassurances, shown on desktop. */
  lines: ReactNode[];
  /** A paragraph under the headline on service pages. */
  intro?: string;
  /** Shown for every page except the homepage. */
  breadcrumb?: string;
  /** Preselects the booking form's service. */
  defaultService?: string;
}

export function Hero({
  regionName,
  eyebrow,
  headline,
  lines,
  intro,
  breadcrumb,
  defaultService,
}: HeroProps) {
  return (
    <section className="relative bg-white text-slate-950 pt-6 lg:pt-20 pb-10 lg:pb-20 px-4 overflow-hidden border-b border-slate-200">
      <div className="absolute inset-0 z-0 opacity-30 lg:opacity-100">
        <div
          className="kenburns absolute inset-0 bg-cover bg-center md:bg-right"
          style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white lg:hidden"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent hidden lg:block w-2/3"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-2 gap-6 lg:gap-12 items-center">
        <div>
          {breadcrumb && (
            <nav aria-label="Breadcrumb" className="mb-5">
              <ol className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-500 tracking-wider uppercase flex-wrap">
                <li>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 hover:text-red-600 transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Home</span>
                  </Link>
                </li>
                <li className="text-slate-400" aria-hidden="true">
                  /
                </li>
                <li className="text-red-600" aria-current="page">
                  {breadcrumb}
                </li>
              </ol>
            </nav>
          )}

          <LiveBadge />

          {/* `sr-only` below sm: on a phone the form is the whole job, so the
              headline is hidden visually but kept in the DOM. It is the page's
              only h1 and Google indexes the mobile rendering. */}
          <h1 className="sr-only sm:not-sr-only font-display sm:text-6xl md:text-7xl tracking-tight sm:mb-6 leading-[1.08]">
            <span className="hidden md:block text-sm text-red-600 mb-4 font-black tracking-[0.3em] uppercase font-sans">
              {eyebrow}
            </span>
            {headline[0]}
            <br />
            <span className="inline-block mt-1.5 lg:mt-3 leading-[0.95] px-2 sm:px-3 pt-1 pb-1.5 bg-yellow-400 text-neutral-950">
              {headline[1]}
            </span>
          </h1>

          {intro && (
            <p className="hidden lg:block text-lg text-slate-700 font-medium leading-relaxed mb-8 max-w-xl">
              {intro}
            </p>
          )}

          <div className="hidden lg:flex flex-col gap-3 mb-8">
            {lines.map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-base sm:text-lg font-bold text-slate-700"
              >
                <CheckCircle2 className="text-neutral-950 w-6 h-6 shrink-0" />
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div className="hidden lg:flex flex-col gap-4">
            <a
              href={`tel:${PHONE_TEL}`}
              data-call="hero"
              className="sheen w-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-5 px-6 rounded-none flex items-center justify-center gap-3 text-xl sm:text-2xl uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg"
            >
              <PhoneCall className="w-6 h-6 sm:w-7 sm:h-7" />
              <span>Tap to Call Now</span>
            </a>
          </div>
        </div>

        <BookingForm regionName={regionName} defaultService={defaultService} />
      </div>
    </section>
  );
}
