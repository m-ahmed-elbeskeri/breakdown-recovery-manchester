// The furniture shared by every public page: the bars above and below the
// hero, the coverage grid, the closing call to action and the footer.

import { Link } from 'react-router-dom';
import { ArrowRight, PhoneCall, Phone, MapPin, Clock, Truck } from '../icons';
import { Logo } from './Logo';
import { Reveal } from './motion';
import {
  REGIONS,
  HOME_REGION,
  PHONE_TEL,
  PHONE_DISPLAY,
  BRAND_NAME,
  BRAND_WORDMARK,
  CONTACT_EMAIL,
  regionPath,
} from '../config';
import { TRUST_ITEMS } from '../data';
import { SERVICE_PAGES, servicePath } from '../services';
import { PRICING_PATH, RECRUIT_PATH } from '../routes';
import { scrollToBooking } from '../ui';
import { FROM_PRICE } from '../pricing';

export function UrgencyBar({ regionName }: { regionName: string }) {
  return (
    <>
      {/* Sentence case, not shouted capitals: the first line a stranded
          reader sees should sound like a person, not a siren. */}
      <div className="bg-neutral-950 text-neutral-200 text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-4 text-center flex items-center justify-center gap-2">
        {/* On a phone this bar sits directly above the live-drivers badge, so it
            states the always-on promise rather than repeating the same count. */}
        <span className="sm:hidden">
          <span className="text-accent-400 font-bold">24/7</span> emergency recovery in {regionName}
        </span>
        <span className="hidden sm:inline">
          24/7 recovery in {regionName}
          <span className="mx-3 text-neutral-600" aria-hidden="true">
            |
          </span>
          <span className="text-accent-400 font-semibold">
            Your price up front, your driver tracked live
          </span>
        </span>
      </div>
    </>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display tracking-tight leading-none ${className}`}>
      {BRAND_WORDMARK[0]} <span className="wordmark-paint">{BRAND_WORDMARK[1]}</span>
    </span>
  );
}

/** "Book Now": scrolls to the form, or links to a page that has one. */
function BookNow({
  to,
  className,
  trackAs,
  children,
}: {
  to?: string;
  className: string;
  /** Which "Book" button this is, in the analytics. */
  trackAs: string;
  children: React.ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className={className} data-track={trackAs}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={scrollToBooking} className={className} data-track={trackAs}>
      {children}
    </button>
  );
}

export function Header({ regionName, bookTo }: { regionName: string; bookTo?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md text-slate-950 border-b border-slate-200 shadow-[0_1px_12px_rgba(14,21,29,0.06)]">
      <div className="max-w-6xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <Logo className="w-11 h-11 shrink-0" />
          <div className="min-w-0">
            <Wordmark className="text-lg sm:text-2xl block whitespace-nowrap" />
            <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase mt-1">
              {regionName} · 24/7
            </div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-6" aria-label="Site">
          <Link
            to={PRICING_PATH}
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-slate-600 transition-colors"
          >
            Prices
          </Link>
          <Link
            to={RECRUIT_PATH}
            data-track="header-drive"
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-slate-600 transition-colors"
          >
            Drive with us
          </Link>
          <Link
            to="/#services"
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-slate-600 transition-colors"
          >
            Services
          </Link>
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500">
              24/7 Dispatch
            </div>
            <a
              href={`tel:${PHONE_TEL}`}
              data-call="header"
              className="text-2xl font-display text-slate-950 hover:text-slate-600 transition-colors leading-tight"
            >
              {PHONE_DISPLAY}
            </a>
          </div>
          <BookNow
            to={bookTo}
            trackAs="header-book"
            className="bg-accent-400 hover:bg-accent-300 text-neutral-950 px-6 py-3 rounded-none font-bold text-base tracking-wide transition-all active:scale-95 flex items-center gap-2 shadow-md shadow-accent-500/20 hover:shadow-lg hover:shadow-accent-500/30"
          >
            Book Now <ArrowRight className="w-4 h-4" />
          </BookNow>
        </nav>
      </div>
    </header>
  );
}

export function TrustBar() {
  return (
    <section className="bg-white border-y border-slate-200 px-4" aria-label="Why use us">
      {/* A 2x2 grid on a phone, four equal columns with rules between them on
          a wide screen. Equal cells keep four labels of different lengths
          from looking ragged, and each carries a short line saying what the
          promise means for the reader, not just its name. */}
      <ul className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 md:divide-x divide-slate-200">
        {TRUST_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <li
              key={item.text}
              className={`flex items-center gap-3 py-4 sm:py-6 md:px-6 ${i % 2 === 0 ? 'pr-2' : 'pl-3 border-l border-slate-200 md:border-l-0'} ${i < 2 ? 'border-b border-slate-200 md:border-b-0' : ''}`}
            >
              <span className="w-10 h-10 sm:w-11 sm:h-11 bg-accent-400 text-neutral-950 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold text-slate-950 text-sm sm:text-base tracking-tight leading-tight">
                  {item.text}
                </span>
                <span className="block text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5 leading-snug">
                  {item.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Numbered, not illustrated. Three abstract glyphs next to three numbers gave
// the eye two things to decode where there was only one thing to say, and the
// number is the part that carries the meaning: this is short, and you can see
// the end of it from here.
const HOW_IT_WORKS = [
  {
    title: 'Tell us where you are',
    body: 'Postcode, street name, or tap Find Me and your phone tells us. Add your number so the driver can ring you when they are close. That is all we ask before you see a price.',
    aside: 'About 20 seconds',
  },
  {
    title: 'See your price and a live wait',
    body: 'Choose what is wrong and the full price appears, worked out from the real driving route. The wait is measured from where the nearest driver actually is, not a promise from a call centre.',
    aside: 'No card, no commitment',
  },
  {
    title: 'Track your driver to your door',
    body: 'Once a driver takes your job you get a link with their name, a live ETA and their position on a map while they are on the way. Cancel from the same page if plans change, and rate them when it is done.',
    aside: 'Free to cancel any time',
  },
];

export function HowItWorks() {
  return (
    <section className="py-12 sm:py-20 px-4 bg-white border-t border-slate-200" id="how-it-works">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-slate-950 mb-3">
            How it works
          </div>
          <h2 className="font-sans font-extrabold text-3xl md:text-5xl text-slate-950 tracking-tight mb-4">
            Your price, your wait, your driver, on screen
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            No ringing round. No "someone will call you back". No surprise when the truck arrives.
            The price and the wait are on the screen before you hand over a thing.
          </p>
        </Reveal>
        <ol className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1} className="h-full">
              <li className="h-full bg-white border border-slate-200 rounded-none p-6 flex flex-col gap-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                {/* The numeral is the whole graphic now, so it is sized to be
                    read across a room rather than tucked beside a glyph. */}
                <span className="w-12 h-12 rounded-none bg-accent-400 text-neutral-950 font-display text-2xl flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <h3 className="font-sans font-extrabold text-xl tracking-tight text-slate-950">
                  {step.title}
                </h3>
                <p className="text-slate-600 font-medium leading-relaxed text-sm">{step.body}</p>
                {/* The objection each step actually raises, answered on the
                    step itself: how long, what it costs me, can I back out. */}
                <p className="mt-auto pt-4 border-t border-slate-100 text-[11px] font-black uppercase tracking-[0.15em] text-slate-950">
                  {step.aside}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Coverage() {
  return (
    <section
      className="py-12 sm:py-20 px-4 bg-slate-50 text-slate-950 border-t border-slate-200"
      id="areas"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-slate-950 mb-3">
            Coverage Map
          </div>
          <h2 className="font-sans font-extrabold text-3xl md:text-5xl mb-4 tracking-tight">
            Car Recovery <span className="text-slate-950">Areas We Cover</span>
          </h2>
          <p className="text-slate-600 text-lg max-w-3xl mx-auto">
            Rapid 24/7 car recovery, towing and roadside assistance across all of Greater Manchester
            and surrounding areas.
          </p>
        </Reveal>

        {/* Tiles stretch to a common height (`h-full` on both the Reveal wrapper
            and the link). Three areas are double-barrelled and at two columns on
            a phone they cannot fit one line at a legible size, so they wrap and
            every tile in the row matches them. The ampersand buys back a line's
            worth of width. REGIONS itself is untouched: it drives the URL slugs. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm font-bold text-slate-800">
          {REGIONS.filter((area) => area !== HOME_REGION).map((area, i) => (
            <Reveal key={area} delay={Math.min(i * 0.02, 0.5)} y={16} className="h-full">
              <Link
                to={regionPath(area)}
                className="h-full flex items-center gap-2 p-3 rounded-none bg-white border border-slate-200 shadow-sm hover:bg-accent-400 hover:text-neutral-950 hover:border-accent-400 hover:-translate-y-0.5 transition-all justify-center text-center leading-tight text-balance"
              >
                {area.replace(' and ', ' & ')}
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ regionName }: { regionName: string }) {
  return (
    <section className="py-14 sm:py-24 px-4 bg-neutral-950 relative overflow-hidden">
      <Reveal className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="font-display text-4xl md:text-6xl text-white mb-6 tracking-tight">
          We'll come and get you.
        </h2>
        <p className="text-lg sm:text-xl text-neutral-300 font-semibold mb-8 sm:mb-12">
          Tell us where you are and someone from our {regionName} team will be on their way. Any
          hour, any day.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
          {/* Yellow is the action colour, so the primary CTA carries it. */}
          <a
            href={`tel:${PHONE_TEL}`}
            data-call="final-cta"
            className="sheen bg-accent-400 hover:bg-accent-300 text-neutral-950 font-display py-4 px-8 rounded-none flex items-center justify-center gap-3 text-xl uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-lg shadow-black/20 hover:shadow-xl"
          >
            <PhoneCall className="w-6 h-6" />
            {PHONE_DISPLAY}
          </a>
          <button
            type="button"
            onClick={scrollToBooking}
            data-track="final-cta-book"
            className="bg-transparent text-white hover:bg-white hover:text-neutral-950 border-2 border-white/70 font-display py-4 px-8 rounded-none flex items-center justify-center gap-3 text-xl uppercase tracking-wider transition-all hover:-translate-y-0.5"
          >
            Book Online Now
          </button>
        </div>
      </Reveal>
    </section>
  );
}

/** A slim band for recovery drivers who land on a customer page. */
export function DriverStrip() {
  return (
    <section
      className="bg-slate-100 border-t-2 border-slate-200 py-8 px-4"
      aria-label="For drivers"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="w-12 h-12 rounded-none bg-accent-400 text-neutral-950 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-sans font-extrabold text-xl tracking-tight text-slate-950">
              Own a recovery truck?
            </h2>
            <p className="text-slate-600 font-medium text-sm mt-1">
              Get jobs near you sent to your phone, with the price already worked out. You choose
              your hours.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <Link
            to={RECRUIT_PATH}
            data-track="driver-strip-apply"
            className="bg-neutral-950 hover:bg-neutral-800 text-white font-display px-6 py-3 rounded-none uppercase tracking-wider text-sm inline-flex items-center gap-2"
          >
            Drive with us <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-600 underline"
          >
            Driver sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer({ regionName }: { regionName: string }) {
  return (
    <footer className="bg-neutral-950 text-neutral-300 pt-10 sm:pt-16 pb-28 sm:pb-16 px-4 text-sm border-t-4 border-accent-400">
      <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-12">
        <div className="col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <Logo className="w-10 h-10 shrink-0" />
            <Wordmark className="text-2xl text-white" />
          </div>
          <p className="mb-6 max-w-md font-medium leading-relaxed">
            24/7 car recovery, towing and roadside help across {regionName} and Greater Manchester.
            The price on the screen before you book, and your driver on a map while they come to
            you.
          </p>
          <div className="flex gap-4">
            <div className="bg-neutral-900 p-3 rounded-none border border-neutral-800">
              <div className="font-display text-accent-300 text-lg">24/7</div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Dispatch
              </div>
            </div>
            <div className="bg-neutral-900 p-3 rounded-none border border-neutral-800">
              <div className="font-display text-accent-300 text-lg">£{FROM_PRICE}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                From
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-white font-sans font-extrabold text-sm mb-4 uppercase tracking-[0.15em]">
            Services
          </h4>
          <ul className="space-y-3 font-medium">
            {SERVICE_PAGES.map((page) => (
              <li key={page.slug}>
                <Link to={servicePath(page)} className="hover:text-accent-300 transition-colors">
                  {page.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to={PRICING_PATH} className="hover:text-accent-300 transition-colors">
                Prices
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-sans font-extrabold text-sm mb-4 uppercase tracking-[0.15em]">
            Contact
          </h4>
          <ul className="space-y-3 font-medium">
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-accent-300" />{' '}
              <a
                href={`tel:${PHONE_TEL}`}
                data-call="footer"
                className="hover:text-accent-300 transition-colors"
              >
                {PHONE_DISPLAY}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent-300" /> {regionName}, Greater Manchester
            </li>
            <li className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-300" /> Open 24 Hours
            </li>
            <li className="break-all">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="hover:text-accent-300 transition-colors"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-neutral-900 text-center font-medium flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p>
          © {new Date().getFullYear()} {BRAND_NAME}. Car Recovery {regionName}. All rights reserved.
        </p>
        <Link to="/privacy" className="hover:text-accent-300 transition-colors underline">
          Privacy Policy
        </Link>
        <Link to={RECRUIT_PATH} className="hover:text-accent-300 transition-colors underline">
          Drive with us
        </Link>
        <Link to="/login" className="hover:text-accent-300 transition-colors underline">
          Driver and staff sign in
        </Link>
      </div>
    </footer>
  );
}

export function MobileCta({ bookTo }: { bookTo?: string }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50 sm:hidden">
      <div className="flex gap-3">
        {/* Equal widths: at flex-[3] the Call button's box dwarfed its label.
            It stays primary through colour, not size. */}
        <a
          href={`tel:${PHONE_TEL}`}
          data-call="mobile-bar"
          className="flex-1 bg-accent-400 text-neutral-950 font-bold text-base py-3.5 rounded-none flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-accent-400/30"
        >
          <PhoneCall className="w-5 h-5 shrink-0" />
          Call Now
        </a>
        <BookNow
          to={bookTo}
          trackAs="mobile-bar-book"
          className="flex-1 bg-neutral-950 text-white font-bold text-base py-3.5 rounded-none flex items-center justify-center active:scale-95 transition-transform shadow-md"
        >
          Book Online
        </BookNow>
      </div>
    </div>
  );
}
