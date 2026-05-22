import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

const DORES = [
  { metric: 'Horas', value: '6h+', label: 'até alguém perceber o problema' },
  { metric: 'Receita', value: 'R$10k+', label: 'queimados em campanha pausada' },
  { metric: 'Risco', value: 'BM', label: 'flag ou conta bloqueada' },
  { metric: 'Confiança', value: 'Marca', label: 'exposição em brand safety' },
] as const;

export function Problem(): JSX.Element {
  return (
    <section className="section problem" id="problem">
      <div className="container">
        <header className="section-head section-head--left">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.6}>
            O problema
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.045}>
              Quando você descobre, o estrago já está feito.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.18}>
            Anúncio derrubado às 3h da manhã. Política violada num criativo
            recém-publicado. Conta flagada por reclamação. O comum é: você
            descobre horas depois — e até lá, o prejuízo virou padrão.
          </ScrollReveal>
        </header>

        <ScrollReveal
          className="problem__grid"
          animation="fadeUp"
          stagger={0.1}
          duration={0.75}
        >
          {DORES.map((c) => (
            <div key={c.label} className="problem__card">
              <div className="problem__card-metric mono">{c.metric}</div>
              <div className="problem__card-value">{c.value}</div>
              <div className="problem__card-label">{c.label}</div>
            </div>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
