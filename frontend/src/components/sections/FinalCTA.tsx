import { useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/gsap';
import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

export function FinalCTA(): JSX.Element {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.cta-band__ring--1',
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 80%', end: 'top 40%', scrub: 0.5 },
        });
      gsap.fromTo('.cta-band__ring--2',
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 80%', end: 'top 30%', scrub: 0.55 },
        });
      gsap.fromTo('.cta-band__ring--3',
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 80%', end: 'top 25%', scrub: 0.6 },
        });
      gsap.fromTo('.cta-band__glow',
        { opacity: 0.3 },
        { opacity: 1, ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 80%', end: 'top 45%', scrub: 0.4 },
        });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section className="section cta-band" id="cta" ref={root}>
      <div className="cta-band__bg" aria-hidden="true" />
      <div className="cta-band__glow" aria-hidden="true" />
      <div className="cta-band__ring cta-band__ring--1" aria-hidden="true" />
      <div className="cta-band__ring cta-band__ring--2" aria-hidden="true" />
      <div className="cta-band__ring cta-band__ring--3" aria-hidden="true" />
      <div className="cta-band__grid" aria-hidden="true" />

      <div className="container cta-band__inner">
        <h2 className="h-display cta-band__title">
          <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
            Pare de apagar incêndio.
          </SplitTextReveal>
          <br />
          <SplitTextReveal
            className="gradient-text"
            splitBy="words"
            scrollTrigger
            staggerAmount={0.05}
            delay={0.15}
          >
            Comece a vender em paz.
          </SplitTextReveal>
        </h2>

        <ScrollReveal as="p" className="lead cta-band__sub" animation="fadeUp" duration={0.7} delay={0.3}>
          Plugga em 5 minutos. Veja FURY trabalhar em 24h.
          Cancele quando quiser — só não vai querer.
        </ScrollReveal>

        <ScrollReveal
          className="cta-band__actions"
          animation="fadeUp"
          stagger={0.1}
          duration={0.6}
          delay={0.4}
        >
          <a href="mailto:contato@fury.dev?subject=Quero%20proteger%20minhas%20campanhas" className="btn btn--primary btn--lg">
            Quero acender agora
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#como-funciona" className="btn btn--secondary btn--lg">
            Ver como funciona antes
          </a>
        </ScrollReveal>

        <ScrollReveal as="ul" className="cta-band__guarantees" animation="fadeUp" stagger={0.08} duration={0.5} delay={0.55}>
          <li className="cta-band__guarantee">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Setup gratuito
          </li>
          <li className="cta-band__guarantee">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sem fidelidade
          </li>
          <li className="cta-band__guarantee">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Suporte humano em PT-BR
          </li>
        </ScrollReveal>
      </div>
    </section>
  );
}
