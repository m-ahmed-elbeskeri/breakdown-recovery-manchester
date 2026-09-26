// A driver's money: getting set up to be paid, what they're owed or owe, and
// cashing out when they choose. Identity and bank details are collected on
// Stripe's own pages, never here.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banner,
  Card,
  Detail,
  ErrorNotice,
  Loading,
  PrimaryButton,
  SecondaryButton,
} from '../../components/console';
import { formatDate, formatDateTime } from '../../driverDocs';
import {
  cashOut,
  fetchEarnings,
  formatPence,
  instantFeeFor,
  LEDGER_KIND_LABEL,
  openPayoutDashboard,
  refreshEarnings,
  startPayoutSetup,
  type Earnings,
  type PayoutResult,
} from '../../payments';
import { useNoIndex } from '../../seo';
import { DriverShell } from './DriverShell';

export function DriverEarningsPage() {
  useNoIndex('Earnings');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payout, setPayout] = useState<PayoutResult | null>(null);

  const load = useCallback(async (askStripe = false) => {
    try {
      setData(askStripe ? await refreshEarnings() : await fetchEarnings());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  // Coming back from Stripe's setup pages: ask Stripe how it went.
  useEffect(() => {
    const returning = params.has('setup');
    void load(returning);
    if (returning) {
      const next = new URLSearchParams(params);
      next.delete('setup');
      setParams(next, { replace: true });
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const openStripe = (key: string, getLink: () => Promise<{ url: string }>) =>
    run(key, async () => {
      const { url } = await getLink();
      window.location.assign(url);
    });

  const withdraw = (instant: boolean) =>
    run(instant ? 'instant' : 'standard', async () => {
      setPayout(await cashOut(instant));
      await load();
    });

  if (!data) {
    return (
      <DriverShell title="Earnings">
        {error ? <ErrorNotice error={error} /> : <Loading />}
      </DriverShell>
    );
  }

  const { account, stripeBalance: balance } = data;
  const instantFee = balance ? instantFeeFor(balance.instantAvailablePence) : 0;

  return (
    <DriverShell title="Earnings">
      <ErrorNotice error={error} />

      {!data.enabled && (
        <Banner tone="neutral" title="Card payments aren't switched on yet">
          Customers pay you directly for now. The platform's {data.feePercent}% cut on those jobs
          is recorded below and settled with the office.
        </Banner>
      )}

      {payout && (
        <Banner tone="success" title={`${formatPence(payout.amountPence)} is on its way`}>
          {payout.instant
            ? `It usually arrives within 30 minutes. Instant payout fee: ${formatPence(payout.feePence)}.`
            : `It should reach your bank by ${formatDate(payout.arrivalDate)}.`}
        </Banner>
      )}

      {data.balancePence < 0 && (
        <Banner tone="warn" title={`You owe ${formatPence(-data.balancePence)}`}>
          That's the platform's {data.feePercent}% cut on cash jobs. It comes off your next card
          job automatically, or you can pay the office directly.
        </Banner>
      )}
      {data.balancePence > 0 && (
        <Banner tone="info" title={`${formatPence(data.balancePence)} waiting for you`}>
          {account.payoutsEnabled
            ? "Your share of card jobs. It moves to your Stripe balance as soon as the customer's payment clears."
            : 'Your share of card jobs. Set up payouts and it is sent to you straight away.'}
        </Banner>
      )}

      <Card title="Getting paid">
        {!account.connected || !account.detailsSubmitted ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-300">
              Payouts are handled by Stripe. They check your ID and bank details on their own
              secure pages, which takes about five minutes. You keep {100 - data.feePercent}% of
              every job.
            </p>
            <div>
              <PrimaryButton
                busy={busy === 'setup'}
                disabled={!data.enabled}
                onClick={() => void openStripe('setup', startPayoutSetup)}
              >
                {account.connected ? 'Continue payout setup' : 'Set up payouts'}
              </PrimaryButton>
            </div>
          </div>
        ) : !account.payoutsEnabled ? (
          <div className="flex flex-col gap-3">
            <Banner tone="warn" title="Stripe is still checking your details">
              This is usually quick. If Stripe needs anything else, you'll see it when you continue
              setup.
            </Banner>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton busy={busy === 'setup'} onClick={() => void openStripe('setup', startPayoutSetup)}>
                Continue setup
              </PrimaryButton>
              <SecondaryButton busy={busy === 'check'} onClick={() => void run('check', () => load(true))}>
                Check again
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Banner tone="success" title="Payouts are set up" />
            <div>
              <SecondaryButton
                busy={busy === 'dashboard'}
                onClick={() => void openStripe('dashboard', openPayoutDashboard)}
              >
                Bank details and payout history
              </SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      {balance && (
        <Card title="Cash out">
          <dl className="grid grid-cols-3 gap-3">
            <Detail label="Ready now">{formatPence(balance.availablePence)}</Detail>
            <Detail label="Ready for instant">{formatPence(balance.instantAvailablePence)}</Detail>
            <Detail label="Clearing">{formatPence(balance.pendingPence)}</Detail>
          </dl>
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <PrimaryButton
                busy={busy === 'instant'}
                disabled={balance.instantAvailablePence <= instantFee}
                onClick={() => void withdraw(true)}
              >
                Cash out {formatPence(balance.instantAvailablePence)} now
              </PrimaryButton>
              <p className="text-[12px] text-neutral-500 mt-1.5">
                Arrives in minutes. Stripe's fee is 1%, at least 50p
                {balance.instantAvailablePence > 0 ? ` (${formatPence(instantFee)} on this)` : ''}.
              </p>
            </div>
            <div>
              <SecondaryButton
                busy={busy === 'standard'}
                disabled={balance.availablePence <= 0}
                onClick={() => void withdraw(false)}
              >
                Send {formatPence(balance.availablePence)} to my bank
              </SecondaryButton>
              <p className="text-[12px] text-neutral-500 mt-1.5">
                No fee. Usually arrives in two to three working days.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Last 30 days">
        <dl className="grid grid-cols-3 gap-3">
          <Detail label="Card jobs, your share">{formatPence(data.earned30DaysPence)}</Detail>
          <Detail label="Cut on cash jobs">{formatPence(data.commission30DaysPence)}</Detail>
          <Detail label="Sent to you">{formatPence(data.transferred30DaysPence)}</Detail>
        </dl>
      </Card>

      <Card title="History">
        {data.entries.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing yet. Finished jobs appear here.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-800">
            {data.entries.map((e) => (
              <li key={e.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-white">
                    {LEDGER_KIND_LABEL[e.kind] ?? e.kind}
                    {e.bookingId ? <span className="text-neutral-500"> · job #{e.bookingId}</span> : null}
                  </div>
                  <div className="text-[12px] text-neutral-500">
                    {formatDateTime(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <span
                  className={`tabular-nums text-sm font-bold shrink-0 ${
                    e.kind === 'transfer'
                      ? 'text-neutral-400'
                      : e.amountPence >= 0
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-danger-soft)]'
                  }`}
                >
                  {e.kind === 'transfer' ? formatPence(-e.amountPence) : formatPence(e.amountPence)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DriverShell>
  );
}
