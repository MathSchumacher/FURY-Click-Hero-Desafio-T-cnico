import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

export function Connections(): JSX.Element {
  return (
    <section className="connections" id="integracoes">
      <div className="container connections__grid">
        <div className="connections__visual">
          <ScrollReveal animation="scaleIn" duration={1.0}>
            <img
              src="/img7.webp"
              alt="Integração: Meta Ads, Google Ads e TikTok conectadas ao núcleo do FURY"
              className="connections__img"
              width={520}
              height={400}
              loading="lazy"
            />
          </ScrollReveal>
        </div>

        <div className="connections__copy">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
            Integrações
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              Conecta na sua stack em 5 minutos.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
            Sem migrar nada. Sem reescrever campanha. Você plugga sua conta
            de Meta, Google ou TikTok e a partir desse momento FURY já está
            de plantão.
          </ScrollReveal>
          <ScrollReveal
            as="div"
            className="connections__platforms"
            animation="fadeUp"
            stagger={0.08}
            duration={0.5}
            delay={0.25}
          >
            <span className="connections__platform">Meta Ads</span>
            <span className="connections__platform">Google Ads</span>
            <span className="connections__platform">TikTok Ads</span>
            <span className="connections__platform connections__platform--soon">+ em breve</span>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
