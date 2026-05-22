import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';
import { useCountUp } from '../../hooks/useCountUp';

const REVIEWS = [
  {
    name: 'Rafael M.',
    role: 'Gestor de tráfego · agência',
    quote:
      'Tinha pesadelo com derrubada de anúncio. Em três meses de FURY, salvou 4 contas que eu não conseguiria salvar sozinho. Pra mim, pagou um ano em uma semana.',
    stars: 5,
    avatar: '/avatar1.webp',
  },
  {
    name: 'Carolina S.',
    role: 'CMO · e-commerce de moda',
    quote:
      'A diferença não é técnica. É de horário de sono. Dormimos melhor desde que ligamos. ROAS subiu 38% no primeiro trimestre só por não ter campanha parada.',
    stars: 5,
    avatar: '/avatar2.webp',
  },
  {
    name: 'Diego P.',
    role: 'Head de growth · DTC',
    quote:
      'Já tentei outras ferramentas de monitoria. Todas mandavam alerta. FURY é a única que age. Conta nossa nunca mais foi flagada.',
    stars: 5,
    avatar: '/avatar5.webp',
  },
];

function Stars({ count, size = 14 }: { count: number; size?: number }): JSX.Element {
  return (
    <span className="trustpilot__stars" aria-label={`${count} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`trustpilot__star ${i < count ? 'is-filled' : ''}`}
          aria-hidden="true"
        >
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
            fill="currentColor"
          />
        </svg>
      ))}
    </span>
  );
}

function RankNumber(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({ to: 4.9, format: (n) => n.toFixed(1) });
  return <span ref={ref} />;
}

function ReviewCount(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({
    to: 842,
    format: (n) => Math.round(n).toLocaleString('pt-BR'),
  });
  return <span ref={ref} />;
}

export function Trustpilot(): JSX.Element {
  return (
    <section className="trustpilot" id="avaliacoes">
      <div className="container">
        <header className="section-head">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
            Avaliações
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              Gestores que pararam de apagar incêndio.
            </SplitTextReveal>
          </h2>
        </header>

        <ScrollReveal className="trustpilot__rank" animation="fadeUp" duration={0.8}>
          <div className="trustpilot__rank-mark" aria-hidden="true">
            <span className="trustpilot__rank-mark-star">★</span>
            <span className="trustpilot__rank-mark-name mono">Trustscore</span>
          </div>
          <div className="trustpilot__rank-meta">
            <div className="trustpilot__rank-value gradient-text">
              <RankNumber />
              <span className="trustpilot__rank-of">/5</span>
            </div>
            <Stars count={5} size={22} />
            <p className="trustpilot__rank-count">
              Baseado em <strong><ReviewCount /></strong> avaliações verificadas
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal
          className="trustpilot__grid"
          animation="fadeUp"
          stagger={0.12}
          duration={0.75}
        >
          {REVIEWS.map((r) => (
            <article key={r.name} className="trustpilot__card">
              <Stars count={r.stars} />
              <p className="trustpilot__quote">"{r.quote}"</p>
              <div className="trustpilot__author">
                <img
                  src={r.avatar}
                  alt={`Foto de ${r.name}`}
                  className="trustpilot__avatar"
                  width={48}
                  height={48}
                  loading="lazy"
                />
                <div>
                  <div className="trustpilot__author-name">{r.name}</div>
                  <div className="trustpilot__author-role">{r.role}</div>
                </div>
                <span className="trustpilot__verified mono" title="Avaliação verificada">
                  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                    <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  verificado
                </span>
              </div>
            </article>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
