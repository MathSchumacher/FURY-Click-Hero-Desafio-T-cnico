import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';
import { useCountUp } from '../../hooks/useCountUp';
import { LiveDashboard } from './LiveDashboard';

function MetricRoas(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({ to: 47, format: (n) => `+${Math.round(n)}%` });
  return <span ref={ref} />;
}
function MetricSavings(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({
    to: 320,
    format: (n) => `R$${Math.round(n)}k`,
  });
  return <span ref={ref} />;
}
function MetricResponse(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({
    to: 1.4,
    format: (n) => `${n.toFixed(1)}s`,
  });
  return <span ref={ref} />;
}

const CASES = [
  {
    metric: <MetricRoas />,
    label: 'em ROAS médio',
    detail: 'E-commerce de moda, R$200k/mês investidos',
  },
  {
    metric: <MetricSavings />,
    label: 'salvos em 90 dias',
    detail: 'Agência com 12 contas sob gestão',
  },
  {
    metric: <MetricResponse />,
    label: 'tempo médio de reação',
    detail: 'Contra ~6h de resposta humana manual',
  },
];

export function Results(): JSX.Element {
  return (
    <section className="results" id="resultados">
      <div className="results__bg" aria-hidden="true" />
      <div className="container">
        <div className="results__head">
          <div className="results__intro">
            <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
              Resultados reais
            </ScrollReveal>
            <h2 className="h-display">
              <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
                Visibilidade cresce quando o anúncio não cai.
              </SplitTextReveal>
            </h2>
            <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
              Quem fica no ar, escala. Quem é derrubado, paga pra recomeçar do
              zero. Os números abaixo são de clientes que pararam de apagar
              incêndio e voltaram a vender.
            </ScrollReveal>
          </div>
          <ScrollReveal animation="scaleIn" duration={1.0} delay={0.2}>
            <img
              src="/img3.webp"
              alt="Flecha de fogo subindo, representando crescimento de campanhas"
              className="results__arrow"
              width={420}
              height={300}
              loading="lazy"
            />
          </ScrollReveal>
        </div>

        <ScrollReveal
          className="results__grid"
          animation="fadeUp"
          stagger={0.12}
          duration={0.7}
        >
          {CASES.map((c, i) => (
            <article key={i} className="results__card">
              <div className="results__card-value gradient-text">{c.metric}</div>
              <div className="results__card-label">{c.label}</div>
              <div className="results__card-detail mono">{c.detail}</div>
            </article>
          ))}
        </ScrollReveal>

        <ScrollReveal as="div" className="results__live" animation="fadeUp" duration={0.9} delay={0.2}>
          <LiveDashboard />
        </ScrollReveal>
      </div>
    </section>
  );
}
