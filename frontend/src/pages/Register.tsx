import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout';
import { AuthField } from '../components/auth/AuthField';
import { register } from '../lib/auth';

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function scorePassword(pw: string): Strength {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^\w\s]/.test(pw)) s++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: 'muito fraca',  color: 'var(--c-text-dim)' },
    1: { score: 1, label: 'fraca',        color: '#ff3d2e' },
    2: { score: 2, label: 'razoável',     color: '#f5b942' },
    3: { score: 3, label: 'forte',        color: '#ff7a18' },
    4: { score: 4, label: 'muito forte',  color: '#2bd279' },
  };
  return map[Math.min(s, 4) as 0 | 1 | 2 | 3 | 4] ?? map[0]!;
}

export default function RegisterPage(): JSX.Element {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!accept) {
      setError('Você precisa aceitar os termos para continuar.');
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      nav('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Criar conta"
      title={<>Acenda sua <span className="gradient-text">proteção</span> em 1 minuto.</>}
      subtitle="Crie sua conta, conecte sua plataforma de ads, e FURY assume o plantão a partir do primeiro minuto."
      footer={<>Já tem conta? <Link to="/login">Entrar</Link></>}
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          label="Nome completo"
          value={name}
          onChange={setName}
          placeholder="Maria Silva"
          autoComplete="name"
          required
          icon={
            <svg viewBox="0 0 16 16" width="16" height="16">
              <circle cx="8" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          }
        />
        <AuthField
          label="Email profissional"
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
          placeholder="Crie uma senha forte"
          autoComplete="new-password"
          required
          icon={
            <svg viewBox="0 0 16 16" width="16" height="16">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.4"/>
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
                <span className="strength__label" style={{ color: strength.color }}>{strength.label}</span>
              </div>
            )
          }
        />

        <label className="check check--terms">
          <input
            type="checkbox"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
          />
          <span className="check__box" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span>
            Aceito os <a href="#terms">Termos</a> e a <a href="#privacy">Política de Privacidade</a>.
          </span>
        </label>

        {error && (
          <div className="auth-form__error" role="alert">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 4v5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--lg auth-form__submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-form__spin" aria-hidden="true" />
              Criando conta…
            </>
          ) : (
            <>
              Acender minha proteção
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>

        <p className="auth-form__guarantee mono">
          ✓ Setup grátis · ✓ Sem cartão de crédito · ✓ Cancele quando quiser
        </p>
      </form>
    </AuthLayout>
  );
}
