import { useState, type JSX } from 'react';
import { getWebhookSecret, rotateWebhookSecret } from '../../lib/api';
import { FuryLoader } from '../ui/FuryLoader/FuryLoader';
import './WebhookSecretCard.css';

/**
 * OWNER-only widget pra view/rotate do webhook secret do tenant.
 *
 * Estados:
 *   - hidden:     mostra bullets + "Revelar secret" (sem chamar API até clicar)
 *   - loading:    spinner inline enquanto fetcha
 *   - revealed:   secret monospace + copy + rotate + ocultar
 *   - confirming: "Tem certeza? O secret atual será invalidado."
 *   - error:      mensagem inline + estado anterior preservado
 *
 * Decisão UX: secret NÃO é mostrado por default (mesmo pra OWNER). Click
 * explícito reduz risco de shoulder-surfing + invalida screenshots casuais
 * do dashboard. Igual ao Stripe / GitHub Tokens.
 */

type View = 'hidden' | 'loading' | 'revealed' | 'confirming' | 'rotating';

export function WebhookSecretCard(): JSX.Element {
  const [view, setView] = useState<View>('hidden');
  const [secret, setSecret] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  async function handleReveal(): Promise<void> {
    setError(null);
    setView('loading');
    try {
      const data = await getWebhookSecret();
      setSecret(data.secret);
      setInstructions(data.instructions);
      setView('revealed');
    } catch (err) {
      setError((err as Error).message);
      setView('hidden');
    }
  }

  function handleHide(): void {
    setView('hidden');
    setSecret(null);
    setInstructions(null);
    setError(null);
    setCopyStatus('idle');
  }

  async function handleConfirmRotate(): Promise<void> {
    setError(null);
    setView('rotating');
    try {
      const data = await rotateWebhookSecret();
      setSecret(data.secret);
      setView('revealed');
      setCopyStatus('idle');
    } catch (err) {
      setError((err as Error).message);
      setView('revealed');
    }
  }

  async function handleCopy(): Promise<void> {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopyStatus('copied');
      setTimeout(() => { setCopyStatus('idle'); }, 1800);
    } catch {
      /* clipboard API pode falhar em http inseguro — fallback silencioso. */
    }
  }

  return (
    <section className="whks" aria-labelledby="whks-title">
      <header className="whks__head">
        <h3 id="whks-title" className="whks__title">
          <span className="whks__lock" aria-hidden="true">🔒</span>
          Webhook Secret
        </h3>
      </header>

      <p className="whks__sub">
        Credencial usada pra assinar requests recebidos em <code>POST /webhook/violation</code>.
        Cada workspace tem um secret único — gere o HMAC-SHA256 do body com ele e envie como{' '}
        <code>X-FURY-Signature</code>. Tratamento como senha: copie uma vez, armazene em vault, rotacione periodicamente.
      </p>

      {view === 'hidden' && (
        <div className="whks__hidden">
          <span className="whks__mask" aria-hidden="true">••••••••••••••••••••••••</span>
          <button
            type="button"
            className="whks__btn whks__btn--primary"
            onClick={() => void handleReveal()}
          >
            Revelar secret
          </button>
        </div>
      )}

      {view === 'loading' && (
        <div style={{ padding: '24px 0' }}>
          <FuryLoader fullscreen={false} label="carregando secret" />
        </div>
      )}

      {(view === 'revealed' || view === 'confirming' || view === 'rotating') && secret && (
        <>
          <div className="whks__secret-row">
            <code className="whks__secret">{secret}</code>
            {copyStatus === 'copied' && <span className="whks__copy-status">copiado</span>}
            <button
              type="button"
              className="whks__btn whks__btn--ghost"
              onClick={() => void handleCopy()}
              aria-label="Copiar secret"
              title="Copiar"
            >
              📋
            </button>
          </div>

          {instructions && <p className="whks__instructions">{instructions}</p>}

          {view === 'revealed' && (
            <div className="whks__actions">
              <button
                type="button"
                className="whks__btn whks__btn--danger"
                onClick={() => { setView('confirming'); }}
              >
                Rotacionar
              </button>
              <button
                type="button"
                className="whks__btn whks__btn--ghost"
                onClick={handleHide}
              >
                Ocultar
              </button>
            </div>
          )}

          {view === 'confirming' && (
            <div className="whks__confirm">
              <p className="whks__confirm-msg">
                <strong>O secret atual será invalidado.</strong> Qualquer cliente que
                ainda esteja assinando com o secret antigo vai parar de funcionar até
                ser atualizado. Tem certeza?
              </p>
              <div className="whks__actions">
                <button
                  type="button"
                  className="whks__btn whks__btn--danger"
                  onClick={() => void handleConfirmRotate()}
                >
                  Confirmar rotação
                </button>
                <button
                  type="button"
                  className="whks__btn whks__btn--ghost"
                  onClick={() => { setView('revealed'); }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {view === 'rotating' && (
            <div style={{ padding: '16px 0' }}>
              <FuryLoader fullscreen={false} label="rotacionando" />
            </div>
          )}
        </>
      )}

      {error && <div className="whks__error" role="alert">{error}</div>}
    </section>
  );
}
