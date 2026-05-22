import { ScrollReveal } from '../shared/ScrollReveal';
import { useCountUp } from '../../hooks/useCountUp';

function Counter({ to, format }: { to: number; format: (n: number) => string }): JSX.Element {
  const ref = useCountUp<HTMLSpanElement>({ to, format, duration: 1.6 });
  return <span ref={ref} className="trust-bar__metric-value gradient-text" />;
}

export function TrustBar(): JSX.Element {
  return (
    <section className="trust-bar" aria-label="Prova social e conquistas">
      <div className="container trust-bar__inner">
        <ScrollReveal className="trust-bar__badges" animation="fadeUp" stagger={0.12} duration={0.7}>
          <img
            src="/img1.webp"
            alt="Três selos de segurança: escudo, verificação e raio"
            className="trust-bar__badge-img"
            width={340}
            height={180}
            loading="lazy"
          />
          <img
            src="/img6.webp"
            alt="Selo Top Performer 2026"
            className="trust-bar__ribbon-img"
            width={200}
            height={220}
            loading="lazy"
          />
        </ScrollReveal>

        <ScrollReveal className="trust-bar__metrics" animation="fadeUp" stagger={0.1} duration={0.7} delay={0.2}>
          <div className="trust-bar__metric">
            <Counter to={2400000} format={(n) => `R$${(n / 1000).toFixed(0)}k+`} />
            <span className="trust-bar__metric-label">salvos em campanhas</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__metric">
            <Counter to={840} format={(n) => `${Math.round(n)}+`} />
            <span className="trust-bar__metric-label">contas protegidas</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__metric">
            <Counter to={4.9} format={(n) => `${n.toFixed(1)}★`} />
            <span className="trust-bar__metric-label">avaliação média</span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
