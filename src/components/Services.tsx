import { ArrowRight, PhoneCall } from '../icons';
import { PHONE_TEL } from '../config';
import { FEATURED_SERVICES, GRID_SERVICES } from '../data';
import { scrollToBooking } from '../ui';
import { Reveal } from './motion';

export function FeaturedServices({ regionName }: { regionName: string }) {
  return (
    <section className="py-20 px-4 bg-slate-50" aria-labelledby="services-heading">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <div className="text-xs font-black tracking-[0.3em] uppercase text-red-600 mb-3">
            What we offer
          </div>
          <h2
            id="services-heading"
            className="font-display text-3xl md:text-5xl text-slate-950 mb-6 tracking-tight uppercase"
          >
            Premium Recovery Services
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            We don't just tow cars. We provide a comprehensive suite of professional recovery and
            transport solutions in {regionName}.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURED_SERVICES.map((service, i) => {
            return (
              <Reveal key={service.title} delay={i * 0.1} className="h-full">
                {service.featured ? (
                  <div className="h-full bg-neutral-950 text-white rounded-none ring-1 ring-neutral-950 transition-all duration-300 group relative overflow-hidden transform md:-translate-y-4 shadow-[10px_10px_0_0_#f5c518] hover:shadow-[16px_16px_0_0_#f5c518] hover:-translate-y-6 flex flex-col">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={service.image}
                        alt={service.imageAlt}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 saturate-150 brightness-90"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-yellow-400/20 mix-blend-multiply"></div>
                      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-transparent to-transparent"></div>
                      <div className="absolute top-3 right-3 bg-yellow-400 text-neutral-950 text-xs font-black px-3 py-1 rounded-none uppercase tracking-wider">
                        Most Popular
                      </div>
                    </div>
                    <div className="p-6 pt-5">
                      <h3 className="font-display text-xl mb-3 tracking-tight uppercase">
                        {service.title}
                      </h3>
                      <p className="text-neutral-300 font-medium mb-6 leading-relaxed text-sm">
                        {service.body}
                      </p>
                      <button
                        type="button"
                        onClick={scrollToBooking}
                        className="text-yellow-400 font-bold flex items-center gap-2 hover:gap-3 hover:text-yellow-300 text-sm uppercase tracking-wider transition-all"
                      >
                        {service.cta} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full bg-white rounded-none ring-2 ring-slate-200 hover:ring-neutral-950 hover:-translate-y-1.5 transition-all duration-300 group relative overflow-hidden flex flex-col">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={service.image}
                        alt={service.imageAlt}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                    </div>
                    <div className="p-6 pt-5">
                      <h3 className="font-display text-xl mb-3 tracking-tight uppercase text-slate-950">
                        {service.title}
                      </h3>
                      <p className="text-slate-600 font-medium mb-6 leading-relaxed text-sm">
                        {service.body}
                      </p>
                      <button
                        type="button"
                        onClick={scrollToBooking}
                        className="text-slate-950 font-bold flex items-center gap-2 hover:gap-3 text-sm uppercase tracking-wider transition-all"
                      >
                        {service.cta} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ServicesGrid() {
  return (
    <section
      id="services"
      className="py-20 px-4 bg-white border-t border-slate-100"
      aria-labelledby="services-grid-heading"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2
            id="services-grid-heading"
            className="font-display text-2xl md:text-4xl text-center mb-12 tracking-tight uppercase"
          >
            Comprehensive Roadside Assistance
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {GRID_SERVICES.map((service, i) => (
            <Reveal key={service.name} delay={Math.min(i * 0.04, 0.4)} className="h-full">
              <button
                type="button"
                onClick={scrollToBooking}
                className="group relative w-full h-32 sm:h-40 rounded-none overflow-hidden border-2 border-slate-200 hover:border-yellow-400 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#141414] transition-all duration-200 text-left cursor-pointer"
              >
                <img
                  src={service.image}
                  alt={service.imageAlt}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/45 to-transparent"></div>
                <div className="absolute top-0 left-0 h-1.5 w-0 bg-yellow-400 group-hover:w-full transition-all duration-300"></div>
                <h3 className="absolute bottom-0 left-0 right-0 p-3 font-display text-white text-sm sm:text-base uppercase tracking-tight leading-tight group-hover:text-yellow-400 transition-colors">
                  {service.name}
                </h3>
              </button>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 text-center">
          <a
            href={`tel:${PHONE_TEL}`}
            className="sheen inline-flex bg-yellow-400 hover:bg-yellow-300 text-neutral-950 px-8 py-4 rounded-none font-display uppercase tracking-wider transition-all items-center gap-3 shadow-[6px_6px_0_0_#0a0a0a] hover:shadow-[4px_4px_0_0_#0a0a0a] hover:translate-x-0.5 hover:translate-y-0.5"
          >
            <PhoneCall className="w-5 h-5" />
            Book any service now
          </a>
        </div>
      </div>
    </section>
  );
}
