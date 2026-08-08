import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useInView, useMotionValue } from 'motion/react';

const SMALL_SCREEN = '(max-width: 639px)';

const matchesSmallScreen = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(SMALL_SCREEN).matches;

/**
 * True on phone-sized viewports, where reveal-on-scroll is skipped entirely.
 * Flicking quickly down a phone screen outruns the 0.55s fade, so sections
 * land blank — which reads as a broken page to someone stranded and stressed.
 */
function useSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(matchesSmallScreen);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SMALL_SCREEN);
    const update = () => setIsSmall(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isSmall;
}

/**
 * Fades + lifts its children into view once, the first time they're scrolled to.
 * The lift is a transform, so `MotionConfig reducedMotion="user"` automatically
 * drops it (keeping just the fade) for visitors who prefer reduced motion.
 * On phones the content is rendered outright — see `useSmallScreen`.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const isSmall = useSmallScreen();

  if (isSmall) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up from zero to `value` when scrolled into view, then tracks live updates. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const mv = useMotionValue(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, mv]);

  useEffect(() => {
    return mv.on('change', (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
    });
  }, [mv]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
