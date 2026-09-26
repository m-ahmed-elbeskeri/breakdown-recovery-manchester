// "Add your card" for one booking. Asks the API for the booking's payment,
// then shows Stripe's card form, loaded on demand.

import { Suspense, lazy, useEffect, useState } from 'react';
import { Loader2 } from '../icons';
import { trackPath } from '../config';
import { startCardPayment, syncCardPayment, type CardPaymentStart } from '../payments';

const StripeCardForm = lazy(() => import('./StripeCardForm'));

function Waiting({ label }: { label: string }) {
  return (
    <p className="text-slate-500 text-sm flex items-center gap-2 py-3">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </p>
  );
}

export function CardPayment({
  token,
  onSettled,
}: {
  token: string;
  /** Called with the payment's status once the card is held (or already was). */
  onSettled: (status: string) => void;
}) {
  const [start, setStart] = useState<CardPaymentStart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    startCardPayment(token)
      .then((result) => {
        if (!live) return;
        if (result.clientSecret) setStart(result);
        else onSettled(result.status);
      })
      .catch((err: unknown) => {
        if (live)
          setError(err instanceof Error ? err.message : 'Card payment is unavailable right now.');
      });
    return () => {
      live = false;
    };
    // The booking is what matters; a new callback each render is not a new payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) {
    return (
      <p role="alert" className="text-[var(--color-danger)] text-xs font-bold">
        {error}
      </p>
    );
  }
  if (!start?.clientSecret) return <Waiting label="Opening the secure card form…" />;

  const pounds = (start.amountPence / 100).toFixed(2).replace(/\.00$/, '');
  return (
    <Suspense fallback={<Waiting label="Opening the secure card form…" />}>
      <StripeCardForm
        clientSecret={start.clientSecret}
        publishableKey={start.publishableKey}
        amountLabel={`£${pounds}`}
        returnUrl={`${window.location.origin}${trackPath(token)}`}
        onConfirmed={async () => {
          const synced = await syncCardPayment(token);
          onSettled(synced.status);
        }}
      />
    </Suspense>
  );
}
