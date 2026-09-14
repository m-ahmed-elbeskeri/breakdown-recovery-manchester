// A service page: /jump-start-near-me, /tow-truck-near-me and friends. Same
// booking form as the area pages with the service preselected, then copy that
// answers the specific question someone typed into Google.

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from '../icons';
import { HOME_REGION } from '../config';
import { Hero } from '../components/Hero';
import {
  Coverage,
  DriverStrip,
  FinalCta,
  Footer,
  Header,
  MobileCta,
  TrustBar,
  UrgencyBar,
} from '../components/Layout';
import { Reveal } from '../components/motion';
import { FaqSection } from '../components/FaqSection';
import { MetricsProvider } from '../metrics';
import { serviceSeo, usePageSeo } from '../seo';
import { SERVICE_PAGES, servicePath, type ServicePage as ServicePageData } from '../services';
import { PRICING_PATH } from '../routes';
import { setTelemetryRegion, startTelemetry, track } from '../telemetry';

export function ServicePage({ page }: { page: ServicePageData }) {
  useEffect(() => {
    startTelemetry();
    // Not an area, so it must not show up in the "which area pages earn their
    // keep" chart. The path already says which service page it was.
    setTelemetryRegion(undefined);
    track('page_view');
  }, [page.slug]);

  const seo = useMemo(() => serviceSeo(page), [page]);
  usePageSeo(seo);

  const related = SERVICE_PAGES.filter((p) => p.slug !== page.slug).slice(0, 4);

  return (
    <MetricsProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-950 selection:bg-yellow-400 selection:text-neutral-950">
        <UrgencyBar regionName={HOME_REGION} />
        <Header regionName={HOME_REGION} />
        <main>
          <Hero
            regionName={HOME_REGION}
            eyebrow={page.eyebrow}
            headline={page.headline}
            intro={page.intro}
            breadcrumb={page.name}
            defaultService={page.service}
            lines={[
              <>
                From <span className="text-red-600 font-black">£{page.fromPrice}</span>, shown
                before you book
              </>,
              <>
                <span className="text-red-600 font-black">24/7</span> across Greater Manchester
              </>,
              <>
                <span className="text-red-600 font-black">Track your driver</span> live to your door
              </>,
            ]}
          />
          <TrustBar />

          <section className="py-12 sm:py-20 px-4 bg-white" aria-labelledby="steps-heading">
            <div className="max-w-6xl mx-auto">
              <Reveal className="text-center max-w-3xl mx-auto mb-10">
                <div className="text-xs font-black tracking-[0.3em] uppercase text-red-600 mb-3">
                  What happens
                </div>
                <h2
                  id="steps-heading"
                  className="font-sans font-extrabold text-3xl md:text-5xl tracking-tight"
                >
                  {page.name}, step by step
                </h2>
                <p className="lg:hidden text-slate-600 font-medium mt-4">{page.intro}</p>
              </Reveal>
              <ol className="grid md:grid-cols-3 gap-6">
                {page.steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 0.1} className="h-full">
                    <li className="h-full bg-slate-50 border-2 border-slate-200 p-6">
                      <span className="inline-flex w-10 h-10 bg-neutral-950 text-yellow-400 font-display text-xl items-center justify-center mb-4">
                        {i + 1}
                      </span>
                      <h3 className="font-sans font-extrabold text-xl tracking-tight mb-2">
                        {step.title}
                      </h3>
                      <p className="text-slate-600 font-medium text-sm leading-relaxed">
                        {step.body}
                      </p>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </section>

          <section className="py-12 sm:py-20 px-4 bg-navy-900 text-white">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-start">
              <Reveal>
                <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-3">
                  What's included
                </div>
                <h2 className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight mb-6">
                  Everything the callout covers
                </h2>
                <ul className="space-y-3">
                  {page.included.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-blue-50 font-medium">
                      <CheckCircle2 className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="bg-navy-800 border-2 border-yellow-400 p-6 sm:p-8">
                  <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-2">
                    Price
                  </div>
                  <div className="font-display text-5xl sm:text-6xl text-white leading-none">
                    From £{page.fromPrice}
                  </div>
                  <p className="text-blue-100 font-medium mt-4 leading-relaxed">{page.priceNote}</p>
                  <Link
                    to={PRICING_PATH}
                    className="mt-6 inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 font-bold uppercase tracking-wider text-sm"
                  >
                    See the full tariff <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>

          <Reveal>
            <section className="py-12 sm:py-16 px-4 max-w-3xl mx-auto">
              {page.body.map((paragraph, i) => (
                <p key={i} className="text-slate-700 font-medium leading-relaxed mb-5 text-base">
                  {paragraph}
                </p>
              ))}
            </section>
          </Reveal>

          <FaqSection
            regionName={HOME_REGION}
            items={page.faq}
            title={`${page.name} questions`}
            intro="Straight answers, in the order people ask them."
          />

          <section className="py-10 px-4 bg-slate-50 border-t border-slate-200">
            <div className="max-w-6xl mx-auto">
              <h2 className="font-sans font-extrabold text-xl tracking-tight mb-4">
                Something else?
              </h2>
              <div className="flex flex-wrap gap-3">
                {related.map((p) => (
                  <Link
                    key={p.slug}
                    to={servicePath(p)}
                    className="bg-white border-2 border-slate-200 hover:border-yellow-400 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-700 hover:text-slate-950 transition-colors"
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <Coverage />
          <FinalCta regionName={HOME_REGION} />
          <DriverStrip />
        </main>
        <Footer regionName={HOME_REGION} />
        <MobileCta />
      </div>
    </MetricsProvider>
  );
}
