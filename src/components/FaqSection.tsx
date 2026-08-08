import { HelpCircle, ChevronDown, PhoneCall } from '../icons';
import { PHONE_TEL, PHONE_DISPLAY } from '../config';
import { buildFaqItems } from '../data';
import { Reveal } from './motion';

export function FaqSection({ regionName }: { regionName: string }) {
  const items = buildFaqItems(regionName);
  return (
    <section
      className="bg-white border-t border-slate-200 py-12 sm:py-20 px-4"
      aria-labelledby="faq-heading"
    >
      <div className="max-w-3xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-red-600 mb-3">
            Frequently Asked
          </div>
          <h2
            id="faq-heading"
            className="font-sans font-extrabold text-3xl md:text-5xl text-slate-950 tracking-tight"
          >
            {regionName} Recovery FAQs
          </h2>
          <p className="text-slate-600 mt-4 font-medium">
            Everything you need to know about our breakdown service in {regionName}.
          </p>
        </Reveal>

        <div className="space-y-3">
          {items.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i * 0.06, 0.3)}>
              <details className="group bg-slate-50 border-2 border-slate-200 hover:border-yellow-400 transition-colors">
                <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer list-none font-sans font-bold text-base md:text-lg tracking-tight text-slate-950">
                  <span className="flex items-start gap-3">
                    <HelpCircle
                      className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <h3 className="font-sans font-bold tracking-tight">{item.q}</h3>
                  </span>
                  <ChevronDown
                    className="w-5 h-5 text-red-600 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="px-5 pb-5 pt-0 text-slate-700 leading-relaxed text-base border-t border-slate-200">
                  <p className="pt-4">{item.a}</p>
                </div>
              </details>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="text-slate-600 mb-4">Still got a question?</p>
          <a
            href={`tel:${PHONE_TEL}`}
            className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 font-display uppercase tracking-wider"
            aria-label={`Call us on ${PHONE_DISPLAY}`}
          >
            <PhoneCall className="w-5 h-5" /> Call {PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  );
}
