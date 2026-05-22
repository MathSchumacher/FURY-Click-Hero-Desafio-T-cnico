import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/gsap';

type Props = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  splitBy?: 'words' | 'chars';
  staggerAmount?: number;
  duration?: number;
  delay?: number;
  /** When true, animates via ScrollTrigger instead of on mount. */
  scrollTrigger?: boolean;
  start?: string;
};

function splitText(node: HTMLElement, by: 'words' | 'chars'): HTMLElement[] {
  const text = node.textContent ?? '';
  node.textContent = '';
  const out: HTMLElement[] = [];

  if (by === 'words') {
    text.split(/(\s+)/).forEach((part) => {
      if (/^\s+$/.test(part)) {
        node.appendChild(document.createTextNode(part));
        return;
      }
      const span = document.createElement('span');
      span.className = 'split-word';
      span.style.display = 'inline-block';
      span.style.willChange = 'transform, opacity';
      span.textContent = part;
      node.appendChild(span);
      out.push(span);
    });
  } else {
    for (const ch of text) {
      if (ch === ' ') {
        node.appendChild(document.createTextNode(' '));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'split-char';
      span.style.display = 'inline-block';
      span.style.willChange = 'transform, opacity';
      span.textContent = ch;
      node.appendChild(span);
      out.push(span);
    }
  }

  return out;
}

export function SplitTextReveal({
  as: Tag = 'span',
  className,
  children,
  splitBy = 'words',
  staggerAmount = 0.04,
  duration = 0.9,
  delay = 0,
  scrollTrigger: useScrollTrigger = false,
  start = 'top 82%',
}: Props): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (prefersReducedMotion()) return;

    const parts = splitText(ref.current, splitBy);
    if (parts.length === 0) return;

    const ctx = gsap.context(() => {
      const baseVars = {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration,
        delay,
        ease: 'expo.out' as const,
        stagger: staggerAmount,
        onComplete: () => parts.forEach((p) => (p.style.willChange = 'auto')),
      };

      gsap.set(parts, { opacity: 0, y: 36, rotateX: -28, transformOrigin: '50% 100% -10px' });

      if (useScrollTrigger) {
        gsap.to(parts, {
          ...baseVars,
          scrollTrigger: { trigger: ref.current, start, once: true },
        });
      } else {
        gsap.to(parts, baseVars);
      }
    }, ref);

    return () => ctx.revert();
  }, [splitBy, staggerAmount, duration, delay, useScrollTrigger, start]);

  return (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} style={{ perspective: '600px' }}>
      {children}
    </Tag>
  );
}
