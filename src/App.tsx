import { BrowserRouter, Routes, Route, useParams, Link } from 'react-router-dom';
import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, PhoneCall, CheckCircle2, Home, Phone, MapPin, Clock } from './icons';
import { Logo } from './components/Logo';
import { Reveal } from './components/motion';
import { DispatchTicker } from './components/DispatchTicker';
import {
  REGIONS,
  HOME_REGION,
  PHONE_TEL,
  PHONE_DISPLAY,
  BRAND_NAME,
  BRAND_WORDMARK,
  regionFromSlug,
  regionPath,
} from './config';
import { TRUST_ITEMS } from './data';
import { useRegionSeo } from './seo';
import { MetricsProvider, useMetrics } from './metrics';
import { scrollToBooking } from './ui';
import { BookingForm } from './components/BookingForm';
import { FeaturedServices, ServicesGrid } from './components/Services';
import { Testimonials } from './components/Testimonials';
import { FaqSection } from './components/FaqSection';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/AdminPage';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=80';

function UrgencyBar({ regionName }: { regionName: string }) {
  const { driversAvailable, isLive } = useMetrics();
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
          {isLive ? (
            <>
              <span className="text-yellow-400 font-black">{driversAvailable} VEHICLES</span>{' '}
              AVAILABLE NOW
            </>
          ) : (
            <span className="text-yellow-400 font-black">VEHICLES AVAILABLE 24/7</span>
          )}
        </span>
      </div>
    </>
  );
}

function LiveBadge() {
  const { driversAvailable, isLive } = useMetrics();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 bg-neutral-950 border-2 border-yellow-400 text-yellow-400 px-3 sm:px-4 py-1.5 sm:py-2 rounded-none text-xs sm:text-sm font-bold mb-3 lg:mb-6 uppercase tracking-wider"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-yellow-400 opacity-75"></span>
        <span className="relative inline-flex rounded-none h-3 w-3 bg-yellow-400"></span>
      </span>
      {isLive ? `Live: ${driversAvailable} Drivers Available Now` : 'Recovery Drivers On Call 24/7'}
    </motion.div>
  );
}

function Header({ regionName }: { regionName: string }) {
  return (
    <header className="sticky top-0 z-50 bg-white text-slate-950 border-b-2 border-slate-950">
      <div className="max-w-6xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <Logo className="w-11 h-11 shrink-0" />
          <div>
            <div className="font-display text-xl sm:text-2xl tracking-tight leading-none">
              {BRAND_WORDMARK[0]} <span className="text-red-600">{BRAND_WORDMARK[1]}</span>
            </div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase mt-1">
              {regionName} Breakdown
            </div>
          </div>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500">
              24/7 Dispatch
            </div>
            <a
              href={`tel:${PHONE_TEL}`}
              className="text-2xl font-display text-red-600 hover:text-red-500 transition-colors leading-tight"
            >
              {PHONE_DISPLAY}
            </a>
          </div>
          <a
            href={`tel:${PHONE_TEL}`}
            className="bg-yellow-400 hover:bg-yellow-300 text-neutral-950 px-7 py-3 rounded-none font-bold text-base uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 shadow-sm hover:shadow-md"
          >
            Book Now <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ regionName }: { regionName: string }) {
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
          {regionName !== HOME_REGION && (
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
                  Breakdown Recovery {regionName}
                </li>
              </ol>
            </nav>
          )}

          <LiveBadge />

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            // `sr-only` below sm: on a phone the form is the whole job, so the
            // headline is hidden visually but kept in the DOM — it's the page's
            // only h1 and Google indexes the mobile rendering.
            className="sr-only sm:not-sr-only font-display sm:text-6xl md:text-7xl tracking-tight sm:mb-6 leading-[1.08]"
          >
            <span className="hidden md:block text-sm text-red-600 mb-4 font-black tracking-[0.3em] uppercase font-sans">
              Stuck? We've got you.
            </span>
            BREAKDOWN
            <br />
            RECOVERY
            <br />
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="inline-block origin-left mt-1.5 lg:mt-3 leading-[0.95] px-2 sm:px-3 pt-1 pb-1.5 bg-yellow-400 text-neutral-950"
            >
              {regionName.toUpperCase()}.
            </motion.span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden lg:flex flex-col gap-3 mb-8"
          >
            {[
              <>
                Arriving in <span className="text-red-600 font-black">30 Minutes</span> or less
              </>,
              <>
                No Hidden Fees & <span className="text-red-600 font-black">Low Cost</span> Guarantee
              </>,
              <>
                24/7 Dispatch Across <span className="text-red-600 font-black">{regionName}</span>
              </>,
            ].map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-base sm:text-lg font-bold text-slate-700"
              >
                <CheckCircle2 className="text-neutral-950 w-6 h-6 shrink-0" />
                <span>{line}</span>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden lg:flex flex-col gap-4"
          >
            <a
              href={`tel:${PHONE_TEL}`}
              className="sheen w-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display py-5 px-6 rounded-none flex items-center justify-center gap-3 text-xl sm:text-2xl uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg"
            >
              <PhoneCall className="w-6 h-6 sm:w-7 sm:h-7" />
              <span>Tap to Call Now</span>
            </a>
          </motion.div>
        </div>

        <BookingForm regionName={regionName} />
      </div>
    </section>
  );
}

function TrustBar() {
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

function SeoContent({ regionName }: { regionName: string }) {
  return (
    <Reveal>
      <section className="py-10 sm:py-16 px-4 max-w-3xl mx-auto prose prose-slate">
        <h2 className="font-sans font-extrabold text-2xl mb-4 tracking-tight">
          {regionName}'s Most Reliable Breakdown Recovery
        </h2>
        <p className="text-slate-600 mb-4">
          When you're stuck on the road in {regionName}, you need a recovery service that's fast,
          reliable, and transparent. We provide 24/7 car recovery, van towing, and roadside
          assistance across the entire region.
        </p>
        <p className="text-slate-600 mb-4">
          Our modern fleet of recovery trucks is strategically positioned around {regionName} to
          ensure we can reach you within 30 minutes. With our live tracking technology, you'll never
          be left wondering when help will arrive.
        </p>
        <ul className="space-y-2 mb-8">
          {[
            'Available 24 hours a day, 365 days a year',
            'Fully insured and trained recovery operators',
            'Transparent pricing with no hidden fees',
            `Covering all of ${regionName} and surrounding areas`,
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-slate-800">
              <CheckCircle2 className="w-5 h-5 text-neutral-950 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </Reveal>
  );
}

function Coverage() {
  return (
    <section className="py-12 sm:py-20 px-4 bg-navy-900 text-white border-t border-navy-800">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-3">
            Coverage Map
          </div>
          <h2 className="font-sans font-extrabold text-3xl md:text-5xl mb-4 tracking-tight">
            Breakdown Recovery <span className="text-yellow-400">Areas We Cover</span>
          </h2>
          <p className="text-blue-100 text-lg max-w-3xl mx-auto">
            We provide rapid 24/7 breakdown recovery, towing, and roadside assistance across all of
            Greater Manchester and surrounding areas.
          </p>
        </Reveal>

        {/* Tiles stretch to a common height (`h-full` on both the Reveal wrapper
            and the link). Three areas are double-barrelled — "Hazel Grove and
            Bramhall", "Cheadle and Gatley", "Bredbury and Romiley" — and at two
            columns on a phone they cannot fit one line at a legible size. So
            they wrap, and every tile in the row matches them instead of the row
            going ragged. The ampersand buys back a line's worth of width.
            REGIONS itself is untouched: it drives the URL slugs and page
            titles, and renaming an entry would change a live SEO route. */}
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

function FinalCta({ regionName }: { regionName: string }) {
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

function Footer({ regionName }: { regionName: string }) {
  return (
    <footer className="bg-neutral-950 text-neutral-300 pt-10 sm:pt-16 pb-28 sm:pb-16 px-4 text-sm border-t-4 border-yellow-400">
      <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-12">
        <div className="col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <Logo className="w-10 h-10 shrink-0" />
            <span className="font-display text-2xl tracking-tight text-white">
              {BRAND_WORDMARK[0]} <span className="text-yellow-400">{BRAND_WORDMARK[1]}</span>
            </span>
          </div>
          <p className="mb-6 max-w-md font-medium leading-relaxed">
            {regionName}'s premier 24/7 breakdown and recovery service. Professional, friendly, and
            affordable vehicle transport across the UK.
          </p>
          <div className="flex gap-4">
            <div className="bg-neutral-900 p-3 rounded-none border-2 border-neutral-800">
              <div className="font-display text-yellow-400 text-lg">24/7</div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Dispatch
              </div>
            </div>
            <div className="bg-neutral-900 p-3 rounded-none border-2 border-neutral-800">
              <div className="font-display text-yellow-400 text-lg">30m</div>
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Avg ETA
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-white font-sans font-extrabold text-sm mb-4 uppercase tracking-[0.15em]">
            Services
          </h4>
          <ul className="space-y-3 font-medium">
            {[
              'Vehicle Towing',
              'Auction Transport',
              '12V Jump Start',
              'Secure Storage',
              'Flat Tyre Repair',
            ].map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={scrollToBooking}
                  className="hover:text-red-500 transition-colors text-left"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-sans font-extrabold text-sm mb-4 uppercase tracking-[0.15em]">
            Contact
          </h4>
          <ul className="space-y-3 font-medium">
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-red-500" />{' '}
              <a href={`tel:${PHONE_TEL}`} className="hover:text-red-500 transition-colors">
                {PHONE_DISPLAY}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" /> {regionName}, UK
            </li>
            <li className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-500" /> Open 24 Hours
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-neutral-900 text-center font-medium flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p>
          © 2026 {BRAND_NAME}. Breakdown Recovery {regionName}. All rights reserved.
        </p>
        <Link to="/privacy" className="hover:text-red-500 transition-colors underline">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}

function MobileCta() {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50 sm:hidden">
      <div className="flex gap-3">
        {/* Equal widths: at flex-[3] the Call button's box dwarfed its label.
            It stays primary through colour, not size. */}
        <a
          href={`tel:${PHONE_TEL}`}
          className="flex-1 bg-yellow-400 text-neutral-950 font-bold text-base py-3.5 rounded-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-yellow-400/30"
        >
          <PhoneCall className="w-5 h-5 shrink-0" />
          Call Now
        </a>
        <button
          type="button"
          onClick={scrollToBooking}
          className="flex-1 bg-neutral-950 text-white font-bold text-base py-3.5 rounded-sm flex items-center justify-center active:scale-95 transition-transform shadow-md"
        >
          Book Online
        </button>
      </div>
    </div>
  );
}

function LandingPage() {
  const { regionSlug } = useParams();
  const region = regionFromSlug(regionSlug);

  // An unknown slug is a real 404, not a silent fallback to the home region.
  if (region === null) return <NotFoundPage />;

  return <RegionLanding regionName={region} />;
}

function RegionLanding({ regionName }: { regionName: string }) {
  useRegionSeo(regionName);

  return (
    <MetricsProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-950 selection:bg-yellow-400 selection:text-neutral-950">
        <UrgencyBar regionName={regionName} />
        <Header regionName={regionName} />
        <main>
          <Hero regionName={regionName} />
          <TrustBar />
          <DispatchTicker />
          <FeaturedServices regionName={regionName} />
          <ServicesGrid />
          <Testimonials />
          <SeoContent regionName={regionName} />
          <FaqSection regionName={regionName} />
          <Coverage />
          <FinalCta regionName={regionName} />
        </main>
        <Footer regionName={regionName} />
        <MobileCta />
      </div>
    </MetricsProvider>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/:regionSlug" element={<LandingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  );
}
