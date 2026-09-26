// The office's view of the money: what came in by card, the platform's cut,
// what each driver is owed or owes, and refunds.

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Banner,
  Chip,
  DangerButton,
  ErrorNotice,
  inputClass,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { serviceLabel } from '../../data';
import { formatDateTime } from '../../driverDocs';
import {
  adjustDriverBalance,
  fetchPaymentsSummary,
  formatPence,
  PAYMENT_STATUS_LABEL,
  payAllDrivers,
  refundBooking,
  type DriverBalance,
  type PaymentRow,
  type PaymentsSummary,
} from '../../payments';

export function AdminPayments() {
  const [data, setData] = useState<PaymentsSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchPaymentsSummary());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const payDrivers = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await payAllDrivers();
      setNotice(
        result.drivers
          ? `Sent ${formatPence(result.transferredPence)} to ${result.drivers} driver${result.drivers === 1 ? '' : 's'}.`
          : 'Nobody set up for payouts is owed anything.',
      );
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-white uppercase tracking-tight">Payments</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {data ? `The platform keeps ${data.feePercent}% of every job, card or cash.` : ''}
          </p>
        </div>
        {data?.enabled && (
          <SecondaryButton busy={busy} onClick={() => void payDrivers()}>
            Pay drivers what they're owed
          </SecondaryButton>
        )}
      </div>

      <ErrorNotice error={error} />
      {notice && <Banner tone="success" title={notice} />}

      {!data ? (
        !error && <Loading />
      ) : (
        <>
          {!data.enabled && (
            <Banner tone="warn" title="Card payments are off">
              Add STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET to the API's
              settings on Render to switch them on. The cut on cash jobs is still recorded.
            </Banner>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-neutral-800 border-2 border-neutral-800">
            {[
              ['Taken by card, 30 days', data.cardTaken30DaysPence],
              ['Platform cut, 30 days', data.platformFees30DaysPence],
              ['Refunded, 30 days', data.refunded30DaysPence],
              ['Owed to drivers', data.owedToDriversPence],
              ['Owed by drivers', data.owedByDriversPence],
            ].map(([label, value]) => (
              <div key={label} className="bg-neutral-950 px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
                  {label}
                </div>
                <div className="font-display text-2xl text-accent-400 leading-none mt-1.5 tabular-nums">
                  {formatPence(Number(value))}
                </div>
              </div>
            ))}
          </div>

          <section className="border-2 border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
              Drivers
            </h2>
            <p className="text-[12px] text-neutral-500 mt-1">
              A positive balance is owed to the driver and is sent when they're set up for payouts.
              A negative one is the cut they owe on cash jobs; record it here if they pay you
              directly.
            </p>
            {data.drivers.length === 0 ? (
              <p className="text-sm text-neutral-500 mt-3">No drivers yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-neutral-800">
                {data.drivers.map((d) => (
                  <DriverRow key={d.driverId} driver={d} onChanged={load} />
                ))}
              </ul>
            )}
          </section>

          <section className="border-2 border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400">
              Recent payments
            </h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-neutral-500 mt-3">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4 mt-3">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                      <th className="pb-2 font-bold">Job</th>
                      <th className="pb-2 font-bold">Driver</th>
                      <th className="pb-2 font-bold">Payment</th>
                      <th className="pb-2 font-bold text-right">Price</th>
                      <th className="pb-2 font-bold text-right">Platform cut</th>
                      <th className="pb-2 font-bold text-right">Driver's share</th>
                      <th className="pb-2 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <PaymentRowView key={row.bookingId} row={row} onChanged={load} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function DriverRow({
  driver,
  onChanged,
}: {
  driver: DriverBalance;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pounds, setPounds] = useState('');
  const [note, setNote] = useState('Paid by bank transfer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountPence = Math.round(Number(pounds) * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      setError(new Error('Enter the amount they paid, in pounds.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustDriverBalance(driver.driverId, { kind: 'settlement', amountPence, note });
      setOpen(false);
      setPounds('');
      await onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/admin/drivers/${driver.driverId}`}
            className="text-white font-bold hover:text-accent-400 underline"
          >
            {driver.name}
          </Link>
          <div className="mt-1">
            {driver.payoutsEnabled ? (
              <Chip tone="success">Payouts set up</Chip>
            ) : driver.connected ? (
              <Chip tone="warn">Setting up payouts</Chip>
            ) : (
              <Chip tone="neutral">No payouts yet</Chip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`font-display text-xl tabular-nums ${
              driver.balancePence < 0
                ? 'text-[var(--color-danger-soft)]'
                : driver.balancePence > 0
                  ? 'text-[var(--color-success)]'
                  : 'text-neutral-400'
            }`}
          >
            {formatPence(driver.balancePence)}
          </span>
          {driver.balancePence < 0 && !open && (
            <SecondaryButton onClick={() => setOpen(true)}>Record a payment</SecondaryButton>
          )}
        </div>
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400">
            Amount, £
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={pounds}
              onChange={(e) => setPounds(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400 flex-1 min-w-[12rem]">
            Note
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </label>
          <PrimaryButton type="submit" busy={busy}>
            Save
          </PrimaryButton>
          <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          <div className="w-full">
            <ErrorNotice error={error} />
          </div>
        </form>
      )}
    </li>
  );
}

function PaymentRowView({ row, onChanged }: { row: PaymentRow; onChanged: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Anything taken by card through the site: a full card payment or a cash job's deposit.
  const refundable =
    row.paymentStatus === 'paid' ||
    row.paymentStatus === 'deposit_paid' ||
    (row.paymentStatus === 'partly_refunded' && (row.amountPaidPence ?? 0) > 0);
  const remaining = (row.amountPaidPence ?? 0) - row.refundedPence;

  const refund = async () => {
    setBusy(true);
    setError(null);
    try {
      await refundBooking(row.bookingId);
      setConfirming(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const tone =
    row.paymentStatus === 'paid' || row.paymentStatus === 'paid_in_person'
      ? 'success'
      : row.paymentStatus === 'failed'
        ? 'danger'
        : row.paymentStatus === 'authorised'
          ? 'info'
          : 'neutral';

  return (
    <tr className="border-t border-neutral-800 align-top">
      <td className="py-2 pr-3">
        <span className="text-white">#{row.bookingId}</span>
        <span className="block text-[12px] text-neutral-500">
          {serviceLabel(row.service)} · {formatDateTime(row.createdAt)}
        </span>
      </td>
      <td className="py-2 pr-3 text-neutral-300">{row.driverName ?? '–'}</td>
      <td className="py-2 pr-3">
        <Chip tone={tone}>{PAYMENT_STATUS_LABEL[row.paymentStatus] ?? row.paymentStatus}</Chip>
        <span className="block text-[11px] text-neutral-500 mt-1">
          {row.paymentMethod === 'card'
            ? 'Card'
            : row.depositPence
              ? `Cash + ${formatPence(row.depositPence)} deposit`
              : 'Cash'}
          {row.refundedPence ? ` · ${formatPence(row.refundedPence)} refunded` : ''}
        </span>
      </td>
      <td className="py-2 text-right tabular-nums text-neutral-300">
        {row.price !== null ? `£${row.price}` : '–'}
      </td>
      <td className="py-2 text-right tabular-nums text-neutral-300">
        {row.platformFeePence !== null ? formatPence(row.platformFeePence) : '–'}
      </td>
      <td className="py-2 text-right tabular-nums text-neutral-300">
        {row.driverNetPence !== null ? formatPence(row.driverNetPence) : '–'}
      </td>
      <td className="py-2 pl-3 text-right whitespace-nowrap">
        {refundable &&
          (confirming ? (
            <span className="inline-flex gap-2">
              <DangerButton busy={busy} onClick={() => void refund()}>
                Refund {formatPence(remaining)}
              </DangerButton>
              <SecondaryButton onClick={() => setConfirming(false)}>Keep</SecondaryButton>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-[11px] font-black uppercase tracking-wider text-neutral-500 hover:text-[var(--color-danger-soft)]"
            >
              Refund…
            </button>
          ))}
        {error && (
          <span className="block text-[11px] text-[var(--color-danger-soft)] mt-1">{error}</span>
        )}
      </td>
    </tr>
  );
}
