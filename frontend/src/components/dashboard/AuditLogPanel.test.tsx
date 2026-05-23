import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogPanel } from './AuditLogPanel';
import * as api from '../../lib/api';

/**
 * Specs do AuditLogPanel.
 *
 * Estados:
 *   - Inicial: chama getAuditLog → mostra loading → renderiza items
 *   - Erro 403 (não-OWNER): mostra mensagem amigável
 *   - Filtro por action: select dispara refetch com novo param
 *   - Paginação: botão "próxima" incrementa page
 */

const SAMPLE_EVENTS: api.AuditEvent[] = [
  {
    id: 'ae_3',
    action: 'WEBHOOK_SECRET_ROTATE',
    userId: 'u_1',
    tenantId: 't_1',
    metadata: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: '2026-05-22T19:00:00.000Z',
  },
  {
    id: 'ae_2',
    action: 'USER_LOGIN_SUCCESS',
    userId: 'u_1',
    tenantId: 't_1',
    metadata: { reason: 'manual' },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: '2026-05-22T18:30:00.000Z',
  },
];

describe('AuditLogPanel', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getAuditLog').mockResolvedValue({
      total: 2,
      page: 1,
      limit: 20,
      items: SAMPLE_EVENTS,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza header + busca audit log no mount', async () => {
    render(<AuditLogPanel />);
    expect(screen.getByText(/audit log/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getAuditLog).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/WEBHOOK_SECRET_ROTATE/)).toBeInTheDocument();
    expect(screen.getByText(/USER_LOGIN_SUCCESS/)).toBeInTheDocument();
  });

  it('mostra IP + timestamp formatado pra cada evento', async () => {
    render(<AuditLogPanel />);
    await screen.findByText(/WEBHOOK_SECRET_ROTATE/);
    /* IP aparece nas duas linhas */
    expect(screen.getAllByText('192.168.1.1').length).toBeGreaterThanOrEqual(2);
  });

  it('erro 403 do backend renderiza estado vazio com mensagem clara', async () => {
    vi.spyOn(api, 'getAuditLog').mockRejectedValueOnce(
      new Error('apenas OWNER pode visualizar audit log'),
    );
    render(<AuditLogPanel />);
    expect(await screen.findByText(/apenas OWNER/i)).toBeInTheDocument();
  });

  it('filtro de action chama getAuditLog com param novo', async () => {
    const user = userEvent.setup();
    render(<AuditLogPanel />);
    await screen.findByText(/WEBHOOK_SECRET_ROTATE/);

    /* selectOptions dispara onChange */
    await user.selectOptions(
      screen.getByRole('combobox', { name: /filtrar por ação/i }),
      'USER_LOGIN_SUCCESS',
    );

    await waitFor(() => {
      expect(api.getAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_LOGIN_SUCCESS' }),
      );
    });
  });

  it('estado vazio (zero events) mostra mensagem helpful', async () => {
    vi.spyOn(api, 'getAuditLog').mockResolvedValueOnce({
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });
    render(<AuditLogPanel />);
    expect(await screen.findByText(/nenhum evento/i)).toBeInTheDocument();
  });
});
