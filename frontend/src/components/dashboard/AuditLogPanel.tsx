import { useCallback, useEffect, useState, type JSX } from 'react';
import { getAuditLog, type AuditEvent } from '../../lib/api';
import { FuryLoader } from '../ui/FuryLoader/FuryLoader';
import './AuditLogPanel.css';

/**
 * Audit log viewer (OWNER-only no backend).
 *
 * UX:
 *   - Filtro por action (dropdown)
 *   - Visualização leve: action + IP + timestamp + metadata resumido
 *   - Events de segurança (rotação de secret, password change, role change)
 *     ganham borda vermelha; resto azul
 *   - Erros não-OWNER renderizam mensagem clara sem quebrar a página
 */

const ACTION_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'USER_LOGIN_SUCCESS', label: 'Login bem-sucedido' },
  { value: 'USER_LOGIN_FAIL', label: 'Login falhou' },
  { value: 'USER_REGISTER', label: 'Registro' },
  { value: 'USER_LOGOUT', label: 'Logout' },
  { value: 'USER_PASSWORD_RESET_REQUEST', label: 'Pedido reset senha' },
  { value: 'USER_PASSWORD_RESET_COMPLETE', label: 'Reset concluído' },
  { value: 'USER_GOOGLE_SIGNUP', label: 'Cadastro via Google' },
  { value: 'USER_GOOGLE_LINK', label: 'Conta linkada ao Google' },
  { value: 'WEBHOOK_SECRET_ROTATE', label: 'Webhook secret rotacionado' },
  { value: 'TENANT_CREATE', label: 'Workspace criado' },
  { value: 'MEMBERSHIP_ROLE_CHANGE', label: 'Mudança de role' },
];

/* Actions consideradas "security-sensitive" — destacadas em vermelho */
const SECURITY_ACTIONS = new Set([
  'WEBHOOK_SECRET_ROTATE',
  'USER_PASSWORD_CHANGE',
  'USER_PASSWORD_RESET_COMPLETE',
  'MEMBERSHIP_ROLE_CHANGE',
  'MEMBERSHIP_REMOVE',
  'USER_LOGIN_FAIL',
]);

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  return `${Math.floor(hr / 24)}d atrás`;
}

function metaSummary(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const obj = metadata as Record<string, unknown>;
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}

export function AuditLogPanel(): JSX.Element {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string>('');

  const fetch = useCallback(async (filter: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLog(filter ? { action: filter, limit: 20 } : { limit: 20 });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError((err as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(action);
  }, [action, fetch]);

  return (
    <section className="audlog" aria-labelledby="audlog-title">
      <header className="audlog__head">
        <h3 id="audlog-title" className="audlog__title">
          <span aria-hidden="true">📋</span>
          Audit log
        </h3>
        <div className="audlog__filter">
          <label htmlFor="audlog-action">Filtrar por ação</label>
          <select
            id="audlog-action"
            className="audlog__select"
            value={action}
            onChange={(e) => { setAction(e.target.value); }}
            aria-label="Filtrar por ação"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="audlog__error" role="alert">
          {error}
        </div>
      )}

      {!error && loading && (
        <div style={{ padding: '24px 0' }}>
          <FuryLoader fullscreen={false} label="carregando audit" />
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="audlog__empty">
          Nenhum evento encontrado{action ? ` pra "${action}"` : ''} ainda. Eventos
          aparecem aqui à medida que ações sensíveis acontecem no workspace.
        </div>
      )}

      {!error && !loading && items.length > 0 && (
        <>
          <ul className="audlog__list">
            {items.map((evt) => {
              const isSec = SECURITY_ACTIONS.has(evt.action);
              const summary = metaSummary(evt.metadata);
              return (
                <li
                  key={evt.id}
                  className={`audlog__item ${isSec ? 'audlog__item--security' : ''}`}
                >
                  <span className="audlog__action">{evt.action}</span>
                  <span className="audlog__meta">{summary || '—'}</span>
                  <span className="audlog__ip">{evt.ipAddress ?? '—'}</span>
                  <span className="audlog__ts" title={evt.createdAt}>
                    {relativeTime(evt.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
          <footer className="audlog__footer">
            <span>{items.length} de {total} eventos</span>
            <span>OWNER only · append-only · IPs anonimizáveis sob LGPD</span>
          </footer>
        </>
      )}
    </section>
  );
}
