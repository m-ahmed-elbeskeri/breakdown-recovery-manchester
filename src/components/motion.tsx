import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useInView, useMotionValue } from 'motion/react';

/**
 * Fades + lifts its children into view once, the first time they're scrolled to.
 * The lift is a transform, so `MotionConfig reducedMotion="user"` automatically
 * drops it (keeping just the fade) for visitors who prefer reduced motion.
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
