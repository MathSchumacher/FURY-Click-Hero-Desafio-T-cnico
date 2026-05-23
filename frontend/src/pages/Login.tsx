import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthField } from '../components/auth/AuthField';
import { login, getGoogleSignInUrl } from '../lib/auth';
import { useToast } from '../components/ui/Toast/Toast';

export default function LoginPage(): JSX.Element {
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setRequestId(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Login bem-sucedido. Carregando dashboard…');
      nav('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setError(msg);
      const rid = (err as { requestId?: string }).requestId;
      if (typeof rid === 'string') setRequestId(rid);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Entrar"
      title={<>Bem-vindo de volta ao <span className="gradient-text">FURY</span>.</>}
      subtitle="Suas campanhas continuam sob vigilância. Acesse pra ver o que aconteceu enquanto você esteve fora."
      footer={
        <>Ainda não tem conta? <Link to="/register">Criar conta grátis</Link></>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="você@empresa.com"
          autoComplete="email"
          required
          icon={
            <svg viewBox="0 0 16 16" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 4l6 5 6-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          }
        />
        <AuthField
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          icon={
            <svg viewBox="0 0 16 16" width="16" height="16">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          }
        />

        <div className="auth-form__row">
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="check__box" aria-hidden="true">
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span>Lembrar de mim</span>
          </label>
          <Link to="/auth/forgot-password" className="auth-form__link">Esqueci a senha</Link>
        </div>

        {error && (
          <div className="auth-form__error" role="alert">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 4v5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <div>
              {error}
              {requestId && (
                <div className="mono" style={{ fontSize: '0.72rem', opacity: 0.7, marginTop: 4 }}>
                  req: {requestId}
                </div>
              )}
            </div>
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--lg auth-form__submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-form__spin" aria-hidden="true" />
              Entrando…
            </>
          ) : (
            <>
              Entrar na plataforma
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>

        <div className="auth-form__divider"><span>ou continue com</span></div>

        <div className="auth-form__oauth">
          <a href={getGoogleSignInUrl('login')} className="oauth-btn oauth-btn--full">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M22.5 12.275c0-.766-.069-1.503-.197-2.21H12v4.185h5.892c-.254 1.37-1.025 2.529-2.184 3.308v2.748h3.535c2.07-1.906 3.257-4.713 3.257-8.031z" fill="#4285F4"/>
              <path d="M12 23c2.95 0 5.422-.978 7.23-2.65l-3.535-2.749c-.98.658-2.235 1.046-3.695 1.046-2.843 0-5.252-1.92-6.111-4.5H2.245v2.825C4.043 20.612 7.756 23 12 23z" fill="#34A853"/>
              <path d="M5.889 14.147A6.594 6.594 0 015.555 12c0-.745.128-1.467.334-2.147V7.028H2.245A11.013 11.013 0 001 12c0 1.776.425 3.453 1.245 4.972l3.644-2.825z" fill="#FBBC04"/>
              <path d="M12 5.378c1.604 0 3.04.552 4.172 1.633l3.13-3.13C17.418 2.099 14.946 1 12 1 7.756 1 4.043 3.388 2.245 7.028l3.644 2.825C6.748 7.298 9.157 5.378 12 5.378z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </a>
        </div>
      </form>
    </AuthLayout>
  );
}
