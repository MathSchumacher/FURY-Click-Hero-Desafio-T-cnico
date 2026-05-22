import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

export function PhoenixIntro(): JSX.Element {
  return (
    <section className="phoenix" id="quem-somos">
      <div className="phoenix__bg" aria-hidden="true" />
      <div className="container phoenix__grid">
        <div className="phoenix__copy">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
            Quem é FURY
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              A fênix que renasce sua campanha antes dela morrer.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
            Anúncio bom não cai por acaso — cai porque ninguém estava olhando
            na hora certa. FURY é a vigia incansável. Detecta o problema,
            classifica o risco e age sozinho. Você descobre quando abre o
            celular: o estrago já foi contido.
          </ScrollReveal>
          <ScrollReveal
            as="ul"
            className="phoenix__bullets"
            animation="fadeUp"
            stagger={0.1}
            duration={0.55}
            delay={0.25}
          >
            <li>
              <span className="phoenix__bullet-dot" />
              <strong>Vigilância 24/7</strong> — enquanto você dorme, FURY trabalha.
            </li>
            <li>
              <span className="phoenix__bullet-dot" />
              <strong>Resposta em segundos</strong> — não em horas como um humano.
            </li>
            <li>
              <span className="phoenix__bullet-dot" />
              <strong>Decisão automática</strong> — pausa, derruba, alerta. No tempo certo.
            </li>
          </ScrollReveal>
        </div>

        <div className="phoenix__visual">
          <ScrollReveal animation="scaleIn" duration={1.0}>
            <img
              src="/img4.webp"
              alt="Mascote fênix em chamas, asas abertas em pleno voo"
              className="phoenix__img"
              width={520}
              height={520}
              loading="lazy"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
