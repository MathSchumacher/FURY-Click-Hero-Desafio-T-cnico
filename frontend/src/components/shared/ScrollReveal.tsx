import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/gsap';

type Animation = 'fadeUp' | 'fadeIn' | 'slideLeft' | 'slideRight' | 'scaleIn';

type Props = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  animation?: Animation;
  delay?: number;
  duration?: number;
  /** Stagger applied to DIRECT CHILDREN (in seconds). */
  stagger?: number;
  /** ScrollTrigger start position. Default 'top 82%'. */
  start?: string;
  /** When true, animation reverses on scroll back up. Default false (fires once). */
  toggleOnScroll?: boolean;
  /** Set to a number (0–1) to scrub-link to scroll. */
  scrub?: number | boolean;
};

const FROM: Record<Animation, gsap.TweenVars> = {
  fadeUp:     { opacity: 0, y: 36 },
  fadeIn:     { opacity: 0 },
  slideLeft:  { opacity: 0, x: -40 },
  slideRight: { opacity: 0, x: 40 },
  scaleIn:    { opacity: 0, scale: 0.92, y: 16 },
};

const TO: Record<Animation, gsap.TweenVars> = {
  fadeUp:     { opacity: 1, y: 0 },
  fadeIn:     { opacity: 1 },
  slideLeft:  { opacity: 1, x: 0 },
  slideRight: { opacity: 1, x: 0 },
  scaleIn:    { opacity: 1, scale: 1, y: 0 },
};

export function ScrollReveal({
  as: Tag = 'div',
  className,
  children,
  animation = 'fadeUp',
  delay = 0,
  duration = 0.85,
  stagger,
  start = 'top 82%',
  toggleOnScroll = false,
  scrub = false,
}: Props): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (prefersReducedMotion()) {
      const targets = stagger
        ? Array.from(ref.current.children)
        : [ref.current];
      gsap.set(targets, { ...TO[animation], clearProps: 'all' });
      return;
    }

    const ctx = gsap.context(() => {
      const targets = stagger
        ? Array.from(ref.current!.children)
        : ref.current!;

      gsap.fromTo(
        targets,
        { ...FROM[animation], willChange: 'opacity, transform' },
        {
          ...TO[animation],
          duration,
          delay,
          stagger,
          ease: scrub ? 'none' : 'power3.out',
          scrollTrigger: {
            trigger: ref.current,
            start,
            end: scrub ? 'bottom 60%' : undefined,
            scrub: scrub === true ? 0.6 : (scrub || false),
            toggleActions: toggleOnScroll ? 'play reverse play reverse' : 'play none none none',
            once: !toggleOnScroll && !scrub,
          },
          onComplete: () => {
            if (!stagger && ref.current) ref.current.style.willChange = 'auto';
          },
        },
      );
    }, ref);

    return () => ctx.revert();
  }, [animation, delay, duration, stagger, start, toggleOnScroll, scrub]);

  return (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className}>
      {children}
    </Tag>
  );
}
