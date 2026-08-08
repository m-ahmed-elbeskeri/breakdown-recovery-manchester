// Live dispatch metrics, provided via context so that only the small widgets
// that display them re-render on each update — not the entire landing page.
//
// This module intentionally exports both the provider component and its
// consumer hook, which is the idiomatic React context pattern.
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from './api';

export interface DispatchMetrics {
  driversAvailable: number;
  avgResponseMinutes: number;
  rescuesToday: number;
  /**
   * True only when these figures come from the real backend. When false the
   * numbers are representative/simulated, so the UI must not present them as
   * live real-time facts.
   */
  isLive: boolean;
}

// Keep these mutually consistent: a reader who divides rescues by drivers and
// gets an impossible number stops believing the response time too. ~4-5 jobs
// per driver per day is a full, credible shift.
const INITIAL: DispatchMetrics = {
  driversAvailable: 7,
  avgResponseMinutes: 24,
  rescuesToday: 32,
  isLive: false,
};

const POLL_MS = 15000;
const SIMULATE_MS = 6000;

const MetricsContext = createContext<DispatchMetrics>(INITIAL);

export function MetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<DispatchMetrics>(INITIAL);
  const liveRef = useRef(false);

  // Poll the backend for real figures. On success we mark the data live; on
  // failure we leave the simulated values in place (no false "live" claim).
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/metrics`);
        if (!res.ok) throw new Error(`metrics ${res.status}`);
        const data = (await res.json()) as Omit<DispatchMetrics, 'isLive'>;
        if (!active) return;
        liveRef.current = true;
        setMetrics({
          driversAvailable: data.driversAvailable,
          avgResponseMinutes: data.avgResponseMinutes,
          rescuesToday: data.rescuesToday,
          isLive: true,
        });
      } catch {
        /* backend unreachable — keep simulated values */
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Gently drift the simulated figures until (and unless) real data arrives.
  useEffect(() => {
    if (metrics.isLive) return;
    const tick = setInterval(() => {
      if (liveRef.current) return;
      setMetrics((prev) => ({
        ...prev,
        driversAvailable: clamp(prev.driversAvailable + step(), 3, 12),
        avgResponseMinutes: clamp(prev.avgResponseMinutes + step(), 18, 32),
        rescuesToday: prev.rescuesToday + (Math.random() > 0.7 ? 1 : 0),
      }));
    }, SIMULATE_MS);
    return () => clearInterval(tick);
  }, [metrics.isLive]);

  return <MetricsContext.Provider value={metrics}>{children}</MetricsContext.Provider>;
}

export const useMetrics = (): DispatchMetrics => useContext(MetricsContext);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const step = () => (Math.random() > 0.5 ? 1 : -1);
