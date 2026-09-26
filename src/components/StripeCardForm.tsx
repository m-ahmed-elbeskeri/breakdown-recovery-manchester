// Stripe's own card form. Loaded only when a customer is actually paying, so
// nobody else downloads Stripe. Card details go from this form straight to
// Stripe and never pass through our servers.

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

const loaders = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let loader = loaders.get(publishableKey);
  if (!loader) {
    loader = loadStripe(publishableKey);
    loaders.set(publishableKey, loader);
  }
  return loader;
}

interface Props {
  clientSecret: string;
  publishableKey: string;
  amountLabel: string;
  returnUrl: string;
  onConfirmed: () => Promise<void>;
}

export default function StripeCardForm({ clientSecret, publishableKey, ...rest }: Props) {
  const stripe = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#111418',
            colorBackground: '#ffffff',
            colorText: '#111418',
            borderRadius: '0px',
            fontSizeBase: '15px',
          },
        },
      }}
    >
      <CardForm {...rest} />
    </Elements>
  );
}

function CardForm({
  amountLabel,
  returnUrl,
  onConfirmed,
}: Omit<Props, 'clientSecret' | 'publishableKey'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: returnUrl },
    });
    if (result.error) {
      setError(result.error.message ?? 'Your card was not accepted. Try another card.');
      setBusy(false);
      return;
    }
    try {
      await onConfirmed();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'We could not confirm your payment. Please ring us.',
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p role="alert" className="text-[var(--color-danger)] text-xs font-bold">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full bg-accent-400 hover:bg-accent-300 text-neutral-950 font-display py-3.5 uppercase tracking-wider disabled:opacity-50"
      >
        {busy ? 'Checking your card…' : `Hold ${amountLabel} on my card`}
      </button>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Nothing is taken until your job is done, and if you cancel before the driver arrives the
        hold is released. Your card details go straight to Stripe; we never see them.
      </p>
    </form>
  );
}
