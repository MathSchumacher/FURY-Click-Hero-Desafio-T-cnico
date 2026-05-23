import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';

/**
 * Error boundary global — pega exceptions render-time + lifecycle do React
 * (NÃO pega event handlers, async, ou erros do server). Sem ele, qualquer
 * exception não-capturada vira branco-de-morte.
 *
 * UX: tela de erro branded + botão de reload. Logs structured no console
 * pra debug. Em prod, integrar com Sentry/Datadog aqui.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[fury][boundary]', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="errboundary" role="alert" aria-live="assertive">
        <div className="errboundary__inner">
          <div className="errboundary__icon" aria-hidden="true">⚠</div>
          <h1 className="errboundary__title">Algo explodiu aqui</h1>
          <p className="errboundary__sub">
            Um erro inesperado interrompeu a renderização. Tente recarregar a página.
            Se persistir, abra o console (F12) e nos envie a mensagem de erro.
          </p>
          <details className="errboundary__details">
            <summary>Detalhes técnicos</summary>
            <code className="errboundary__msg">{this.state.error.message}</code>
          </details>
          <div className="errboundary__actions">
            <button type="button" className="errboundary__btn errboundary__btn--primary" onClick={this.reload}>
              Recarregar página
            </button>
            <button type="button" className="errboundary__btn" onClick={this.reset}>
              Tentar continuar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
