import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthField } from '../components/auth/AuthField';
import { resetPassword } from '../lib/auth';

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function scorePassword(pw: string): Strength {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^\w\s]/.test(pw)) s++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: 'muito fraca', color: 'var(--c-text-dim)' },
    1: { score: 1, label: 'fraca', color: '#ff3d2e' },
    2: { score: 2, label: 'razoável', color: '#f5b942' },
    3: { score: 3, label: 'forte', color: '#ff7a18' },
    4: { score: 4, label: 'muito forte', color: '#2bd279' },
  };
  return map[Math.min(s, 4) as 0 | 1 | 2 | 3 | 4] ?? map[0]!;
}

export default function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Link inválido — token ausente.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não batem.');
      return;
    }
    if (password.length < 8) {
      setError('Mínimo 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => nav('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        eyebrow="Link inválido"
        title={<>Sem token.</>}
        subtitle="O link de redefinição não tem o token. Solicite um novo."
        footer={
          <>
            <Link to="/auth/forgot-password">Pedir novo link</Link>
          </>
        }
      >
        <div />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Nova senha"
      title={
        <>
          Defina sua <span className="gradient-text">nova senha</span>.
        </>
      }
      subtitle="Escolha algo que você lembre. Vamos te logar automaticamente após confirmar."
      footer={
        <>
          <Link to="/login">Voltar pro login</Link>
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
            }}
          >
            <strong style={{ display: 'block', marginBottom: 6 }}>Senha redefinida.</strong>
            Redirecionando pro login…
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <AuthField
            label="Nova senha"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            required
            icon={
              <svg viewBox="0 0 16 16" width="16" height="16">
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            }
            hint={
              password.length > 0 && (
                <div className="strength" aria-live="polite">
                  <div className="strength__bars" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`strength__bar ${i < strength.score ? 'is-on' : ''}`}
                        style={{ background: i < strength.score ? strength.color : undefined }}
                      />
                    ))}
                  </div>
                  <span className="strength__label" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              )
            }
          />
          <AuthField
            label="Confirme a senha"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repita pra confirmar"
            autoComplete="new-password"
            required
            icon={
              <svg viewBox="0 0 16 16" width="16" height="16">
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
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
                Salvando…
              </>
            ) : (
              <>Salvar nova senha</>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
