import { useEffect, useState } from 'react';

const TOTAL_MS = 3600;
const EXIT_MS = 900;
const SESSION_KEY = 'fury_splash_seen';

function shouldSkip(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export default function OpeningSplash(): JSX.Element | null {
  const [phase, setPhase] = useState<'mount' | 'exit' | 'gone'>('mount');
  const [skipped] = useState<boolean>(shouldSkip);

  useEffect(() => {
    if (skipped) {
      setPhase('gone');
      return;
    }

    /* Lock body scroll while splash is up */
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const exitT = window.setTimeout(() => setPhase('exit'), TOTAL_MS - EXIT_MS);
    const goneT = window.setTimeout(() => {
      setPhase('gone');
      document.body.style.overflow = prevOverflow;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* noop */ }
    }, TOTAL_MS);

    return () => {
      window.clearTimeout(exitT);
      window.clearTimeout(goneT);
      document.body.style.overflow = prevOverflow;
    };
  }, [skipped]);

  if (phase === 'gone') return null;

  return (
    <div
      className={`opening-splash ${phase === 'exit' ? 'is-exiting' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="opening-splash__ember opening-splash__ember--1" />
      <div className="opening-splash__ember opening-splash__ember--2" />
      <div className="opening-splash__ember opening-splash__ember--3" />
      <div className="opening-splash__glow" />
      <img
        src="/logo.webp"
        alt=""
        className="opening-splash__logo"
        width={930}
        height={571}
      />
    </div>
  );
}
