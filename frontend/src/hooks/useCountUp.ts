import { useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../lib/gsap';

type Options = {
  /** Number to count up to. Renderer decides formatting. */
  to: number;
  /** Render the current value as a string (e.g. add suffix, format). */
  format?: (n: number) => string;
  /** Duration in seconds. */
  duration?: number;
  /** ScrollTrigger start. Default 'top 85%'. */
  start?: string;
};

export function useCountUp<T extends HTMLElement>({
  to,
  format = (n) => String(Math.round(n)),
  duration = 1.6,
  start = 'top 85%',
}: Options): React.RefObject<T> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (prefersReducedMotion()) {
      ref.current.textContent = format(to);
      return;
    }

    const obj = { v: 0 };
    const el = ref.current;
    el.textContent = format(0);

    const ctx = gsap.context(() => {
      gsap.to(obj, {
        v: to,
        duration,
        ease: 'power2.out',
        onUpdate: () => { el.textContent = format(obj.v); },
        scrollTrigger: { trigger: el, start, once: true },
      });
    }, ref);

    return () => ctx.revert();
  }, [to, format, duration, start]);

  return ref;
}
