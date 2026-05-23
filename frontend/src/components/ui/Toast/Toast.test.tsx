import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

/**
 * Specs do sistema de toast.
 *
 * Strategy: timers reais (mais simples + sem race entre userEvent e
 * fake timers). Para testes de duração, passamos durations curtas (50ms).
 */

function ProbeButton({
  variant = 'success',
  message = 'feito',
  duration,
}: {
  variant?: 'success' | 'error' | 'info';
  message?: string;
  duration?: number;
}): JSX.Element {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast[variant](message, duration)}>
      fire
    </button>
  );
}

describe('useToast', () => {
  it('renderiza toast success quando chamado', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProbeButton variant="success" message="webhook secret rotacionado" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));

    expect(screen.getByText('webhook secret rotacionado')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('toast.error renderiza com role=alert (aria-live=assertive)', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProbeButton variant="error" message="falha ao rotacionar" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('falha ao rotacionar')).toBeInTheDocument();
  });

  it('auto-dismiss após duração configurada', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProbeButton variant="info" message="info msg" duration={50} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('info msg')).toBeInTheDocument();

    await waitFor(
      () => { expect(screen.queryByText('info msg')).not.toBeInTheDocument(); },
      { timeout: 500 },
    );
  });

  it('dismiss manual via botão close', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProbeButton variant="success" message="copiado" duration={60_000} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('copiado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dispensar/i }));

    expect(screen.queryByText('copiado')).not.toBeInTheDocument();
  });

  it('stack: múltiplos toasts coexistem', async () => {
    function Multi(): JSX.Element {
      const toast = useToast();
      return (
        <>
          <button type="button" onClick={() => toast.success('msg-um', 60_000)}>fire-1</button>
          <button type="button" onClick={() => toast.success('msg-dois', 60_000)}>fire-2</button>
          <button type="button" onClick={() => toast.success('msg-tres', 60_000)}>fire-3</button>
        </>
      );
    }
    const user = userEvent.setup();
    render(<ToastProvider><Multi /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'fire-1' }));
    await user.click(screen.getByRole('button', { name: 'fire-2' }));
    await user.click(screen.getByRole('button', { name: 'fire-3' }));

    expect(screen.getByText('msg-um')).toBeInTheDocument();
    expect(screen.getByText('msg-dois')).toBeInTheDocument();
    expect(screen.getByText('msg-tres')).toBeInTheDocument();
  });

  it('useToast fora do Provider → throws (programming error visível)', () => {
    /* Suprime o React error log esperado pra esse teste */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ProbeButton />)).toThrow(/ToastProvider/i);
    spy.mockRestore();
  });
});
