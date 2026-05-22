import { Suspense, lazy, useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/gsap';
import { SplitTextReveal } from '../shared/SplitTextReveal';

const IconViewer = lazy(() => import('../three/IconViewer'));

type ProofKind = 'platforms' | 'lightning' | 'clock247' | 'shield';

const PROVA: ReadonlyArray<{ kind: ProofKind; label: string }> = [
  { kind: 'platforms', label: 'Conecta com Meta · Google · TikTok' },
  { kind: 'lightning', label: 'Reação em milissegundos' },
  { kind: 'clock247',  label: '24/7 sem você levantar do sofá' },
  { kind: 'shield',    label: 'Sua conta de anúncios protegida' },
];

/* ────────── Inline brand + utility icons ────────── */
const IconMeta = (): JSX.Element => (
  <svg className="hero__chip-logo" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="meta-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"  stopColor="#0064E0" />
        <stop offset="50%" stopColor="#0082FB" />
        <stop offset="100%" stopColor="#00C6FF" />
      </linearGradient>
    </defs>
    <path
      d="M12 4.5c-3.5 0-5.7 2.5-7.5 5.5C2.8 13 1.7 15 3.2 16.5c1 1 2.5.8 3.8-.5 1-1 2-2.4 3-4 .8 1.2 1.6 2.4 2.5 3.4 1.5 1.7 3 2.4 4.5 1.6 1.5-.8 2.3-2.5 1.8-4.5C18 9.5 16 4.5 12 4.5zm0 2.2c2.2 0 3.7 3 4.5 5.4.2.8 0 1.3-.5 1.5-.5.2-1.1-.1-1.8-1-1-1.2-2-2.7-2.8-4-1 1.7-2.1 3.3-3.2 4.4-.8.8-1.4 1-1.8.6-.4-.4-.3-1 .2-1.8C7.9 9 9.7 6.7 12 6.7z"
      fill="url(#meta-grad)"
    />
  </svg>
);

const IconGoogle = (): JSX.Element => (
  <svg className="hero__chip-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.5 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.22-4.74 3.22-8.07z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.86 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.36-2.12V7.04H2.18A11.02 11.02 0 0 0 1 12c0 1.78.42 3.46 1.18 4.96l3.68-2.84z" fill="#FBBC04"/>
    <path d="M12 5.35c1.61 0 3.06.55 4.2 1.64l3.15-3.15C17.45 2.07 14.96 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.68 2.84C6.72 7.28 9.14 5.35 12 5.35z" fill="#EA4335"/>
  </svg>
);

const IconTikTok = (): JSX.Element => (
  <svg className="hero__chip-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M16.6 5.82c-.95-.96-1.5-2.31-1.5-3.82h-3v13.67a2.67 2.67 0 1 1-2.67-2.66c.3 0 .59.05.86.13V9.97a5.74 5.74 0 0 0-.86-.07 5.84 5.84 0 1 0 5.84 5.84V8.7c1.15.83 2.55 1.31 4.03 1.31V7a4.85 4.85 0 0 1-2.7-1.18z"
      fill="#25F4EE" transform="translate(-1.2 0)" opacity="0.85"
    />
    <path
      d="M16.6 5.82c-.95-.96-1.5-2.31-1.5-3.82h-3v13.67a2.67 2.67 0 1 1-2.67-2.66c.3 0 .59.05.86.13V9.97a5.74 5.74 0 0 0-.86-.07 5.84 5.84 0 1 0 5.84 5.84V8.7c1.15.83 2.55 1.31 4.03 1.31V7a4.85 4.85 0 0 1-2.7-1.18z"
      fill="#FE2C55" transform="translate(1.2 0)" opacity="0.85"
    />
    <path
      d="M16.6 5.82c-.95-.96-1.5-2.31-1.5-3.82h-3v13.67a2.67 2.67 0 1 1-2.67-2.66c.3 0 .59.05.86.13V9.97a5.74 5.74 0 0 0-.86-.07 5.84 5.84 0 1 0 5.84 5.84V8.7c1.15.83 2.55 1.31 4.03 1.31V7a4.85 4.85 0 0 1-2.7-1.18z"
      fill="#fff"
    />
  </svg>
);

const IconLightning = (): JSX.Element => (
  <svg className="hero__chip-icon hero__chip-icon--lightning" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13 2 3 14h7v8l10-12h-7V2z" fill="currentColor"/>
  </svg>
);

const IconClock247 = (): JSX.Element => (
  <svg className="hero__chip-icon hero__chip-icon--clock" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.6"/>
    <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.35"/>
    <text
      x="16" y="19"
      textAnchor="middle"
      fontSize="8.5"
      fontWeight="800"
      fontFamily="'JetBrains Mono', monospace"
      fill="currentColor"
      letterSpacing="-0.3"
    >24/7</text>
  </svg>
);

const IconShield = (): JSX.Element => (
  <svg className="hero__chip-icon hero__chip-icon--shield" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 3 6v6c0 5.5 3.7 10.4 9 12 5.3-1.6 9-6.5 9-12V6l-9-4z"
          fill="rgba(255,61,46,0.15)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M8.5 12.5 11 15l4.5-4.5"
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function ProofIcon({ kind }: { kind: ProofKind }): JSX.Element {
  if (kind === 'platforms') {
    return (
      <span className="hero__chip-logos" aria-hidden="true">
        <IconMeta />
        <IconGoogle />
        <IconTikTok />
      </span>
    );
  }
  if (kind === 'lightning') return <IconLightning />;
  if (kind === 'clock247')  return <IconClock247 />;
  return <IconShield />;
}

export function Hero(): JSX.Element {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.set([
        '[data-hero-eyebrow]',
        '.hero__title-mark',
        '[data-hero-sub]',
        '[data-hero-cta] > *',
        '[data-hero-proof] > *',
        '[data-hero-visual]',
      ], { opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

      tl.fromTo('[data-hero-eyebrow]',
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55 },
      )
      .fromTo('.hero__title-mark',
        { opacity: 0, scale: 0.85, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 1.0, ease: 'expo.out' },
        0.65,
      )
      .fromTo('[data-hero-sub]',
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        0.6,
      )
      .fromTo('[data-hero-cta] > *',
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.08 },
        0.8,
      )
      .fromTo('[data-hero-proof] > *',
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.05 },
        1.0,
      )
      .fromTo('[data-hero-visual]',
        { x: 40, opacity: 0, scale: 0.94 },
        { x: 0, opacity: 1, scale: 1, duration: 1.1 },
        0.3,
      );

      gsap.to('.hero__bg-video', {
        yPercent: -12, opacity: 0.25, ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 0.4 },
      });
      gsap.to('.hero__orb--1', {
        yPercent: -35, ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 0.6 },
      });
      gsap.to('.hero__orb--2', {
        yPercent: -55, ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 0.8 },
      });
      /* NOTE: no scroll-linked opacity/translate on [data-hero-visual] —
         the 3D model must stay fully visible & interactive whenever the
         Hero section is on screen. Background parallax (video + orbs) is
         independent and stays. */
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section className="hero" ref={root} id="top">
      <video
        className="hero__bg-video"
        src="/background1dark.loop.mp4"
        autoPlay muted loop playsInline preload="auto"
        aria-hidden="true"
      />
      <div className="hero__bg-overlay" aria-hidden="true" />
      <div className="hero__bg-grid" aria-hidden="true" />
      <div className="hero__orb hero__orb--1" aria-hidden="true" />
      <div className="hero__orb hero__orb--2" aria-hidden="true" />

      <div className="container hero__inner">
        <div className="hero__copy">
          <h1 className="hero__title" data-hero-eyebrow>
            <span className="hero__title-line">
              <SplitTextReveal as="span" splitBy="words" staggerAmount={0.05} duration={0.9} delay={0.2}>
                Suas campanhas vivem do fogo.
              </SplitTextReveal>
            </span>
            <span className="hero__title-line hero__title-line--mark">
              <img
                src="/furytittle.webp"
                alt="FURY"
                className="hero__title-mark"
                width={483}
                height={122}
              />
              <SplitTextReveal
                as="span"
                className="hero__title-coda"
                splitBy="words"
                staggerAmount={0.05}
                duration={0.9}
                delay={0.7}
              >
                não deixa apagar.
              </SplitTextReveal>
            </span>
          </h1>

          <p className="lead hero__sub" data-hero-sub>
            Cada minuto com anúncio pausado é dinheiro queimado. FURY vigia
            suas campanhas 24/7 e age no instante em que algo ameaça travar
            seu ROAS — antes da Meta penalizar, antes do orçamento drenar,
            antes do seu time perceber.
          </p>

          <div className="hero__cta" data-hero-cta>
            <a href="#cta" className="btn btn--primary btn--lg">
              Acender minha proteção
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#como-funciona" className="btn btn--secondary btn--lg">
              Ver como funciona
            </a>
          </div>

          <ul className="hero__proof" data-hero-proof aria-label="Diferenciais">
            {PROVA.map(({ kind, label }) => (
              <li key={kind} className={`hero__chip hero__chip--${kind}`}>
                <ProofIcon kind={kind} />
                <span className="hero__chip-label">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero__visual" data-hero-visual data-cursor="grab">
          <div className="hero__visual-glow" aria-hidden="true" />
          <Suspense fallback={<div className="hero__visual-fallback" aria-hidden="true" />}>
            <IconViewer className="hero__visual-canvas" />
          </Suspense>
          <div className="hero__visual-ring hero__visual-ring--1" aria-hidden="true" />
          <div className="hero__visual-ring hero__visual-ring--2" aria-hidden="true" />
          <span className="hero__visual-hint mono" aria-hidden="true">arraste para girar</span>
        </div>
      </div>
    </section>
  );
}
