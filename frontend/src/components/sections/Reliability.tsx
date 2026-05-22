import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';
import { useCountUp } from '../../hooks/useCountUp';

function MetricUptime(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({
    to: 99.95,
    duration: 1.8,
    format: (n) => `${n.toFixed(2)}%`,
  });
  return <span ref={ref} />;
}

function MetricLatency(): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({
    to: 1.4,
    duration: 1.4,
    format: (n) => `${n.toFixed(1)}s`,
  });
  return <span ref={ref} />;
}

const ITEMS: Array<{ value: JSX.Element; label: string; detail: string }> = [
  {
    value: <>3 tentativas</>,
    label: 'Antes de declarar falha real',
    detail: 'Reconnects, retries, fallback de rota',
  },
  {
    value: <>Tenant isolado</>,
    label: 'Sua conta nunca encosta na do vizinho',
    detail: 'Dados, filas e logs separados',
  },
  {
    value: <><MetricUptime /></>,
    label: 'Disponibilidade da plataforma',
    detail: 'Multi-AZ, persistência redundante',
  },
  {
    value: <><MetricLatency /></>,
    label: 'Tempo médio até a primeira ação',
    detail: 'Da detecção ao primeiro movimento',
  },
];

export function Reliability(): JSX.Element {
  return (
    <section className="section reliability" id="confianca">
      <div className="container">
        <div className="reliability__grid">
          <header className="reliability__copy">
            <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
              Por que confiar
            </ScrollReveal>
            <h2 className="h-display">
              <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
                Engenharia paranoica para você dormir.
              </SplitTextReveal>
            </h2>
            <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
              FURY foi feito por gente que já teve campanha derrubada à 3h da
              manhã. Cada decisão de arquitetura existe pra essa hora não
              voltar mais — pra você nem pra ninguém.
            </ScrollReveal>
          </header>

          <ScrollReveal
            as="ul"
            className="reliability__metrics"
            animation="fadeUp"
            stagger={0.1}
            duration={0.65}
          >
            {ITEMS.map((r, i) => (
              <li key={i} className="reliability__metric">
                <div className="reliability__metric-value gradient-text">{r.value}</div>
                <div className="reliability__metric-label">{r.label}</div>
                <div className="reliability__metric-detail mono">{r.detail}</div>
              </li>
            ))}
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
