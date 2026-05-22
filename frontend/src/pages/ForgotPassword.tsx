import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthField } from '../components/auth/AuthField';
import { requestPasswordReset } from '../lib/auth';

export default function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Esqueci a senha"
      title={
        <>
          Vamos <span className="gradient-text">reacender</span>.
        </>
      }
      subtitle="Insira seu email e mandamos um link pra você definir uma nova senha. O link expira em 1 hora e só pode ser usado uma vez."
      footer={
        <>
          Lembrou? <Link to="/login">Voltar pro login</Link>
        </>
      }
    >
      {done ? (
        <div className="auth-form" role="status">
          <div
            style={{
              padding: '20px 18px',
              background: 'rgba(43, 210, 121, 0.10)',
              border: '1px solid rgba(43, 210, 121, 0.35)',
              borderRadius: 8,
              color: '#6fe2a4',
              fontSize: '0.92rem',
              lineHeight: 1.55,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 6 }}>Pedido recebido.</strong>
            Se houver uma conta com esse email, enviamos instruções com um link de redefinição.
            Verifique sua caixa de entrada (e o spam) nos próximos minutos.
          </div>
          <Link to="/login" className="btn btn--ghost btn--lg auth-form__submit">
            Voltar pro login
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <AuthField
            label="Email da conta"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="você@empresa.com"
            autoComplete="email"
            required
            icon={
              <svg viewBox="0 0 16 16" width="16" height="16">
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="10"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M2 4l6 5 6-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />

          {error && (
            <div className="auth-form__error" role="alert">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 4v5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--lg auth-form__submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="auth-form__spin" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              <>Enviar link de redefinição</>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
