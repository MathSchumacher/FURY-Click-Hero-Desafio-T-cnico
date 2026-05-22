export function Footer(): JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <div className="site-footer__brand-row">
            <img src="/icon.webp" alt="" width={64} height={64} className="site-footer__icon" />
            <img src="/furytittle.webp" alt="FURY" width={483} height={122} className="site-footer__wordmark" />
          </div>
          <p className="site-footer__tagline">
            Proteção autônoma para suas campanhas de tráfego pago.
            Você dorme. Sua conta não.
          </p>
        </div>

        <nav className="site-footer__cols" aria-label="Rodapé">
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Produto</h4>
            <a href="#como-funciona">Como funciona</a>
            <a href="#integracoes">Integrações</a>
            <a href="#intensidade">Intensidade do fogo</a>
            <a href="#resultados">Resultados reais</a>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Confiança</h4>
            <a href="#avaliacoes">Avaliações</a>
            <a href="#cta">Suporte</a>
            <a href="#cta">Segurança</a>
            <a href="#cta">LGPD</a>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Empresa</h4>
            <a href="#cta">Contato</a>
            <a href="#cta">Trabalhe conosco</a>
            <a href="#cta">Para devs</a>
            <a href="#cta">Termos</a>
          </div>
        </nav>
      </div>

      <div className="container site-footer__bottom">
        <span className="mono dim">© {year} FURY · Feito no Brasil 🔥</span>
        <span className="mono dim site-footer__build">todos os sistemas em chamas</span>
      </div>
    </footer>
  );
}
