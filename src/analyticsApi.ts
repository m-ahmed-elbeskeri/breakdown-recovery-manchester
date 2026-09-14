// The office's analytics, as the API returns them. Admin only.

import { apiFetch } from './apiClient';

export interface CountRow {
  label: string;
  count: number;
}

export interface Kpis {
  visitors: number;
  pageViews: number;
  pagesPerVisit: number;
  bounceRate: number;
  avgEngagedSeconds: number;
  bookings: number;
  bookingSessions: number;
  conversionRate: number;
  calls: number;
  callSessions: number;
  quotes: number;
  avgQuote: number | null;
  driverSignups: number;
  applicationsSent: number;
}

export interface SeriesPoint {
  label: string;
  visitors: number;
  pageViews: number;
  bookings: number;
  calls: number;
}

export interface PageRow {
  path: string;
  views: number;
  visitors: number;
  avgSeconds: number;
  avgScroll: number;
}

export interface OutcomeRow {
  label: string;
  sessions: number;
  bookings: number;
  calls: number;
  conversionRate: number;
}

export interface FunnelStep {
  name: string;
  label: string;
  sessions: number;
  pctOfEntry: number;
}

export interface Vital {
  name: string;
  p75: number | null;
  samples: number;
}

export interface TrackingStats {
  visits: number;
  cancelledOnline: number;
  ratings: number;
  avgRating: number | null;
}

export interface Analytics {
  days: number;
  generatedAt: string;
  hourly: boolean;
  current: Kpis;
  previous: Kpis;
  series: SeriesPoint[];
  pages: PageRow[];
  landingPages: OutcomeRow[];
  sources: OutcomeRow[];
  campaigns: OutcomeRow[];
  areas: OutcomeRow[];
  devices: CountRow[];
  browsers: CountRow[];
  screens: CountRow[];
  bookingFunnel: FunnelStep[];
  recruitFunnel: FunnelStep[];
  services: CountRow[];
  availabilityAtQuote: CountRow[];
  callPlacements: CountRow[];
  ctaClicks: CountRow[];
  linkClicks: CountRow[];
  outbound: CountRow[];
  faqs: CountRow[];
  findMe: CountRow[];
  tracking: TrackingStats;
  vitals: Vital[];
  errors: CountRow[];
  errorCount: number;
}

export interface LiveEvent {
  at: string;
  name: string;
  path: string;
  device: string | null;
  detail: string;
}

export interface LiveData {
  activeVisitors: number;
  pages: CountRow[];
  recent: LiveEvent[];
}

export const fetchAnalytics = (days: number) =>
  apiFetch<Analytics>(`/api/admin/analytics?days=${days}`);

export const fetchLive = () => apiFetch<LiveData>('/api/admin/analytics/live');
