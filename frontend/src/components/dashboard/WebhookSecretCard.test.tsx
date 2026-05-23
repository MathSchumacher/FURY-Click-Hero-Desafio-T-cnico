import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookSecretCard } from './WebhookSecretCard';
import { ToastProvider } from '../ui/Toast/Toast';
import * as api from '../../lib/api';

function renderWithToast(ui: ReactElement): ReturnType<typeof render> {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/**
 * Specs do card de webhook secret.
 *
 * Fluxo principal validado:
 *   1. Estado inicial: secret hidden (massa de bullets) + botão "Revelar"
 *   2. Click "Revelar" → chama getWebhookSecret → mostra secret + instructions
 *   3. Click "Rotacionar" → confirma → chama rotateWebhookSecret → mostra novo
 *   4. Erro de backend → exibido inline (não silencia)
 */

describe('WebhookSecretCard', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getWebhookSecret').mockResolvedValue({
      secret: 'whk_initial_abc123',
      instructions: 'use HMAC-SHA256(...)',
    });
    vi.spyOn(api, 'rotateWebhookSecret').mockResolvedValue({
      secret: 'whk_rotated_xyz789',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('estado inicial: secret oculto, botão "Revelar secret" visível, sem chamar API', () => {
    renderWithToast(<WebhookSecretCard />);
    expect(screen.getByRole('button', { name: /revelar secret/i })).toBeInTheDocument();
    expect(screen.queryByText('whk_initial_abc123')).not.toBeInTheDocument();
    expect(api.getWebhookSecret).not.toHaveBeenCalled();
  });

  it('click "Revelar" chama getWebhookSecret e renderiza o secret + instructions', async () => {
    const user = userEvent.setup();
    renderWithToast(<WebhookSecretCard />);

    await user.click(screen.getByRole('button', { name: /revelar secret/i }));

    await waitFor(() => {
      expect(api.getWebhookSecret).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('whk_initial_abc123')).toBeInTheDocument();
    expect(screen.getByText(/use HMAC/i)).toBeInTheDocument();
  });

  it('erro 403 no fetch é mostrado inline (não derruba o componente)', async () => {
    vi.spyOn(api, 'getWebhookSecret').mockRejectedValueOnce(
      new Error('apenas OWNER pode visualizar'),
    );
    const user = userEvent.setup();
    renderWithToast(<WebhookSecretCard />);

    await user.click(screen.getByRole('button', { name: /revelar secret/i }));

    expect(await screen.findByText(/apenas OWNER pode visualizar/i)).toBeInTheDocument();
  });

  it('fluxo de rotação: confirma → rotateWebhookSecret → mostra novo secret', async () => {
    const user = userEvent.setup();
    renderWithToast(<WebhookSecretCard />);

    /* Primeiro revela */
    await user.click(screen.getByRole('button', { name: /revelar secret/i }));
    await screen.findByText('whk_initial_abc123');

    /* Clica em Rotacionar — entra em estado de confirmação */
    await user.click(screen.getByRole('button', { name: /rotacionar/i }));
    expect(
      screen.getByText(/o secret atual será invalidado/i),
    ).toBeInTheDocument();

    /* Confirma */
    await user.click(screen.getByRole('button', { name: /confirmar rotação/i }));

    await waitFor(() => {
      expect(api.rotateWebhookSecret).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('whk_rotated_xyz789')).toBeInTheDocument();
    /* Secret antigo desapareceu */
    expect(screen.queryByText('whk_initial_abc123')).not.toBeInTheDocument();
  });

  it('cancelar rotação volta pro estado revelado sem chamar API', async () => {
    const user = userEvent.setup();
    renderWithToast(<WebhookSecretCard />);

    await user.click(screen.getByRole('button', { name: /revelar secret/i }));
    await screen.findByText('whk_initial_abc123');
    await user.click(screen.getByRole('button', { name: /rotacionar/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(api.rotateWebhookSecret).not.toHaveBeenCalled();
    expect(screen.getByText('whk_initial_abc123')).toBeInTheDocument();
  });

  it('"Ocultar" colapsa o card de volta pro estado inicial', async () => {
    const user = userEvent.setup();
    renderWithToast(<WebhookSecretCard />);

    await user.click(screen.getByRole('button', { name: /revelar secret/i }));
    await screen.findByText('whk_initial_abc123');

    await user.click(screen.getByRole('button', { name: /ocultar/i }));

    expect(screen.queryByText('whk_initial_abc123')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revelar secret/i })).toBeInTheDocument();
  });
});
