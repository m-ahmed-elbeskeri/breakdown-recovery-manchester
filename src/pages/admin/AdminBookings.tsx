import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone, Star } from '../../icons';
import { ApiError } from '../../apiClient';
import {
  absoluteLink,
  assignJob,
  fetchBookings,
  listDriverSummaries,
  type DriverSummary,
} from '../../adminApi';
import { CopyButton, ErrorNotice } from '../../components/console';
import { trackPath } from '../../config';
import { serviceLabel } from '../../data';
import { whenLabel, type Job } from '../../driver';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** Minutes between two timestamps, for "how long did that take". */
const minutesBetween = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
};

const errorText = (err: unknown): string =>
  err instanceof ApiError && err.blockers.length
    ? `${err.message} ${err.blockers.join(' ')}`
    : err instanceof Error
      ? err.message
      : String(err);

export function AdminBookings() {
  const [bookings, setBookings] = useState<Job[] | null>(null);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, roster] = await Promise.all([fetchBookings(100), listDriverSummaries('active')]);
      setBookings(rows);
      setDrivers(roster.filter((d) => d.canWork));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-white uppercase tracking-tight">
          {bookings ? `${bookings.length} booking${bookings.length === 1 ? '' : 's'}` : 'Bookings'}
        </h1>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-bold uppercase tracking-wider text-neutral-950 bg-yellow-400 hover:bg-yellow-300 px-4 py-2 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      <ErrorNotice error={error} />

      {bookings && bookings.length === 0 ? (
        <p className="text-neutral-500 text-center py-16">No bookings yet.</p>
      ) : (
        <div className="overflow-x-auto border-2 border-neutral-800 mt-4">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="p-3 font-bold">Time</th>
                <th className="p-3 font-bold">Service</th>
                <th className="p-3 font-bold">Pickup → Drop-off</th>
                <th className="p-3 font-bold">Vehicle</th>
                <th className="p-3 font-bold">Phone</th>
                <th className="p-3 font-bold">Price</th>
                <th className="p-3 font-bold">When</th>
                <th className="p-3 font-bold">Driver</th>
                <th className="p-3 font-bold">Status</th>
                <th className="p-3 font-bold">Track</th>
                <th className="p-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings?.map((b) => {
                const response = minutesBetween(b.createdAt, b.onSceneAt);
                return (
                  <tr key={b.id} className="border-t border-neutral-800 hover:bg-neutral-900/60 align-top">
                    <td className="p-3 text-neutral-400 whitespace-nowrap tabular-nums">
                      {fmtTime(b.createdAt)}
                      <span className="block text-[10px] text-neutral-600">#{b.id}</span>
                    </td>
                    <td className="p-3 font-semibold text-white">
                      {serviceLabel(b.service)}
                      {b.motorway && (
                        <span className="block text-[10px] text-red-400 font-black uppercase">
                          Motorway
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-300">
                      {b.location}
                      {b.destination ? (
                        <span className="text-neutral-500"> → {b.destination}</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-neutral-300">{b.vehicle ?? '–'}</td>
                    <td className="p-3">
                      {b.phone ? (
                        <a
                          href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}
                          className="text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Phone className="w-3.5 h-3.5" /> {b.phone}
                        </a>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="p-3 font-display text-yellow-400 tabular-nums">
                      {b.price != null ? `£${b.price}` : '–'}
                    </td>
                    <td className="p-3 text-neutral-400 whitespace-nowrap">{whenLabel(b)}</td>
                    <td className="p-3 text-neutral-300 whitespace-nowrap">
                      {b.driverName ?? '–'}
                      {response !== null && (
                        <span className="block text-[10px] text-neutral-500">
                          on scene in {response} min
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-800 text-neutral-300 px-2 py-1 whitespace-nowrap">
                        {b.status.replace('_', ' ')}
                        {b.cancelledBy ? ` · ${b.cancelledBy}` : ''}
                      </span>
                      {b.rating !== null && (
                        <span
                          className="mt-1.5 flex items-center gap-0.5 text-yellow-400"
                          aria-label={`Rated ${b.rating} out of 5`}
                          title={b.ratingComment ?? undefined}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`w-3 h-3 ${n <= (b.rating ?? 0) ? 'fill-yellow-400' : 'opacity-30'}`}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {b.trackToken ? (
                        <div className="flex items-center gap-3">
                          <a
                            href={trackPath(b.trackToken)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-yellow-400 hover:text-yellow-300 underline text-xs"
                          >
                            Open
                          </a>
                          <CopyButton text={absoluteLink(trackPath(b.trackToken))} label="Copy" />
                        </div>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="p-3">
                      <BookingActions job={b} drivers={drivers} onChanged={load} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BookingActions({
  job,
  drivers,
  onChanged,
}: {
  job: Job;
  drivers: DriverSummary[];
  onChanged: () => Promise<void>;
}) {
  const [driverId, setDriverId] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (job.status === 'complete' || job.status === 'cancelled') {
    return <span className="text-neutral-600">–</span>;
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirmCancel(false);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[12rem]">
      {job.status === 'pending' && (
        <div className="flex gap-1">
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="bg-neutral-950 border-2 border-neutral-800 text-xs px-2 py-1.5 flex-1 min-w-0"
            aria-label={`Assign job ${job.id} to a driver`}
          >
            <option value="">Assign to…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id} disabled={job.motorway && !d.motorwayWork}>
                {d.name}
                {d.available ? ' (on duty)' : ''}
                {job.motorway && !d.motorwayWork ? ' (no motorway)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!driverId || busy}
            onClick={() => void run(() => assignJob(job.id, 'accepted', Number(driverId)))}
            className="px-2.5 bg-yellow-400 text-neutral-950 text-[11px] font-black uppercase disabled:opacity-40"
          >
            Assign
          </button>
        </div>
      )}
      {confirmCancel ? (
        <div className="flex gap-3 items-center text-[11px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => assignJob(job.id, 'cancelled'))}
            className="font-black uppercase text-[var(--color-danger-soft)]"
          >
            Cancel job
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancel(false)}
            className="font-black uppercase text-neutral-400"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="self-start text-[11px] font-black uppercase tracking-wider text-neutral-500 hover:text-[var(--color-danger-soft)]"
        >
          Cancel…
        </button>
      )}
      {error && <p className="text-[11px] text-[var(--color-danger-soft)] max-w-[16rem]">{error}</p>}
    </div>
  );
}
