import { Quote } from '../icons';
import { TESTIMONIALS } from '../data';
import { Reveal } from './motion';

export function Testimonials() {
  return (
    <section
      className="bg-slate-50 border-t border-slate-200 py-12 sm:py-20 px-4"
      aria-labelledby="testimonials-heading"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-slate-950 mb-3">
            What a callout looks like
          </div>
          <h2
            id="testimonials-heading"
            className="font-sans font-extrabold text-3xl md:text-5xl text-slate-950 tracking-tight"
          >
            Recovery across <span className="text-slate-950">Greater Manchester</span>
          </h2>
          <p className="mt-4 text-sm text-slate-600 font-medium max-w-xl mx-auto">
            Illustrative examples of the breakdowns we handle day and night. Names and photos are
            representative, not verified customer reviews.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.12} className="h-full">
              <figure className="h-full bg-white p-7 ring-1 ring-slate-200 shadow-sm hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300 flex flex-col gap-5">
                <Quote className="w-8 h-8 text-slate-950 shrink-0" aria-hidden="true" />
                <blockquote className="text-slate-700 font-medium leading-relaxed">
                  "{t.quote}"
                </blockquote>
                <figcaption className="flex items-center gap-3 mt-auto pt-5 border-t border-slate-100">
                  <img
                    src={t.photo}
                    alt={`${t.name} from ${t.area}`}
                    loading="lazy"
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-slate-200"
                  />
                  <div>
                    <div className="font-display text-base text-slate-950 uppercase tracking-tight">
                      {t.name}
                    </div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                      {t.area} <span className="text-slate-300 mx-1">·</span> {t.service}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
