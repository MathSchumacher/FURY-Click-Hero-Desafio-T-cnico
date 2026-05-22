import { useEffect, useRef, useState } from 'react';

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, [role="button"], [data-cursor="hover"]';
const GRAB_SELECTOR = '[data-cursor="grab"]';

/* Espelha a regra do FuryCursor.css: cursor custom só em desktop real.
 * - `any-pointer: coarse` detecta touch mesmo em devices híbridos
 *   (iPad com Pencil, Surface Pro) que mentem em `pointer: fine`.
 * - viewport <1024px elimina tablets pequenos em qualquer orientação. */
const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hasAnyTouch = window.matchMedia('(any-pointer: coarse)').matches;
  const isSmallScreen = window.matchMedia('(max-width: 1023px)').matches;
  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  return hasAnyTouch || isSmallScreen || !hasFinePointer;
};

export default function FuryCursor(): JSX.Element | null {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hoveringInteractive, setHoveringInteractive] = useState(false);
  const [hoveringGrab, setHoveringGrab] = useState(false);
  const touchOnly = isTouchDevice();

  useEffect(() => {
    if (touchOnly) return;

    const wrap = wrapRef.current;
    if (!wrap) return;

    let mouseX = -200;
    let mouseY = -200;

    const onMove = (e: MouseEvent): void => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      wrap.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
      if (!visible) setVisible(true);

      const target = e.target as HTMLElement | null;
      const isInteractive = !!target?.closest(INTERACTIVE_SELECTOR);
      const isGrab = !!target?.closest(GRAB_SELECTOR);
      setHoveringInteractive((prev) => (prev !== isInteractive ? isInteractive : prev));
      setHoveringGrab((prev) => (prev !== isGrab ? isGrab : prev));
    };

    const onDown = (): void => setPressed(true);
    const onUp = (): void => setPressed(false);
    const onLeave = (): void => setVisible(false);
    const onEnter = (): void => setVisible(true);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    /* ── Trail canvas (ember sparks fading behind cursor) ── */
    const canvas = trailRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    type Spark = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const sparks: Spark[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let paused = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = (): void => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let lastEmit = 0;

    const tick = (): void => {
      if (paused || !ctx || !canvas || reduce) {
        raf = requestAnimationFrame(tick);
        return;
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const now = performance.now();
      const interval = hoveringInteractive ? 35 : 55;
      if (visible && now - lastEmit > interval) {
        const count = hoveringInteractive ? 2 : 1;
        for (let i = 0; i < count; i++) {
          sparks.push({
            // emit offset under the cursor body (not on the tip)
            x: mouseX + 14 + (Math.random() - 0.5) * 12,
            y: mouseY + 22 + (Math.random() - 0.5) * 12,
            vx: (Math.random() - 0.5) * 0.7,
            vy: -0.5 + (Math.random() - 0.5) * 0.5,
            r: 1.2 + Math.random() * 1.8,
            a: hoveringInteractive ? 0.85 : 0.6,
          });
        }
        lastEmit = now;
        if (sparks.length > 100) sparks.splice(0, sparks.length - 100);
      }

      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if (!s) continue;
        s.x += s.vx;
        s.y += s.vy;
        s.a *= 0.94;
        s.r *= 0.985;
        if (s.a < 0.04) { sparks.splice(i, 1); continue; }

        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        grad.addColorStop(0, `rgba(255, 220, 130, ${s.a})`);
        grad.addColorStop(0.4, `rgba(255, 122, 24, ${s.a * 0.7})`);
        grad.addColorStop(1, 'rgba(255, 61, 46, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = (): void => {
      paused = document.hidden || !document.hasFocus();
    };
    const onBlur = (): void => { paused = true; };
    const onFocus = (): void => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [touchOnly, visible, hoveringInteractive, hoveringGrab]);

  if (touchOnly) return null;

  const state = [
    visible ? 'is-visible' : '',
    pressed ? 'is-pressed' : '',
    hoveringInteractive ? 'is-hover' : '',
    hoveringGrab ? 'is-grab' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <canvas ref={trailRef} className="fury-cursor__trail" aria-hidden="true" />
      <div ref={wrapRef} className={`fury-cursor ${state}`} aria-hidden="true">
        <span className="fury-cursor__halo" aria-hidden="true" />
        <span className="fury-cursor__ring" aria-hidden="true" />
        <span className="fury-cursor__orbit">
          <span className="fury-cursor__spark fury-cursor__spark--1" />
          <span className="fury-cursor__spark fury-cursor__spark--2" />
          <span className="fury-cursor__spark fury-cursor__spark--3" />
        </span>
        <span className="fury-cursor__pulse" aria-hidden="true" />
        <img
          src="/cursor.webp"
          alt=""
          className="fury-cursor__img"
          width={28}
          height={37}
          draggable={false}
        />
      </div>
    </>
  );
}
