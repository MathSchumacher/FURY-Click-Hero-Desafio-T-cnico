import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined' && !(window as unknown as { __furyGsapRegistered?: boolean }).__furyGsapRegistered) {
  gsap.registerPlugin(ScrollTrigger);
  (window as unknown as { __furyGsapRegistered?: boolean }).__furyGsapRegistered = true;
}

export { gsap, ScrollTrigger };

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
