// The prices page. Every figure comes from src/pricing.ts via pricingContent,
// so nothing here can drift from what the booking form charges. Competitors'
// pricing pages say "compare quotes" and show no numbers; this one shows all
// of them, which is the point.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from '../icons';
import { HOME_REGION } from '../config';
import { Footer, Header, MobileCta, UrgencyBar } from '../components/Layout';
import { Reveal } from '../components/motion';
import { FaqSection } from '../components/FaqSection';
import { pricingSeo, usePageSeo } from '../seo';
import { EXAMPLES, FROM_PRICE, NIGHT_PERCENT, PRICING_FAQ, TARIFF } from '../pricingContent';
import { setTelemetryRegion } from '../telemetry';

const seo = pricingSeo();

export function PricingPage() {
  useEffect(() => {
    setTelemetryRegion(undefined);
    window.scrollTo(0, 0);
  }, []);
  usePageSeo(seo);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950 selection:bg-yellow-400 selection:text-neutral-950">
      <UrgencyBar regionName={HOME_REGION} />
      <Header regionName={HOME_REGION} bookTo="/" />
      <main>
        <section className="bg-white border-b border-slate-200 py-12 sm:py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-xs font-black tracking-[0.3em] uppercase text-red-600 mb-3">
              Prices
            </div>
            <h1 className="font-display text-5xl sm:text-7xl tracking-tight leading-none">
              WHAT IT COSTS.
              <br />
              <span className="inline-block mt-2 px-3 pt-1 pb-1.5 bg-yellow-400 text-neutral-950">
                ALL OF IT.
              </span>
            </h1>
            <p className="text-lg text-slate-600 font-medium mt-6">
              Recovery from £{FROM_PRICE}. Tows are a callout plus the miles, roadside fixes are a
              flat fee, and the exact figure for your job is on the booking form before you give us
              a phone number.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display px-8 py-4 uppercase tracking-wider text-lg shadow-md hover:shadow-lg"
            >
              Get your price <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4" aria-labelledby="tariff-heading">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <h2
                id="tariff-heading"
                className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight mb-6"
              >
                The tariff
              </h2>
              <div className="overflow-x-auto border-2 border-slate-950 bg-white">
                <table className="w-full text-sm sm:text-base">
                  <thead>
                    <tr className="bg-neutral-950 text-white text-left text-[11px] uppercase tracking-[0.15em]">
                      <th className="p-4 font-bold">Item</th>
                      <th className="p-4 font-bold whitespace-nowrap">Price</th>
                      <th className="p-4 font-bold hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TARIFF.map((row) => (
                      <tr key={row.item} className="border-t-2 border-slate-100 align-top">
                        <td className="p-4 font-bold">
                          {row.item}
                          <span className="block sm:hidden text-xs font-medium text-slate-500 mt-1">
                            {row.note}
                          </span>
                        </td>
                        <td className="p-4 font-display text-xl text-navy-700 whitespace-nowrap">
                          {row.price}
                        </td>
                        <td className="p-4 text-slate-600 font-medium hidden sm:table-cell">
                          {row.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="py-12 sm:py-16 px-4 bg-navy-900 text-white"
          aria-labelledby="examples-heading"
        >
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center max-w-3xl mx-auto mb-10">
              <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-3">
                Worked examples
              </div>
              <h2
                id="examples-heading"
                className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight"
              >
                What real jobs come to
              </h2>
              <p className="text-blue-100 font-medium mt-4">
                Calculated with the same formula the booking form uses, rounded to the nearest £5.
              </p>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EXAMPLES.map((ex, i) => (
                <Reveal key={ex.title} delay={i * 0.06} className="h-full">
                  <div className="h-full bg-navy-800 border border-white/10 p-5 flex flex-col">
                    <div className="font-sans font-extrabold text-lg tracking-tight">
                      {ex.title}
                    </div>
                    <p className="text-blue-200 text-sm font-medium mt-1 flex-1">{ex.detail}</p>
                    <div className="font-display text-4xl text-yellow-400 mt-4">£{ex.price}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 bg-white" aria-labelledby="rules-heading">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <h2
                id="rules-heading"
                className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight mb-6"
              >
                How the price is built
              </h2>
              <ul className="space-y-3">
                {[
                  'The form works out the real driving route for your pickup and drop-off, not a straight line, and prices the loaded miles from that.',
                  'The callout covers the truck coming out to you and the first eight miles of that run. Beyond that the empty miles are charged, which is why a job on the far edge of the patch costs a little more.',
                  `Nights, 22:00 to 06:00, add ${NIGHT_PERCENT}% to the whole job. Weekends and bank holidays are charged at the daytime rate.`,
                  'A motorway or hard-shoulder pickup adds a fixed surcharge, shown the moment a motorway is detected in your location.',
                  'Nothing is added afterwards. Card or cash to the driver when the job is done, and nothing to pay if you cancel before the driver is on scene.',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-neutral-950 shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <FaqSection
          regionName={HOME_REGION}
          items={PRICING_FAQ}
          title="Pricing questions"
          intro="What people ask before they book."
        />

        <section className="py-14 px-4 bg-navy-900 text-center">
          <h2 className="font-display text-4xl md:text-5xl text-white tracking-tight">
            See your price in a minute.
          </h2>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display px-8 py-4 uppercase tracking-wider text-lg shadow-md hover:shadow-lg"
          >
            Get your price <ArrowRight className="w-5 h-5" />
          </Link>
        </section>
      </main>
      <Footer regionName={HOME_REGION} />
      <MobileCta bookTo="/" />
    </div>
  );
}
