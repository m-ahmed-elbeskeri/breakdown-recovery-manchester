// Site analytics for the office: who comes, where from, what they do, and
// whether it turns into bookings and calls. The live panel refreshes every 15
// seconds and the rest every minute.
//
// Everything is anonymous. A "visit" is one browser tab: nothing here can tell
// that two visits were the same person, and nothing needs to.

import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Loader2 } from '../../icons';
import {
  fetchAnalytics,
  fetchLive,
  type Analytics,
  type CountRow,
  type FunnelStep,
  type Kpis,
  type LiveData,
  type OutcomeRow,
  type PageRow,
  type SeriesPoint,
  type Vital,
} from '../../analyticsApi';
import { Banner, Chip, ErrorNotice, Loading } from '../../components/console';
import { serviceLabel } from '../../data';

const RANGES = [
  { days: 1, label: '24 hours', compared: 'the 24 hours before' },
  { days: 7, label: '7 days', compared: 'the week before' },
  { days: 30, label: '30 days', compared: 'the 30 days before' },
  { days: 90, label: '90 days', compared: 'the 90 days before' },
  { days: 365, label: '12 months', compared: 'the year before' },
];

type KpiKind = 'count' | 'rate' | 'seconds';

const KPI_CARDS: {
  key: keyof Kpis;
  label: string;
  kind: KpiKind;
  hint: string;
  lowerIsBetter?: boolean;
}[] = [
  { key: 'visitors', label: 'Visits', kind: 'count', hint: 'Visits to the site. One visit is one browser tab.' },
  { key: 'pageViews', label: 'Page views', kind: 'count', hint: 'Pages opened across all visits.' },
  { key: 'bookings', label: 'Online bookings', kind: 'count', hint: 'Bookings made through the site.' },
  { key: 'conversionRate', label: 'Visits that booked', kind: 'rate', hint: 'Share of visits that ended in a booking.' },
  { key: 'calls', label: 'Call taps', kind: 'count', hint: 'Taps on a phone number. Whether the call connected is not known.' },
  { key: 'avgEngagedSeconds', label: 'Time on site', kind: 'seconds', hint: 'Average time the site was actually on screen, per visit.' },
  { key: 'bounceRate', label: 'Left straight away', kind: 'rate', lowerIsBetter: true, hint: 'Visits that saw one page and pressed nothing.' },
  { key: 'driverSignups', label: 'Driver sign-ups', kind: 'count', hint: 'New driver accounts created.' },
];

const EVENT_LABEL: Record<string, string> = {
  page_view: 'Opened a page',
  page_engagement: 'Left a page',
  link_clicked: 'Followed a link',
  cta_clicked: 'Pressed a button',
  outbound_clicked: 'Went to another site',
  email_clicked: 'Tapped the email address',
  call_clicked: 'Tapped to call',
  faq_opened: 'Opened a question',
  booking_started: 'Started a booking',
  details_done: 'Gave a phone number',
  service_chosen: 'Chose a service',
  quote_shown: 'Saw a price',
  dispatch_requested: 'Pressed dispatch',
  booking_confirmed: 'Booked',
  form_error: 'Hit a form error',
  find_me_used: 'Used Find Me',
  track_viewed: 'Opened their tracking page',
  track_cancelled: 'Cancelled online',
  track_rated: 'Rated a job',
  install_prompted: 'Was offered the app',
  js_error: 'Hit a page error',
};

const VITAL_INFO: Record<
  string,
  { label: string; metric: string; unit: 'ms' | 'score'; good: number; poor: number }
> = {
  lcp: { label: 'Main content shown', metric: 'Largest Contentful Paint', unit: 'ms', good: 2500, poor: 4000 },
  inp: { label: 'Reacting to taps', metric: 'Interaction to Next Paint', unit: 'ms', good: 200, poor: 500 },
  cls: { label: 'Layout jumping about', metric: 'Cumulative Layout Shift', unit: 'score', good: 0.1, poor: 0.25 },
  fcp: { label: 'First thing on screen', metric: 'First Contentful Paint', unit: 'ms', good: 1800, poor: 3000 },
  ttfb: { label: 'Server response', metric: 'Time to First Byte', unit: 'ms', good: 800, poor: 1800 },
};

const GOOD = 'text-[var(--color-success)]';
const BAD = 'text-[var(--color-danger-soft)]';

const fmtInt = (n: number): string => n.toLocaleString('en-GB');

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function fmtKpi(value: number | null, kind: KpiKind): string {
  if (value === null) return '–';
  if (kind === 'rate') return `${value.toFixed(1)}%`;
  if (kind === 'seconds') return fmtDuration(value);
  return fmtInt(value);
}

function pageName(path: string): string {
  if (path === '/') return 'Homepage';
  if (path === '/track') return 'Tracking page';
  return path;
}

function pointLabel(label: string, hourly: boolean): string {
  if (hourly) return label.slice(11, 16);
  const date = new Date(`${label}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? label
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function niceCeil(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n));
  const f = n / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAnalytics(days));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const range = RANGES.find((r) => r.days === days) ?? RANGES[2];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-white uppercase tracking-tight">Analytics</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Anonymous and cookie-free. Bots, and browsers that have signed in to the admin or
            driver app, are not counted.
            {data &&
              ` Updated ${new Date(data.generatedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-500 mr-2" />}
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wider border-2 ${
                days === r.days
                  ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <LivePanel />

      <ErrorNotice error={error} />

      {!data ? (
        !error && <Loading />
      ) : (
        <>
          {data.current.visitors === 0 && (
            <Banner tone="neutral" title="No visits recorded in this period yet">
              Numbers appear here as people use the site.
            </Banner>
          )}

          <KpiGrid current={data.current} previous={data.previous} compared={range.compared} />

          <TrendChart series={data.series} hourly={data.hourly} />

          <div className="grid lg:grid-cols-2 gap-6">
            <Funnel
              title="Booking funnel"
              hint="Visits reaching each step. The biggest drop is where to spend your next hour."
              steps={data.bookingFunnel}
            />
            <Funnel
              title="Driver recruitment"
              hint="Page visits from the site, then sign-ups, applications and approvals from your records."
              steps={data.recruitFunnel}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <DataTable
              title="Where visits come from"
              hint="The website, search engine or advert tag that brought each visit."
              columns={outcomeColumns('Source')}
              rows={data.sources}
              empty="No visits yet."
            />
            <DataTable
              title="Advert campaigns"
              hint="Visits from links tagged with utm_campaign."
              columns={outcomeColumns('Campaign')}
              rows={data.campaigns}
              empty="No tagged advert traffic yet. Add ?utm_source=facebook&utm_campaign=september to the link in an advert, and its visits, bookings and calls show here."
            />
          </div>

          <DataTable
            title="Pages"
            hint="Most viewed first. Time is how long the page was actually on screen."
            columns={PAGE_COLUMNS}
            rows={data.pages}
            empty="No page views yet."
          />

          <div className="grid lg:grid-cols-2 gap-6">
            <DataTable
              title="First page of each visit"
              hint="Which pages bring people in, and whether those visits book or call."
              columns={outcomeColumns('Page', (row) => pageName(row.label))}
              rows={data.landingPages}
              empty="No visits yet."
            />
            <DataTable
              title="Areas"
              hint="Visits to each area page, and the bookings and calls they led to."
              columns={outcomeColumns('Area')}
              rows={data.areas}
              empty="No area page visits yet."
            />
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            <Bars
              title="What they need"
              hint={
                data.current.quotes
                  ? `${fmtInt(data.current.quotes)} prices shown${
                      data.current.avgQuote !== null
                        ? `, averaging £${Math.round(data.current.avgQuote)}`
                        : ''
                    }.`
                  : 'Service chosen when a price was shown.'
              }
              rows={data.services}
              format={serviceLabel}
            />
            <Bars
              title="Driver on duty when quoted"
              hint="Does having someone on duty win the job?"
              rows={data.availabilityAtQuote}
            />
            <Bars title="Call buttons" hint="Which phone number people tapped." rows={data.callPlacements} />
            <Bars title="Buttons pressed" rows={data.ctaClicks} />
            <Bars title="Links followed" hint="Pages people moved on to." rows={data.linkClicks} format={pageName} />
            <Bars title="Questions opened" hint="FAQ answers people read." rows={data.faqs} />
            <Bars title="Devices" rows={data.devices} />
            <Bars title="Browsers" hint="In-app browsers are where social media adverts open." rows={data.browsers} />
            <Bars title="Screen size" rows={data.screens} />
            <Bars title="Went to another site" rows={data.outbound} />
            <Bars title="Find Me" hint="Customers who let their phone find them." rows={data.findMe} />
            <TrackingPanel data={data} />
          </div>

          <VitalsPanel vitals={data.vitals} />

          <Panel
            title="Page errors"
            hint="Something broke in a visitor's browser. A handful is normal; a jump after a release is not."
          >
            {data.errorCount === 0 ? (
              <p className="text-sm text-neutral-500">No page errors recorded.</p>
            ) : (
              <>
                <p className="text-sm text-white mb-3">
                  {fmtInt(data.errorCount)} error{data.errorCount === 1 ? '' : 's'} in this period.
                </p>
                <BarList rows={data.errors} format={pageName} />
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-2 border-neutral-800 bg-neutral-900 p-4 min-w-0">
      <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
        {title}
      </h3>
      {hint && <p className="text-[12px] text-neutral-500 mt-1 leading-snug">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Change({
  current,
  previous,
  kind,
  lowerIsBetter = false,
}: {
  current: number;
  previous: number;
  kind: KpiKind;
  lowerIsBetter?: boolean;
}) {
  if (kind === 'rate') {
    const diff = Math.round((current - previous) * 10) / 10;
    if (diff === 0) return <span className="text-neutral-500">no change</span>;
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    return (
      <span className={good ? GOOD : BAD}>
        {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)} pts
      </span>
    );
  }
  if (previous === 0) {
    return current === 0 ? (
      <span className="text-neutral-500">no change</span>
    ) : (
      <span className="text-neutral-400">new</span>
    );
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <span className="text-neutral-500">no change</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span className={good ? GOOD : BAD}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
    </span>
  );
}

function KpiGrid({ current, previous, compared }: { current: Kpis; previous: Kpis; compared: string }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-800 border-2 border-neutral-800">
      {KPI_CARDS.map((card) => {
        const value = current[card.key];
        const before = previous[card.key];
        return (
          <div key={card.key} className="bg-neutral-950 px-4 py-4" title={card.hint}>
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
              {card.label}
            </div>
            <div className="font-display text-3xl text-yellow-400 leading-none mt-1.5 tabular-nums">
              {fmtKpi(value, card.kind)}
            </div>
            <div className="text-[11px] font-bold mt-2">
              <Change
                current={value ?? 0}
                previous={before ?? 0}
                kind={card.kind}
                lowerIsBetter={card.lowerIsBetter}
              />{' '}
              <span className="text-neutral-600 font-medium">vs {compared}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ series, hourly }: { series: SeriesPoint[]; hourly: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const height = 240;
  const left = 40;
  const right = 12;
  const top = 14;
  const bottom = 30;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  const peak = Math.max(1, ...series.map((p) => Math.max(p.visitors, p.bookings, p.calls)));
  const max = Math.max(2, niceCeil(peak));
  const x = (i: number) =>
    left + (series.length <= 1 ? innerW / 2 : (i * innerW) / (series.length - 1));
  const y = (value: number) => top + innerH * (1 - value / max);
  const line = (pick: (p: SeriesPoint) => number) =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ');
  const visitorsLine = line((p) => p.visitors);
  const area = series.length
    ? `${visitorsLine} L${x(series.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`
    : '';
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const point = hover !== null ? series[hover] : series[series.length - 1];

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (series.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = series.length <= 1 ? 0 : Math.round(((px - left) / innerW) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  return (
    <Panel title="Visits, bookings and calls" hint="Point at the chart to see a day's figures.">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-bold">
        <span className="inline-flex items-center gap-1.5 text-neutral-300">
          <span className="w-3 h-1 bg-yellow-400" /> Visits
        </span>
        <span className="inline-flex items-center gap-1.5 text-neutral-300">
          <span className="w-3 h-1 bg-[var(--color-success)]" /> Bookings
        </span>
        <span className="inline-flex items-center gap-1.5 text-neutral-300">
          <span className="w-3 h-1 bg-[var(--color-navy-300)]" /> Call taps
        </span>
      </div>
      {point && (
        <p className="text-sm text-neutral-300 mt-2 tabular-nums">
          <strong className="text-white">{pointLabel(point.label, hourly)}</strong>
          {`: ${fmtInt(point.visitors)} visits · ${fmtInt(point.pageViews)} page views · ${fmtInt(
            point.bookings,
          )} bookings · ${fmtInt(point.calls)} call taps`}
        </p>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto mt-3"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Chart of visits, bookings and call taps over the period"
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="stroke-neutral-800" />
            <text x={left - 6} y={y(tick) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">
              {fmtInt(Math.round(tick))}
            </text>
          </g>
        ))}
        <path d={area} className="fill-yellow-400/15" />
        <path d={visitorsLine} fill="none" className="stroke-yellow-400" strokeWidth={2.5} />
        <path d={line((p) => p.calls)} fill="none" stroke="var(--color-navy-300)" strokeWidth={2} />
        <path d={line((p) => p.bookings)} fill="none" stroke="var(--color-success)" strokeWidth={2.5} />
        {series.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.label}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-neutral-500 text-[11px]"
            >
              {pointLabel(p.label, hourly)}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={top}
            y2={top + innerH}
            className="stroke-neutral-500"
            strokeDasharray="4 4"
          />
        )}
      </svg>
    </Panel>
  );
}

function Funnel({ title, hint, steps }: { title: string; hint: string; steps: FunnelStep[] }) {
  const top = Math.max(1, ...steps.map((s) => s.sessions));
  const drops = steps.map((s, i) => (i === 0 ? 0 : Math.max(0, steps[i - 1].sessions - s.sessions)));
  const worst = Math.max(0, ...drops);
  return (
    <Panel title={title} hint={hint}>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => {
          const biggest = worst > 0 && drops[i] === worst;
          return (
            <li key={step.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={biggest ? `${BAD} font-bold` : 'text-neutral-200'}>{step.label}</span>
                <span className="tabular-nums text-neutral-400 shrink-0">
                  <strong className="text-white">{fmtInt(step.sessions)}</strong>
                  {i > 0 && <span className="text-neutral-600"> · {step.pctOfEntry}%</span>}
                </span>
              </div>
              <div className="h-2 bg-neutral-950 mt-1.5 border border-neutral-800">
                <div
                  className={biggest ? 'h-full bg-[var(--color-danger)]' : 'h-full bg-yellow-400'}
                  style={{ width: `${Math.min(100, (step.sessions / top) * 100)}%` }}
                />
              </div>
              {drops[i] > 0 && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  {fmtInt(drops[i])} dropped here{biggest ? ', the biggest drop' : ''}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

function outcomeColumns(
  label: string,
  name: (row: OutcomeRow) => ReactNode = (row) => row.label,
): Column<OutcomeRow>[] {
  return [
    { label, render: name },
    { label: 'Visits', numeric: true, render: (row) => fmtInt(row.sessions) },
    { label: 'Bookings', numeric: true, render: (row) => fmtInt(row.bookings) },
    { label: 'Calls', numeric: true, render: (row) => fmtInt(row.calls) },
    { label: 'Booked', numeric: true, render: (row) => `${row.conversionRate.toFixed(1)}%` },
  ];
}

const PAGE_COLUMNS: Column<PageRow>[] = [
  { label: 'Page', render: (row) => pageName(row.path) },
  { label: 'Views', numeric: true, render: (row) => fmtInt(row.views) },
  { label: 'Visits', numeric: true, render: (row) => fmtInt(row.visitors) },
  { label: 'Avg time', numeric: true, render: (row) => fmtDuration(row.avgSeconds) },
  { label: 'Scrolled', numeric: true, render: (row) => `${row.avgScroll}%` },
];

function DataTable<T>({
  title,
  hint,
  columns,
  rows,
  empty,
}: {
  title: string;
  hint?: string;
  columns: Column<T>[];
  rows: T[];
  empty: string;
}) {
  return (
    <Panel title={title} hint={hint}>
      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm">{empty}</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                {columns.map((c) => (
                  <th key={c.label} className={`pb-2 font-bold ${c.numeric ? 'text-right pl-3' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-neutral-800">
                  {columns.map((c) => (
                    <td
                      key={c.label}
                      className={
                        c.numeric
                          ? 'py-2 pl-3 text-right tabular-nums text-neutral-300 whitespace-nowrap'
                          : 'py-2 pr-3 text-white break-words'
                      }
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function BarList({ rows, format }: { rows: CountRow[]; format?: (label: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
          <div className="min-w-0">
            <div className="text-sm truncate text-neutral-200">{format ? format(r.label) : r.label}</div>
            <div className="h-1.5 bg-neutral-950 mt-1 border border-neutral-800">
              <div className="h-full bg-yellow-400" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
          <span className="tabular-nums text-sm text-neutral-300">{fmtInt(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

function Bars({
  title,
  hint,
  rows,
  format,
}: {
  title: string;
  hint?: string;
  rows: CountRow[];
  format?: (label: string) => string;
}) {
  return (
    <Panel title={title} hint={hint}>
      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm">Nothing yet.</p>
      ) : (
        <BarList rows={rows} format={format} />
      )}
    </Panel>
  );
}

function TrackingPanel({ data }: { data: Analytics }) {
  const t = data.tracking;
  return (
    <Panel title="Customer tracking page" hint="After booking, from the tracking link.">
      <dl className="grid grid-cols-2 gap-3">
        {[
          ['Visits', fmtInt(t.visits)],
          ['Cancelled online', fmtInt(t.cancelledOnline)],
          ['Jobs rated', fmtInt(t.ratings)],
          ['Average rating', t.avgRating !== null ? `${t.avgRating} / 5` : '–'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">{label}</dt>
            <dd className="font-display text-2xl text-white mt-0.5 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function VitalsPanel({ vitals }: { vitals: Vital[] }) {
  return (
    <Panel
      title="Site speed"
      hint="Measured in visitors' own browsers. The slowest quarter of visits are at or above these figures."
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {vitals.map((v) => {
          const info = VITAL_INFO[v.name];
          if (!info) return null;
          const rating =
            v.p75 === null ? null : v.p75 <= info.good ? 'good' : v.p75 <= info.poor ? 'warn' : 'poor';
          const value =
            v.p75 === null
              ? '–'
              : info.unit === 'score'
                ? v.p75.toFixed(2)
                : v.p75 >= 1000
                  ? `${(v.p75 / 1000).toFixed(1)}s`
                  : `${Math.round(v.p75)}ms`;
          return (
            <div key={v.name} className="border border-neutral-800 bg-neutral-950 p-3 flex flex-col gap-1.5">
              <div className="text-[11px] font-bold text-neutral-300">{info.label}</div>
              <div className="font-display text-2xl text-white tabular-nums">{value}</div>
              {rating && (
                <div>
                  <Chip tone={rating === 'good' ? 'success' : rating === 'warn' ? 'warn' : 'danger'}>
                    {rating === 'good' ? 'Good' : rating === 'warn' ? 'Needs work' : 'Poor'}
                  </Chip>
                </div>
              )}
              <div className="text-[11px] text-neutral-600">
                {info.metric} · {fmtInt(v.samples)} visits
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function LivePanel() {
  const [live, setLive] = useState<LiveData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setLive(await fetchLive());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section className="border-2 border-neutral-800 bg-neutral-900 p-4 grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="relative flex w-3 h-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-60" />
            <span className="relative inline-flex w-3 h-3 rounded-full bg-[var(--color-success)]" />
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
            Right now
          </span>
        </div>
        <div className="font-display text-5xl text-white mt-2 tabular-nums">
          {live ? fmtInt(live.activeVisitors) : '–'}
        </div>
        <p className="text-[12px] text-neutral-500">
          {live?.activeVisitors === 1 ? 'visit' : 'visits'} active in the last 5 minutes
        </p>
        {failed && <p className={`text-[12px] mt-2 ${BAD}`}>Couldn't refresh.</p>}
        {live && live.pages.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {live.pages.map((p) => (
              <li key={p.label} className="flex justify-between gap-3">
                <span className="truncate text-neutral-300">{pageName(p.label)}</span>
                <span className="tabular-nums text-white">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
          Latest activity, last 30 minutes
        </h3>
        {!live ? (
          <Loading />
        ) : live.recent.length === 0 ? (
          <p className="text-sm text-neutral-500 mt-3">Nobody has been on the site in the last 30 minutes.</p>
        ) : (
          <ol className="mt-2 max-h-72 overflow-y-auto divide-y divide-neutral-800 pr-1">
            {live.recent.map((e, i) => (
              <li key={`${e.at}-${i}`} className="py-1.5 flex gap-3 text-sm">
                <span className="text-[12px] text-neutral-500 tabular-nums shrink-0 w-16">
                  {new Date(e.at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="min-w-0">
                  <span className="text-white">{EVENT_LABEL[e.name] ?? e.name}</span>
                  <span className="text-neutral-500">
                    {' '}
                    · {pageName(e.path)}
                    {e.device ? ` · ${e.device}` : ''}
                  </span>
                  {e.detail && (
                    <span className="block text-[12px] text-neutral-400 truncate">{e.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
