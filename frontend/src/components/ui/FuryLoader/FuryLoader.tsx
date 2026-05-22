import { useEffect, type JSX } from 'react';
import './FuryLoader.css';

type Props = {
  /** Texto monospace abaixo do reator. Default: "carregando". */
  label?: string;
  /** Esconde o label (loaders puramente visuais). */
  hideLabel?: boolean;
  /**
   * Fullscreen: overlay fixed cobrindo a viewport + lock de scroll do body.
   * Inline (false): reator pequeno + label menor, sem overlay.
   * Default: true.
   */
  fullscreen?: boolean;
};

/**
 * Loader oficial FURY — reator vermelho com arco orbital, anéis pulsantes,
 * brasas subindo e label mono. Pura CSS, sem deps externas.
 *
 * Uso:
 *   <FuryLoader />                                  // fullscreen, "carregando"
 *   <FuryLoader label="validando sessão" />
 *   <FuryLoader fullscreen={false} label="…" />     // inline pequeno
 *   <FuryLoader fullscreen={false} hideLabel />     // só o reator
 */
export function FuryLoader({
  label = 'carregando',
  hideLabel = false,
  fullscreen = true,
}: Props): JSX.Element {
  /* Lock scroll do body só quando fullscreen — evita layout shift do
     conteúdo atrás (que continua montado durante validação de sessão). */
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const cls = `fury-loader ${fullscreen ? 'fury-loader--fullscreen' : 'fury-loader--inline'}`;

  return (
    <div className={cls} role="status" aria-live="polite" aria-label={label}>
      <div className="fury-loader__stage">
        <span className="fury-loader__ring fury-loader__ring--outer" aria-hidden="true" />
        <span className="fury-loader__ring fury-loader__ring--mid" aria-hidden="true" />
        <span className="fury-loader__core" aria-hidden="true" />
        <svg className="fury-loader__arc" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="fury-loader-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#ff3d2e" />
              <stop offset="55%"  stopColor="#ff7a18" />
              <stop offset="100%" stopColor="#ffe1a0" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="44" />
        </svg>
        {fullscreen && (
          <div className="fury-loader__embers" aria-hidden="true">
            <span className="fury-loader__ember" />
            <span className="fury-loader__ember" />
            <span className="fury-loader__ember" />
          </div>
        )}
      </div>
      {!hideLabel && <div className="fury-loader__label">{label}</div>}
    </div>
  );
}
