import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchComplianceReport, type ComplianceRow } from '../../adminApi';
import { Banner, Chip, ErrorNotice, Loading } from '../../components/console';
import { daysUntil, formatDate } from '../../driverDocs';

const STATE: Record<string, { label: string; tone: 'danger' | 'warn' | 'info' }> = {
  expired: { label: 'Expired', tone: 'danger' },
  missing: { label: 'Missing', tone: 'danger' },
  rejected: { label: 'Sent back', tone: 'danger' },
  pending: { label: 'Waiting for review', tone: 'info' },
  expiring: { label: 'Expires soon', tone: 'warn' },
};

export function AdminCompliance() {
  const [rows, setRows] = useState<ComplianceRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchComplianceReport());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl text-white uppercase tracking-tight">Compliance</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Paperwork on approved drivers that has run out, is about to, or is stopping them working.
          Drivers see the same warnings in their app.
        </p>
      </div>
      <ErrorNotice error={error} />
      {rows === null ? (
        !error && <Loading />
      ) : rows.length === 0 ? (
        <Banner tone="success" title="Nothing needs attention">
          Every approved driver's documents are in date for at least the next 30 days.
        </Banner>
      ) : (
        <div className="overflow-x-auto border-2 border-neutral-800">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                <th className="p-3 font-bold">Driver</th>
                <th className="p-3 font-bold">Document</th>
                <th className="p-3 font-bold">State</th>
                <th className="p-3 font-bold">Valid until</th>
                <th className="p-3 font-bold">Stops them working</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const state = STATE[r.state] ?? { label: r.state, tone: 'info' as const };
                const left = daysUntil(r.validUntil);
                return (
                  <tr key={`${r.driverId}-${r.key}`} className="border-t border-neutral-800 align-top">
                    <td className="p-3">
                      <Link
                        to={`/admin/drivers/${r.driverId}`}
                        className="text-white font-bold hover:text-yellow-400 underline"
                      >
                        {r.driverName}
                      </Link>
                      {r.driverStatus === 'suspended' && (
                        <span className="block text-[11px] text-neutral-500">Suspended</span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-300">{r.label}</td>
                    <td className="p-3">
                      <Chip tone={state.tone}>{state.label}</Chip>
                    </td>
                    <td className="p-3 text-neutral-300 whitespace-nowrap">
                      {r.validUntil ? formatDate(r.validUntil) : '–'}
                      {left !== null && (
                        <span className="block text-[11px] text-neutral-500">
                          {left < 0
                            ? `${-left} day${left === -1 ? '' : 's'} ago`
                            : left === 0
                              ? 'today'
                              : `in ${left} day${left === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-300">{r.blocksWork ? 'Yes' : 'No'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
