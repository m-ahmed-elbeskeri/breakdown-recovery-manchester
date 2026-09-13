// An area page: the homepage for Manchester, /car-recovery-<area> for the
// other 35. Same structure throughout, so every area gets the full pitch and
// its own title, copy, FAQ and structured data.

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from '../icons';
import { HOME_REGION } from '../config';
import { Hero } from '../components/Hero';
import {
  Coverage,
  FinalCta,
  Footer,
  Header,
  HowItWorks,
  MobileCta,
  TrustBar,
  UrgencyBar,
} from '../components/Layout';
import { Reveal } from '../components/motion';
import { DispatchTicker } from '../components/DispatchTicker';
import { FeaturedServices, ServicesGrid } from '../components/Services';
import { Testimonials } from '../components/Testimonials';
import { FaqSection } from '../components/FaqSection';
import { MetricsProvider } from '../metrics';
import { regionSeo, usePageSeo } from '../seo';
import { setTelemetryRegion, startTelemetry, track } from '../telemetry';

function SeoContent({ regionName }: { regionName: string }) {
  return (
    <Reveal>
      <section className="py-10 sm:py-16 px-4 max-w-3xl mx-auto prose prose-slate">
        <h2 className="font-sans font-extrabold text-2xl mb-4 tracking-tight">
          Car Recovery Near You in {regionName}
        </h2>
        <p className="text-slate-600 mb-4">
          When your car packs in somewhere in {regionName}, the last thing you want is to ring round
          five numbers and be told "about an hour" by people who cannot see their own trucks. We
          work the other way round. You tell us where you are, the price appears on the screen, and
          the wait you see is measured from where the nearest driver actually is.
        </p>
        <p className="text-slate-600 mb-4">
          Once a driver takes your job you get a link that shows their name, a live ETA and the
          truck on a map as it comes to you. Recovery, towing, jump starts, fuel, tyres, EVs and
          motorbikes, across {regionName} and the whole of Greater Manchester, day and night.
        </p>
        <ul className="space-y-2 mb-8">
          {[
            'Available 24 hours a day, 365 days a year',
            'Your price on screen before you hand over a phone number',
            'Live ETA and driver tracking, not a promise from a call centre',
            'Fully insured, flatbed recovery for cars, vans, EVs and bikes',
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

/** Scroll to a #hash target once the page has rendered (e.g. /#services). */
function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
}

export function RegionLanding({ regionName }: { regionName: string }) {
  // One page view per region, so the 36 area pages can be judged on the work
  // they actually bring rather than on faith.
  useEffect(() => {
    startTelemetry();
    setTelemetryRegion(regionName);
    track('page_view');
  }, [regionName]);

  const seo = useMemo(() => regionSeo(regionName), [regionName]);
  usePageSeo(seo);
  useHashScroll();

  const isHome = regionName === HOME_REGION;

  return (
    <MetricsProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-950 selection:bg-yellow-400 selection:text-neutral-950">
        <UrgencyBar regionName={regionName} />
        <Header regionName={regionName} />
        <main>
          <Hero
            regionName={regionName}
            eyebrow="Stuck? We've got you."
            headline={['CAR RECOVERY', `${regionName.toUpperCase()}.`]}
            breadcrumb={isHome ? undefined : `Car Recovery ${regionName}`}
            lines={[
              <>
                Typically with you in <span className="text-red-600 font-black">30 minutes</span> or
                less
              </>,
              <>
                Your price on screen{' '}
                <span className="text-red-600 font-black">before you book</span>
              </>,
              <>
                <span className="text-red-600 font-black">Track your driver</span> live to your door
                in {regionName}
              </>,
            ]}
          />
          <TrustBar />
          <DispatchTicker />
          <HowItWorks />
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
