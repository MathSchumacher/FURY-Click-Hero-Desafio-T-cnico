import { useState, type FormEvent, type JSX } from 'react';
import { changePassword } from '../../lib/api';
import { useToast } from '../ui/Toast/Toast';
import './AccountSettingsCard.css';

/**
 * Card de account settings: info do user + change password + logout.
 *
 * Validações client-side mínimas (UX) — backend é a fonte de verdade:
 *   - current/new/confirm não-vazios
 *   - new precisa ter 8+ chars (mesmo do backend)
 *   - confirm tem que bater com new
 *
 * Após sucesso: limpa form + toast.success. Após erro: toast.error +
 * mensagem inline persistente pro user re-tentar.
 */

type Props = {
  user: { id: string; name: string; email: string };
  onLogout: () => void;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function AccountSettingsCard({ user, onLogout }: Props): JSX.Element {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter ao menos 8 caracteres');
      return;
    }
    if (newPassword !== confirm) {
      setError('Senhas não conferem — verifique a confirmação');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrent('');
      setNew('');
      setConfirm('');
      toast.success('Senha alterada com sucesso');
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="acctset" aria-labelledby="acctset-title">
      <header className="acctset__head">
        <h3 id="acctset-title" className="acctset__title">
          <span aria-hidden="true">⚙</span>
          Conta
        </h3>
      </header>

      <div className="acctset__user">
        <div className="acctset__avatar" aria-hidden="true">{initials(user.name)}</div>
        <div className="acctset__user-info">
          <p className="acctset__user-name">{user.name}</p>
          <p className="acctset__user-email">{user.email}</p>
        </div>
      </div>

      <div className="acctset__section">
        <h4 className="acctset__section-title">Alterar senha</h4>
        <form className="acctset__form" onSubmit={onSubmit} noValidate>
          <div className="acctset__field">
            <label className="acctset__label" htmlFor="acctset-current">Senha atual</label>
            <input
              id="acctset-current"
              className="acctset__input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => { setCurrent(e.target.value); }}
              required
            />
          </div>
          <div className="acctset__field">
            <label className="acctset__label" htmlFor="acctset-new">Nova senha</label>
            <input
              id="acctset-new"
              className="acctset__input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => { setNew(e.target.value); }}
              minLength={8}
              required
            />
          </div>
          <div className="acctset__field">
            <label className="acctset__label" htmlFor="acctset-confirm">Confirmar nova senha</label>
            <input
              id="acctset-confirm"
              className="acctset__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); }}
              required
            />
          </div>

          {error && <div className="acctset__error" role="alert">{error}</div>}

          <div className="acctset__actions">
            <button
              type="button"
              className="acctset__btn acctset__btn--danger"
              onClick={onLogout}
            >
              Sair da conta
            </button>
            <button
              type="submit"
              className="acctset__btn acctset__btn--primary"
              disabled={submitting || !currentPassword || !newPassword || !confirm}
            >
              {submitting ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
