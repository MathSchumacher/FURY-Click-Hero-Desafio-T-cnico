import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

const LEVELS = [
  { name: 'BRASA', action: 'Apenas registrado', color: 'var(--c-sev-low)', desc: 'Aviso fraco. Anota no histórico, nada mais.', pulse: false },
  { name: 'FAÍSCA', action: 'Monitorado de perto', color: 'var(--c-sev-medium)', desc: 'Olho atento. Se o padrão se repetir, escala automaticamente.', pulse: false },
  { name: 'CHAMA', action: 'Ação programada', color: 'var(--c-sev-high)', desc: 'Risco real. FURY já dispara o procedimento de correção.', pulse: false },
  { name: 'INCÊNDIO', action: 'Reação imediata', color: 'var(--c-sev-critical)', desc: 'Ameaça crítica. Anúncio pausado ou derrubado em segundos. Sem espera.', pulse: true },
] as const;

export function Severity(): JSX.Element {
  return (
    <section className="section severity" id="intensidade">
      <div className="container">
        <header className="section-head">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
            Intensidade do fogo
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              Cada ameaça tem sua resposta exata.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
            Nem todo problema é incêndio. Mas todo incêndio começa numa
            faísca. FURY classifica a intensidade e age na medida — sem
            exagerar, sem ignorar.
          </ScrollReveal>
        </header>

        <ScrollReveal
          className="severity__grid"
          animation="scaleIn"
          stagger={0.1}
          duration={0.7}
        >
          {LEVELS.map((level) => (
            <article
              key={level.name}
              className={`severity__card ${level.pulse ? 'severity__card--pulse' : ''}`}
              style={{ '--card-color': level.color } as React.CSSProperties}
            >
              <div className="severity__pill">
                <span className="severity__pill-dot" />
                {level.name}
              </div>
              <h3 className="severity__action">{level.action}</h3>
              <p className="severity__desc">{level.desc}</p>
            </article>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
