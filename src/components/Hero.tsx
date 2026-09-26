// The top of every public page: headline on the left, booking form on the
// right. No entrance animation on anything here. This is the first thing a
// stranded person sees and the prerendered HTML has to paint it before any
// script runs; a hero that fades in is a hero that is invisible for the
// slowest second of the visit.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Home, PhoneCall } from '../icons';
import { PHONE_DISPLAY, PHONE_TEL } from '../config';
import { BookingForm } from './BookingForm';

// Risk reversal under the call button, short enough to sit on one line. Each is
// how the product already behaves.
const CALL_REASSURANCES = ['No payment to see your price', 'Free to cancel', 'No hidden fees'];

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=80';

export interface HeroProps {
  regionName: string;
  /** Small line above the headline, e.g. "Stuck? We've got you." */
  eyebrow: string;
  /** The h1 in two lines. The second is set on the accent block. */
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
                    className="inline-flex items-center gap-1.5 hover:text-slate-600 transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Home</span>
                  </Link>
                </li>
                <li className="text-slate-400" aria-hidden="true">
                  /
                </li>
                <li className="text-slate-950" aria-current="page">
                  {breadcrumb}
                </li>
              </ol>
            </nav>
          )}

          {/* `sr-only` below sm: on a phone the form is the whole job, so the
              headline is hidden visually but kept in the DOM. It is the page's
              only h1 and Google indexes the mobile rendering. */}
          <h1 className="sr-only sm:not-sr-only font-display sm:text-6xl md:text-7xl tracking-tight sm:mb-6 leading-[1.08]">
            <span className="hidden md:block text-sm text-slate-950 mb-4 font-black tracking-[0.3em] uppercase font-sans">
              {eyebrow}
            </span>
            {headline[0]}
            <br />
            <span className="inline-block mt-1.5 lg:mt-3 leading-[0.95] px-2.5 sm:px-3.5 pt-1 pb-1.5 bg-accent-400 text-neutral-950 rounded-none">
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
                <CheckCircle2 className="text-slate-950 w-6 h-6 shrink-0" />
                <span>{line}</span>
              </div>
            ))}
          </div>

          {/* The number itself on the button, not "tap to call": on a desktop
              nobody can tap, and a real, readable number is a trust signal in
              its own right. The risk-reversal line sits directly under it,
              where the hesitation happens. */}
          <div className="hidden lg:flex flex-col gap-3 max-w-xl">
            <a
              href={`tel:${PHONE_TEL}`}
              data-call="hero"
              className="sheen w-full bg-accent-400 hover:bg-accent-300 text-neutral-950 font-display py-5 px-6 rounded-none flex items-center justify-center gap-3 text-xl sm:text-2xl uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30"
            >
              <PhoneCall className="w-6 h-6 sm:w-7 sm:h-7" />
              <span>Call {PHONE_DISPLAY}</span>
            </a>
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1.5">
              {CALL_REASSURANCES.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5 text-slate-950 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <BookingForm regionName={regionName} defaultService={defaultService} />
      </div>
    </section>
  );
}
