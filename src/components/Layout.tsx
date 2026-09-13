// The furniture shared by every public page: the bars above and below the
// hero, the coverage grid, the closing call to action and the footer.

import { Link } from 'react-router-dom';
import { ArrowRight, PhoneCall, Phone, MapPin, Clock, Pin, Coins, Navigation } from '../icons';
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
      <div className="hazard-stripes h-2" aria-hidden="true" />
      <div className="bg-neutral-950 text-white text-xs sm:text-sm font-bold py-2 sm:py-2.5 px-4 text-center flex items-center justify-center gap-2 tracking-wider uppercase">
        {/* On a phone this bar sits directly above the live-drivers badge, so it
            states the always-on promise rather than repeating the same count. */}
        <span className="sm:hidden">
          <span className="text-yellow-400 font-black">24/7</span> Emergency Dispatch{' '}
          <span className="mx-1 text-yellow-400/60">//</span> {regionName.toUpperCase()}
        </span>
        <span className="hidden sm:inline">
          FAST DISPATCH IN {regionName.toUpperCase()}{' '}
          <span className="mx-1.5 text-yellow-400/60">//</span>{' '}
          <span className="text-yellow-400 font-black">PRICE UP FRONT · TRACK YOUR DRIVER</span>
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
  children,
}: {
  to?: string;
  className: string;
  children: React.ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={scrollToBooking} className={className}>
      {children}
    </button>
  );
}

export function Header({ regionName, bookTo }: { regionName: string; bookTo?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white text-slate-950 border-b-2 border-slate-950">
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
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-red-600 transition-colors"
          >
            Prices
          </Link>
          <Link
            to="/#services"
            className="text-sm font-bold uppercase tracking-wider text-slate-600 hover:text-red-600 transition-colors"
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
              className="text-2xl font-display text-red-600 hover:text-red-500 transition-colors leading-tight"
            >
              {PHONE_DISPLAY}
            </a>
          </div>
          <BookNow
            to={bookTo}
            className="bg-yellow-400 hover:bg-yellow-300 text-neutral-950 px-7 py-3 rounded-none font-bold text-base uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 shadow-sm hover:shadow-md"
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
    <section className="bg-white border-y border-slate-200 py-5 sm:py-6 px-4">
      {/* A 2x2 grid on a phone. Wrapping a single flex row left the four labels
          ragged and unevenly spaced, because they are four different lengths. */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 gap-x-3 gap-y-5 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-12 sm:gap-y-4">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.text}
              className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left text-slate-600 font-semibold uppercase tracking-wider text-[11px] sm:text-base"
            >
              <Icon className="w-6 h-6 sm:w-5 sm:h-5 text-navy-700 shrink-0" />
              <span>{item.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    icon: Pin,
    title: 'Tell us where you are',
    body: 'Postcode, street name, or tap Find Me and your phone tells us. Add your number so the driver can reach you. That is all we ask before you see a price.',
  },
  {
    icon: Coins,
    title: 'See your price and a live wait',
    body: 'Choose what is wrong and the full price appears, worked out from the real driving route. The wait is measured from where the nearest driver actually is, not a promise from a call centre.',
  },
  {
    icon: Navigation,
    title: 'Track your driver to your door',
    body: 'Once a driver takes your job you get a link with their name, a live ETA and their position on a map while they are on the way. Cancel from the same page if plans change, and rate them when it is done.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-12 sm:py-20 px-4 bg-white border-t border-slate-200" id="how-it-works">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-red-600 mb-3">
            How it works
          </div>
          <h2 className="font-sans font-extrabold text-3xl md:text-5xl text-slate-950 tracking-tight mb-4">
            Recovery that works like a taxi app
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            No ringing round. No "someone will call you back". No surprise when the truck arrives.
            The price and the wait are on the screen before you hand over a thing.
          </p>
        </Reveal>
        <ol className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title} delay={i * 0.1} className="h-full">
                <li className="h-full bg-slate-50 border-2 border-slate-200 p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 bg-neutral-950 text-yellow-400 font-display text-xl flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <Icon className="w-6 h-6 text-navy-700 shrink-0" aria-hidden="true" />
                  </div>
                  <h3 className="font-sans font-extrabold text-xl tracking-tight text-slate-950">
                    {step.title}
                  </h3>
                  <p className="text-slate-600 font-medium leading-relaxed text-sm">{step.body}</p>
                </li>
              </Reveal>
            );
          })}
        </ol>
        <Reveal className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm font-bold text-slate-600">
          <span>
            From <span className="text-slate-950">£{FROM_PRICE}</span>, shown before you book.
          </span>
          <Link
            to={PRICING_PATH}
            className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-500 uppercase tracking-wider"
          >
            See every price <ArrowRight className="w-4 h-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function Coverage() {
  return (
    <section
      className="py-12 sm:py-20 px-4 bg-navy-900 text-white border-t border-navy-800"
      id="areas"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-3">
            Coverage Map
          </div>
          <h2 className="font-sans font-extrabold text-3xl md:text-5xl mb-4 tracking-tight">
            Car Recovery <span className="text-yellow-400">Areas We Cover</span>
          </h2>
          <p className="text-blue-100 text-lg max-w-3xl mx-auto">
            Rapid 24/7 car recovery, towing and roadside assistance across all of Greater Manchester
            and surrounding areas.
          </p>
        </Reveal>

        {/* Tiles stretch to a common height (`h-full` on both the Reveal wrapper
            and the link). Three areas are double-barrelled and at two columns on
            a phone they cannot fit one line at a legible size, so they wrap and
            every tile in the row matches them. The ampersand buys back a line's
            worth of width. REGIONS itself is untouched: it drives the URL slugs. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm font-bold text-blue-50">
          {REGIONS.filter((area) => area !== HOME_REGION).map((area, i) => (
            <Reveal key={area} delay={Math.min(i * 0.02, 0.5)} y={16} className="h-full">
              <Link
                to={regionPath(area)}
                className="h-full flex items-center gap-2 p-3 rounded-none bg-navy-800/60 border border-white/10 hover:bg-yellow-400 hover:text-neutral-950 hover:border-yellow-400 hover:-translate-y-0.5 transition-all justify-center text-center leading-tight text-balance"
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
    <section className="py-14 sm:py-24 px-4 bg-navy-900 relative overflow-hidden">
      <div className="hazard-stripes absolute inset-x-0 top-0 h-1.5" aria-hidden="true"></div>
      <div className="hazard-stripes absolute inset-x-0 bottom-0 h-1.5" aria-hidden="true"></div>
      <Reveal className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="font-display text-4xl md:text-6xl text-white mb-6 tracking-tight">
          We'll come and get you.
        </h2>
        <p className="text-lg sm:text-xl text-blue-100 font-semibold mb-8 sm:mb-12">
          Tell us where you are and someone from our {regionName} team will be on their way. Any
          hour, any day.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
          {/* Yellow is the action colour, so the primary CTA carries it. */}
          <a
            href={`tel:${PHONE_TEL}`}
            data-call="final-cta"
            className="sheen bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-4 px-8 rounded-none flex items-center justify-center gap-3 text-xl uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg"
          >
            <PhoneCall className="w-6 h-6" />
            {PHONE_DISPLAY}
          </a>
          <button
            type="button"
            onClick={scrollToBooking}
            className="bg-transparent text-white hover:bg-white hover:text-navy-900 border-2 border-white/70 font-display py-4 px-8 rounded-none flex items-center justify-center gap-3 text-xl uppercase tracking-wider transition-all hover:-translate-y-0.5"
          >
            Book Online Now
          </button>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer({ regionName }: { regionName: string }) {
  return (
    <footer className="bg-neutral-950 text-neutral-300 pt-10 sm:pt-16 pb-28 sm:pb-16 px-4 text-sm border-t-4 border-yellow-400">
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
            <div className="bg-neutral-900 p-3 rounded-none border-2 border-neutral-800">
              <div className="font-display text-yellow-400 text-lg">24/7</div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Dispatch
              </div>
            </div>
            <div className="bg-neutral-900 p-3 rounded-none border-2 border-neutral-800">
              <div className="font-display text-yellow-400 text-lg">£{FROM_PRICE}</div>
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
                <Link to={servicePath(page)} className="hover:text-red-500 transition-colors">
                  {page.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to={PRICING_PATH} className="hover:text-red-500 transition-colors">
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
              <Phone className="w-4 h-4 text-red-500" />{' '}
              <a
                href={`tel:${PHONE_TEL}`}
                data-call="footer"
                className="hover:text-red-500 transition-colors"
              >
                {PHONE_DISPLAY}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" /> {regionName}, Greater Manchester
            </li>
            <li className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-500" /> Open 24 Hours
            </li>
            <li className="break-all">
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-red-500 transition-colors">
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
        <Link to="/privacy" className="hover:text-red-500 transition-colors underline">
          Privacy Policy
        </Link>
        <Link to={RECRUIT_PATH} className="hover:text-red-500 transition-colors underline">
          Drive with us
        </Link>
        <Link to="/login" className="hover:text-red-500 transition-colors underline">
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
          className="flex-1 bg-yellow-400 text-neutral-950 font-bold text-base py-3.5 rounded-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-yellow-400/30"
        >
          <PhoneCall className="w-5 h-5 shrink-0" />
          Call Now
        </a>
        <BookNow
          to={bookTo}
          className="flex-1 bg-neutral-950 text-white font-bold text-base py-3.5 rounded-sm flex items-center justify-center active:scale-95 transition-transform shadow-md"
        >
          Book Online
        </BookNow>
      </div>
    </div>
  );
}
