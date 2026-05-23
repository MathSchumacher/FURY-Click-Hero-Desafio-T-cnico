import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSettingsCard } from './AccountSettingsCard';
import { ToastProvider } from '../ui/Toast/Toast';
import * as api from '../../lib/api';

/**
 * Specs do AccountSettingsCard.
 *
 * Cobre:
 *   - Exibe user info (name + email) recebidos via props
 *   - Form de change-password: campos current + new + confirm
 *   - Confirm precisa bater com new (validação client-side)
 *   - Submit chama changePassword + mostra toast success
 *   - Erro do backend (senha errada) → toast.error
 *   - Botão "Sair" chama onLogout (que vem como prop)
 */

function renderWithToast(ui: ReactElement): ReturnType<typeof render> {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const PROPS = {
  user: { id: 'u_1', name: 'Matheus', email: 'm@a.com' },
  onLogout: vi.fn(),
};

describe('AccountSettingsCard', () => {
  beforeEach(() => {
    PROPS.onLogout.mockReset();
    vi.spyOn(api, 'changePassword').mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exibe nome + email do user', () => {
    renderWithToast(<AccountSettingsCard {...PROPS} />);
    expect(screen.getByText('Matheus')).toBeInTheDocument();
    expect(screen.getByText('m@a.com')).toBeInTheDocument();
  });

  it('submit do form chama changePassword com payload correto', async () => {
    const user = userEvent.setup();
    renderWithToast(<AccountSettingsCard {...PROPS} />);

    await user.type(screen.getByLabelText(/senha atual/i), 'oldpass1');
    await user.type(screen.getByLabelText(/^nova senha/i), 'newstrong8');
    await user.type(screen.getByLabelText(/confirmar/i), 'newstrong8');
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    await waitFor(() => {
      expect(api.changePassword).toHaveBeenCalledWith({
        currentPassword: 'oldpass1',
        newPassword: 'newstrong8',
      });
    });
  });

  it('confirm != new → mostra erro inline, NÃO chama changePassword', async () => {
    const user = userEvent.setup();
    renderWithToast(<AccountSettingsCard {...PROPS} />);

    await user.type(screen.getByLabelText(/senha atual/i), 'oldpass1');
    await user.type(screen.getByLabelText(/^nova senha/i), 'newstrong8');
    await user.type(screen.getByLabelText(/confirmar/i), 'different');
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    expect(api.changePassword).not.toHaveBeenCalled();
    expect(screen.getByText(/senhas não conferem/i)).toBeInTheDocument();
  });

  it('erro do backend é renderizado inline', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValueOnce(
      new Error('senha atual incorreta'),
    );
    const user = userEvent.setup();
    const { container } = renderWithToast(<AccountSettingsCard {...PROPS} />);

    await user.type(screen.getByLabelText(/senha atual/i), 'wrong');
    await user.type(screen.getByLabelText(/^nova senha/i), 'newstrong8');
    await user.type(screen.getByLabelText(/confirmar/i), 'newstrong8');
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    /* Toast ALSO renderiza a msg — escopamos no card inline pra ser específico */
    await waitFor(() => {
      const inlineError = container.querySelector('.acctset__error');
      expect(inlineError).not.toBeNull();
      expect(inlineError?.textContent).toMatch(/senha atual incorreta/i);
    });
  });

  it('botão "Sair da conta" chama onLogout', async () => {
    const user = userEvent.setup();
    renderWithToast(<AccountSettingsCard {...PROPS} />);

    await user.click(screen.getByRole('button', { name: /sair da conta/i }));
    expect(PROPS.onLogout).toHaveBeenCalledTimes(1);
  });

  it('clear form após sucesso', async () => {
    const user = userEvent.setup();
    renderWithToast(<AccountSettingsCard {...PROPS} />);

    await user.type(screen.getByLabelText(/senha atual/i), 'oldpass1');
    await user.type(screen.getByLabelText(/^nova senha/i), 'newstrong8');
    await user.type(screen.getByLabelText(/confirmar/i), 'newstrong8');
    await user.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/senha atual/i) as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText(/^nova senha/i) as HTMLInputElement).value).toBe('');
    });
  });
});
