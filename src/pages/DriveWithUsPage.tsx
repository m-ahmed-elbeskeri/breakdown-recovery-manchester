// "Drive with us": the public page for recovery drivers who want work.
// Prerendered like every other public page, so it can be found by people
// searching for recovery driver jobs in Manchester.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from '../icons';
import { HOME_REGION } from '../config';
import { Footer, Header, UrgencyBar } from '../components/Layout';
import { Reveal } from '../components/motion';
import { FaqSection } from '../components/FaqSection';
import { recruitSeo, usePageSeo } from '../seo';
import {
  APPLY_PATH,
  DOCUMENT_GROUPS,
  RECRUIT_FAQ,
  RECRUIT_STEPS,
  REQUIREMENTS,
} from '../recruitContent';
import { setTelemetryRegion } from '../telemetry';

const seo = recruitSeo();

function ApplyButton({ className = '' }: { className?: string }) {
  return (
    <Link
      to={APPLY_PATH}
      data-track="recruit-apply"
      className={`inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-display px-8 py-4 uppercase tracking-wider text-lg shadow-md hover:shadow-lg ${className}`}
    >
      Apply to drive <ArrowRight className="w-5 h-5" />
    </Link>
  );
}

export function DriveWithUsPage() {
  useEffect(() => {
    setTelemetryRegion(undefined);
  }, []);
  usePageSeo(seo);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950 selection:bg-yellow-400 selection:text-neutral-950">
      <UrgencyBar regionName={HOME_REGION} />
      <Header regionName={HOME_REGION} bookTo="/" />
      <main>
        <section className="bg-neutral-950 text-white border-b-4 border-yellow-400 py-12 sm:py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-xs font-black tracking-[0.3em] uppercase text-yellow-400 mb-3">
              Recovery driver jobs · Greater Manchester
            </div>
            <h1 className="font-display text-5xl sm:text-7xl tracking-tight leading-none">
              DRIVE WITH US.
              <br />
              <span className="inline-block mt-2 px-3 pt-1 pb-1.5 bg-yellow-400 text-neutral-950">
                YOUR HOURS.
              </span>
            </h1>
            <p className="text-lg text-neutral-300 font-medium mt-6">
              Jobs come to your phone with the pickup, the drop-off and the price already worked
              out. Go on duty when you want to work, and take the jobs that suit you.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <ApplyButton />
              <Link
                to="/login"
                className="text-sm font-bold uppercase tracking-wider text-neutral-300 hover:text-yellow-400 underline"
              >
                Already applied? Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 bg-white" aria-labelledby="steps-heading">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center max-w-3xl mx-auto mb-10">
              <h2
                id="steps-heading"
                className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight"
              >
                How applying works
              </h2>
              <p className="text-slate-600 font-medium mt-4">
                All of it on your phone. No forms to post, no office visit.
              </p>
            </Reveal>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {RECRUIT_STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.06} className="h-full">
                  <li className="h-full bg-slate-50 border-2 border-slate-200 p-5 flex flex-col gap-3">
                    <span className="w-10 h-10 bg-neutral-950 text-yellow-400 font-display text-xl flex items-center justify-center">
                      {i + 1}
                    </span>
                    <h3 className="font-sans font-extrabold text-lg tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed">
                      {step.body}
                    </p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4" aria-labelledby="needs-heading">
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-10">
            <Reveal>
              <h2
                id="needs-heading"
                className="font-sans font-extrabold text-3xl tracking-tight mb-6"
              >
                What you need
              </h2>
              <ul className="space-y-3">
                {REQUIREMENTS.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-neutral-950 shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="font-sans font-extrabold text-3xl tracking-tight mb-6">
                Documents you'll upload
              </h2>
              <div className="flex flex-col gap-5">
                {DOCUMENT_GROUPS.map((group) => (
                  <div key={group.heading}>
                    <h3 className="text-xs font-black tracking-[0.2em] uppercase text-red-600 mb-2">
                      {group.heading}
                    </h3>
                    <ul className="text-slate-700 font-medium text-sm space-y-1.5">
                      {group.labels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 bg-navy-900 text-white">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <h2 className="font-sans font-extrabold text-3xl md:text-4xl tracking-tight mb-6">
                Why we check so much
              </h2>
              <p className="text-blue-100 font-medium leading-relaxed">
                Customers book us at the side of the road, often at night, and hand their car to
                whoever turns up. They see your name, your photo and your registration before you
                arrive. Checking every driver properly is what lets them trust that, and it is what
                keeps the work coming.
              </p>
            </Reveal>
          </div>
        </section>

        <FaqSection
          regionName={HOME_REGION}
          items={RECRUIT_FAQ}
          title="Driver questions"
          intro="What drivers ask before they apply."
        />

        <section className="py-14 px-4 bg-neutral-950 text-center">
          <h2 className="font-display text-4xl md:text-5xl text-white tracking-tight">
            Start your application.
          </h2>
          <p className="text-neutral-400 font-medium mt-4">
            It saves as you go, so you can finish it tonight.
          </p>
          <ApplyButton className="mt-8" />
        </section>
      </main>
      <Footer regionName={HOME_REGION} />
    </div>
  );
}
