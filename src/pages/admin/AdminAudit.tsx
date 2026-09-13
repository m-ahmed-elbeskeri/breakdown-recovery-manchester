// Who did what, newest first. Sign-ins, every decision about a driver, every
// document opened, every job that changed hands.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { actionLabel, auditDetail, fetchAudit, type AuditEvent } from '../../adminApi';
import { ErrorNotice, Loading, SecondaryButton } from '../../components/console';
import { formatDateTime } from '../../driverDocs';

const PAGE_SIZE = 100;

const FILTERS = [
  { key: '', label: 'Everything' },
  { key: 'driver.', label: 'Drivers' },
  { key: 'document.', label: 'Documents' },
  { key: 'job.', label: 'Jobs' },
  { key: 'account.', label: 'Accounts' },
] as const;

function Target({ event }: { event: AuditEvent }) {
  const driverId =
    event.targetType === 'driver'
      ? event.targetId
      : typeof event.detail?.driverId === 'number'
        ? event.detail.driverId
        : null;
  if (driverId !== null && event.targetType !== 'booking') {
    return (
      <Link to={`/admin/drivers/${driverId}`} className="text-yellow-400 underline">
        Driver #{driverId}
      </Link>
    );
  }
  if (event.targetType && event.targetId !== null) {
    const noun = event.targetType === 'booking' ? 'Job' : event.targetType === 'user' ? 'Account' : event.targetType;
    return (
      <span>
        {noun} #{event.targetId}
      </span>
    );
  }
  return <span className="text-neutral-600">–</span>;
}

export function AdminAudit() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const page = await fetchAudit(PAGE_SIZE);
      setEvents(page);
      setHasMore(page.length === PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const more = async () => {
    if (!events?.length) return;
    setLoadingMore(true);
    try {
      const page = await fetchAudit(PAGE_SIZE, events[events.length - 1].id);
      setEvents([...events, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = events?.filter((e) => e.action.startsWith(filter)) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl text-white uppercase tracking-tight">Audit log</h1>
        <p className="text-sm text-neutral-400 mt-1">
          A permanent record of who did what. It can't be edited from here.
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto" aria-label="Filter events">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`shrink-0 px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border-2 ${
              filter === f.key
                ? 'bg-yellow-400 text-neutral-950 border-yellow-400'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      <ErrorNotice error={error} />

      {events === null ? (
        !error && <Loading />
      ) : visible.length === 0 ? (
        <p className="text-neutral-500 text-sm border-2 border-neutral-900 px-4 py-10 text-center">
          Nothing recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto border-2 border-neutral-800">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="p-3 font-bold">When</th>
                <th className="p-3 font-bold">Who</th>
                <th className="p-3 font-bold">What</th>
                <th className="p-3 font-bold">About</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const extra = auditDetail(e);
                return (
                  <tr key={e.id} className="border-t border-neutral-800 align-top">
                    <td className="p-3 text-neutral-400 whitespace-nowrap tabular-nums">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="p-3 text-neutral-300">{e.actorLabel}</td>
                    <td className="p-3">
                      <span className="text-white">{actionLabel(e.action)}</span>
                      {extra && (
                        <span className="block text-[12px] text-neutral-400 break-words">
                          {extra}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-300 whitespace-nowrap">
                      <Target event={e} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div>
          <SecondaryButton onClick={() => void more()} busy={loadingMore}>
            Load older
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
