import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

export function PhoneAlert(): JSX.Element {
  return (
    <section className="phone-alert" id="protecao">
      <div className="phone-alert__bg" aria-hidden="true" />
      <div className="container phone-alert__grid">
        <div className="phone-alert__copy">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.55}>
            Você dorme. FURY trabalha.
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              Acorde com o problema já resolvido.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
            Não é mais um app de notificação pra te dar trabalho às 4h da
            manhã. É o oposto: você só recebe avisos do que <strong>já foi
            resolvido</strong>. O drama ficou pra trás. Vc vê o relatório
            calmo, no horário comercial.
          </ScrollReveal>

          <ScrollReveal
            as="ul"
            className="phone-alert__bullets"
            animation="fadeUp"
            stagger={0.1}
            duration={0.55}
            delay={0.25}
          >
            <li>
              <span className="phone-alert__bullet">✓</span>
              <span>Notificações apenas de ações já executadas</span>
            </li>
            <li>
              <span className="phone-alert__bullet">✓</span>
              <span>Resumo diário com o que FURY fez por você</span>
            </li>
            <li>
              <span className="phone-alert__bullet">✓</span>
              <span>Modo silencioso: 0 mensagem, 100% confiança</span>
            </li>
          </ScrollReveal>
        </div>

        <div className="phone-alert__visual">
          <ScrollReveal animation="scaleIn" duration={1.0}>
            <img
              src="/img5.webp"
              alt="Celular com app FURY mostrando 'Acorde tranquilo. Problema resolvido.' e resumo do que FURY corrigiu durante a madrugada"
              className="phone-alert__img"
              width={540}
              height={733}
              loading="lazy"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
