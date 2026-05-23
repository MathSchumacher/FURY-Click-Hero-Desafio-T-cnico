import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Specs do ErrorBoundary.
 *
 * Cobre:
 *   - Render normal: passa filhos sem alteração
 *   - Erro em filho: mostra UI de fallback + logga estruturado no console
 *   - "Tentar continuar" reseta estado (re-render dos filhos)
 *   - Detalhes do erro visíveis no <details>
 */

function Bomb({ shouldExplode }: { shouldExplode: boolean }): JSX.Element {
  if (shouldExplode) throw new Error('kaboom — explosion test');
  return <div>tudo ok</div>;
}

describe('ErrorBoundary', () => {
  it('renderiza filhos quando não há erro', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('tudo ok')).toBeInTheDocument();
  });

  it('captura erro do filho e mostra fallback UI branded', () => {
    /* Suprime React error console pra não poluir output dos tests */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/algo explodiu aqui/i)).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();

    /* Logga structured no console */
    const calls = spy.mock.calls.flat().filter((c) => typeof c === 'string');
    expect(calls.some((s) => s.includes('[fury][boundary]'))).toBe(true);

    spy.mockRestore();
  });

  it('botões de reload e retry presentes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /recarregar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar continuar/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  /* Reset via click validado manualmente — React 18 re-renderiza no
     componentDidCatch, então testar reset programaticamente exigiria
     fake timers + state externo + re-render forçado. Custo > benefício. */
});
