// The telemetry view inside /admin.
//
// Built around the four questions the operator actually has, in this order:
// where do people give up, which of the 36 area pages are worth their SEO
// effort, do more people ring than book, and does having a driver on duty win
// the job. Everything else is noise on a dashboard nobody then reads.

import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../api';

interface CountRow {
  label: string;
  count: number;
}

interface FunnelStep {
  name: string;
  label: string;
  sessions: number;
  pctOfEntry: number;
}

export interface TelemetrySummary {
  days: number;
  sessions: number;
  events: number;
  bookings: number;
  callClicks: number;
  funnel: FunnelStep[];
  topRegions: CountRow[];
  services: CountRow[];
  devices: CountRow[];
  referrers: CountRow[];
  daily: CountRow[];
  quotesShown: number;
  avgQuote: number | null;
  availabilityAtQuote: CountRow[];
}

const RANGES = [7, 30, 90] as const;

const SERVICE_LABELS: Record<string, string> = {
  towing: 'Broke down (tow)',
  tow: 'Just needs a tow',
  jumpstart: 'Jump start',
  tyre: 'Flat tyre',
  fuel: 'Out of fuel',
  ev: 'Electric car',
  motorbike: 'Motorbike',
  other: 'Not sure / other',
};

export function TelemetryPanel({ apiKey }: { apiKey: string }) {
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/telemetry?days=${days}`, {
        headers: { 'x-api-key': apiKey },
      });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as TelemetrySummary);
      setError(null);
    } catch {
      setError('Could not load telemetry.');
    }
  }, [apiKey, days]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (error) {
    return (
      <p
        role="alert"
        className="border-2 border-[var(--color-danger-soft)] text-[var(--color-danger-soft)] px-4 py-3 text-sm font-bold"
      >
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="text-neutral-500 text-sm px-1 py-6">Loading telemetry…</p>;
  }

  const noData = data.events === 0;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-display text-xl uppercase tracking-tight text-white">Telemetry</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wider border-2 ${
                days === r
                  ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {noData && (
        <p className="border-2 border-neutral-800 bg-neutral-900 px-4 py-6 text-center text-sm text-neutral-400">
          No events recorded yet in this window. Visit the site and the funnel fills in.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-neutral-800 border-2 border-neutral-800">
        <Stat label="Visits" value={data.sessions} />
        <Stat label="Prices shown" value={data.quotesShown} />
        <Stat label="Bookings" value={data.bookings} />
        <Stat label="Called instead" value={data.callClicks} />
        <Stat
          label="Average quote"
          value={data.avgQuote !== null ? `£${Math.round(data.avgQuote)}` : '—'}
        />
      </div>

      <Funnel steps={data.funnel} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Bars
          title="Areas"
          hint="Visits per area page — which of the 36 earn their keep."
          rows={data.topRegions}
        />
        <Bars
          title="What they need"
          hint="Service chosen when a price was shown."
          rows={data.services.map((r) => ({
            label: SERVICE_LABELS[r.label] ?? r.label,
            count: r.count,
          }))}
        />
        <Bars
          title="Driver on duty when quoted"
          hint="Does having someone on actually win the work?"
          rows={data.availabilityAtQuote}
        />
        <Bars title="How they arrived" hint="Referring site." rows={data.referrers} />
        <Bars title="Device" rows={data.devices} />
        <Bars title="Visits per day" rows={data.daily} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-neutral-950 px-4 py-4">
      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
        {label}
      </div>
      <div className="font-display text-3xl text-yellow-400 leading-none mt-1.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.sessions ?? 0;
  return (
    <div className="border-2 border-neutral-800 bg-neutral-900 p-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500 mb-1">
        Booking funnel
      </h3>
      <p className="text-[11px] text-neutral-500 mb-4">
        Counted in visits, not clicks. The biggest drop is where to spend your next hour.
      </p>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].sessions : step.sessions;
          const lost = prev - step.sessions;
          // The worst drop in the funnel, highlighted — it is the only number
          // on this panel that tells you what to do next.
          const biggestDrop =
            i > 0 &&
            lost > 0 &&
            lost === Math.max(...steps.slice(1).map((x, j) => steps[j].sessions - x.sessions));
          return (
            <li key={step.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={biggestDrop ? 'text-[var(--color-danger-soft)] font-bold' : ''}>
                  {step.label}
                </span>
                <span className="tabular-nums text-neutral-400 shrink-0">
                  <strong className="text-white">{step.sessions}</strong>
                  <span className="text-neutral-600"> · {step.pctOfEntry}%</span>
                </span>
              </div>
              <div className="h-2 bg-neutral-950 mt-1.5 border border-neutral-800">
                <div
                  className={
                    biggestDrop ? 'h-full bg-[var(--color-danger)]' : 'h-full bg-yellow-400'
                  }
                  style={{ width: `${top ? (step.sessions / top) * 100 : 0}%` }}
                />
              </div>
              {i > 0 && lost > 0 && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  {lost} gave up here{biggestDrop ? ' — the biggest drop' : ''}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Bars({ title, hint, rows }: { title: string; hint?: string; rows: CountRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="border-2 border-neutral-800 bg-neutral-900 p-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
        {title}
      </h3>
      {hint && <p className="text-[11px] text-neutral-500 mt-1 mb-3">{hint}</p>}
      {rows.length === 0 ? (
        <p className="text-neutral-600 text-sm py-3">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 mt-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="text-sm truncate">{r.label}</div>
                <div className="h-1.5 bg-neutral-950 mt-1 border border-neutral-800">
                  <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </div>
              <span className="tabular-nums text-sm text-neutral-300">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
