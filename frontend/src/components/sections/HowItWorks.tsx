import { useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../../lib/gsap';
import { ScrollReveal } from '../shared/ScrollReveal';
import { SplitTextReveal } from '../shared/SplitTextReveal';

const STEPS = [
  {
    id: '01',
    title: 'Conecta',
    desc: 'Você pluga sua conta da Meta, Google ou TikTok em 5 minutos. Nada de migração, nada de reescrever campanha.',
    code: '5 minutos · 1 clique',
  },
  {
    id: '02',
    title: 'FURY vigia',
    desc: 'Cada criativo, cada conjunto, cada mudança é monitorada 24/7. Política, brand safety, performance — tudo na mira.',
    code: '24/7 · em tempo real',
  },
  {
    id: '03',
    title: 'FURY age',
    desc: 'Quando algo ameaça seu ROAS ou sua conta, a ação é automática. Pausa, derruba, alerta — sem esperar o time acordar.',
    code: 'reação em segundos',
  },
] as const;

export function HowItWorks(): JSX.Element {
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!lineRef.current) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(lineRef.current,
        { scaleX: 0, transformOrigin: 'left center' },
        {
          scaleX: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: lineRef.current,
            start: 'top 85%',
            end: 'top 55%',
            scrub: 0.4,
          },
        },
      );
    }, lineRef);

    return () => ctx.revert();
  }, []);

  return (
    <section className="section pipeline" id="como-funciona">
      <div className="container">
        <header className="section-head">
          <ScrollReveal as="span" className="eyebrow" animation="fadeUp" duration={0.6}>
            Como funciona
          </ScrollReveal>
          <h2 className="h-display">
            <SplitTextReveal splitBy="words" scrollTrigger staggerAmount={0.05}>
              Três passos. Zero esforço seu.
            </SplitTextReveal>
          </h2>
          <ScrollReveal as="p" className="lead" animation="fadeUp" duration={0.7} delay={0.15}>
            Você não vai mexer em painel, não vai responder alerta, não vai
            aprender ferramenta nova. FURY é o que acontece entre o problema
            e a solução — sem você no meio.
          </ScrollReveal>
        </header>

        <div className="pipeline__shell">
          <div className="pipeline__connector" ref={lineRef} aria-hidden="true" />
          <ScrollReveal
            as="ol"
            className="pipeline__steps pipeline__steps--3"
            animation="fadeUp"
            stagger={0.14}
            duration={0.75}
          >
            {STEPS.map((step) => (
              <li key={step.id} className="pipeline__step">
                <div className="pipeline__step-id mono">{step.id}</div>
                <h3 className="pipeline__step-title">{step.title}</h3>
                <p className="pipeline__step-desc">{step.desc}</p>
                <code className="pipeline__step-code mono">{step.code}</code>
              </li>
            ))}
          </ScrollReveal>
        </div>

        <ScrollReveal as="p" className="pipeline__tagline" animation="fadeUp" duration={0.8}>
          <span className="gradient-text">Você dorme. Sua campanha não morre.</span>
        </ScrollReveal>
      </div>
    </section>
  );
}
