// Payments: the customer's card, drivers' earnings and payouts, and the
// office's view of the money. Card details never touch this site: they go
// from Stripe's own form straight to Stripe.

import { useEffect, useState } from 'react';
import { API_BASE } from './api';
import { apiFetch } from './apiClient';

export interface PaymentsConfig {
  enabled: boolean;
  publishableKey: string | null;
  feePercent: number;
}

const OFF: PaymentsConfig = { enabled: false, publishableKey: null, feePercent: 20 };
let configRequest: Promise<PaymentsConfig> | null = null;

/** Whether card payments are on. Asked once per visit; a failed ask is retried next time. */
export function fetchPaymentsConfig(): Promise<PaymentsConfig> {
  if (!configRequest) {
    configRequest = fetch(`${API_BASE}/api/payments/config`)
      .then((res) => (res.ok ? (res.json() as Promise<PaymentsConfig>) : OFF))
      .catch(() => {
        configRequest = null;
        return OFF;
      });
  }
  return configRequest;
}

export function usePaymentsConfig(): PaymentsConfig | null {
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  useEffect(() => {
    let live = true;
    void fetchPaymentsConfig().then((value) => {
      if (live) setConfig(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return config;
}

// ── Customers ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = 'Something went wrong with the payment. Please ring us.';
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === 'string') detail = data.detail;
    } catch {
      /* no body */
    }
    throw new Error(detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface CardPaymentStart {
  clientSecret: string | null;
  publishableKey: string;
  amountPence: number;
  status: string;
}

const tokenPath = (token: string) => `/api/track/${encodeURIComponent(token)}`;

export const startCardPayment = (token: string) =>
  post<CardPaymentStart>(`${tokenPath(token)}/payment`);

export const syncCardPayment = (token: string) =>
  post<CardPaymentStart>(`${tokenPath(token)}/payment/sync`);

export const choosePaymentMethod = (token: string, method: 'card' | 'cash') =>
  post<void>(`${tokenPath(token)}/payment-method`, { method });

// ── Drivers ─────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  id: number;
  kind: string;
  amountPence: number;
  bookingId: number | null;
  note: string | null;
  createdAt: string;
}

export interface Earnings {
  enabled: boolean;
  feePercent: number;
  account: { connected: boolean; detailsSubmitted: boolean; payoutsEnabled: boolean };
  balancePence: number;
  stripeBalance: {
    availablePence: number;
    pendingPence: number;
    instantAvailablePence: number;
  } | null;
  earned30DaysPence: number;
  commission30DaysPence: number;
  transferred30DaysPence: number;
  entries: LedgerEntry[];
}

export interface PayoutResult {
  payoutId: string;
  amountPence: number;
  feePence: number;
  instant: boolean;
  arrivalDate: string | null;
}

export const fetchEarnings = () => apiFetch<Earnings>('/api/me/earnings');
export const refreshEarnings = () =>
  apiFetch<Earnings>('/api/me/earnings/refresh', { method: 'POST' });
export const startPayoutSetup = () =>
  apiFetch<{ url: string }>('/api/me/earnings/onboarding', { method: 'POST' });
export const openPayoutDashboard = () =>
  apiFetch<{ url: string }>('/api/me/earnings/dashboard', { method: 'POST' });
export const cashOut = (instant: boolean) =>
  apiFetch<PayoutResult>('/api/me/earnings/payout', { method: 'POST', json: { instant } });

/** Stripe's instant payout fee: 1%, at least 50p. */
export const instantFeeFor = (amountPence: number): number =>
  Math.max(50, Math.ceil(amountPence * 0.01));

// ── The office ──────────────────────────────────────────────────────────────

export interface DriverBalance {
  driverId: number;
  name: string;
  connected: boolean;
  payoutsEnabled: boolean;
  balancePence: number;
}

export interface PaymentRow {
  bookingId: number;
  createdAt: string;
  service: string;
  price: number | null;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  amountPaidPence: number | null;
  platformFeePence: number | null;
  driverNetPence: number | null;
  refundedPence: number;
  driverName: string | null;
  depositPence?: number | null;
}

export interface PaymentsSummary {
  enabled: boolean;
  feePercent: number;
  cardTaken30DaysPence: number;
  platformFees30DaysPence: number;
  refunded30DaysPence: number;
  owedToDriversPence: number;
  owedByDriversPence: number;
  drivers: DriverBalance[];
  recent: PaymentRow[];
}

export const fetchPaymentsSummary = () => apiFetch<PaymentsSummary>('/api/admin/payments');

export const refundBooking = (bookingId: number, amountPence?: number) =>
  apiFetch<unknown>(`/api/admin/bookings/${bookingId}/refund`, {
    method: 'POST',
    json: { amountPence: amountPence ?? null },
  });

export const adjustDriverBalance = (
  driverId: number,
  body: { kind: 'settlement' | 'adjustment'; amountPence: number; note: string },
) =>
  apiFetch<DriverBalance>(`/api/admin/drivers/${driverId}/ledger`, { method: 'POST', json: body });

export const payAllDrivers = () =>
  apiFetch<{ drivers: number; transferredPence: number }>('/api/admin/payments/pay-drivers', {
    method: 'POST',
  });

// ── Wording ─────────────────────────────────────────────────────────────────

export const formatPence = (pence: number): string =>
  `${pence < 0 ? '−' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`;

/** Pounds for a customer: "£8", or "£8.50" when there are pence. */
export const formatPounds = (pence: number): string =>
  `£${(pence / 100).toFixed(2).replace(/\.00$/, '')}`;

/**
 * The split on a cash job, in pence: the platform's cut paid as a card
 * deposit, and the rest paid to the driver. Mirrors payments.deposit_for.
 */
export function cashSplit(pricePounds: number, feePercent: number) {
  const deposit = Math.round(pricePounds * feePercent);
  return { deposit, toDriver: pricePounds * 100 - deposit };
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  none: 'Pay the driver',
  requires_payment: 'Card not added',
  authorised: 'Card held',
  paid: 'Paid by card',
  deposit_paid: 'Deposit taken, rest in cash',
  paid_in_person: 'Paid to driver',
  failed: 'Card payment failed',
  cancelled: 'Hold released',
  refunded: 'Refunded',
  partly_refunded: 'Part refunded',
};

export const LEDGER_KIND_LABEL: Record<string, string> = {
  card_earning: 'Your share of a card job',
  cash_commission: 'Platform cut on a cash job',
  transfer: 'Sent to your Stripe balance',
  instant_fee: 'Instant payout fee',
  refund: 'Your share of a refund',
  settlement: 'Commission paid to the office',
  adjustment: 'Adjustment by the office',
};
