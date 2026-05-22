import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { fetchMe, setSession } from '../lib/auth';

/**
 * /auth/callback — landing page do redirect do backend após Google OAuth.
 *
 * Backend já setou o cookie HttpOnly antes do redirect; só precisamos
 * validar a sessão via /auth/me e cachar o user.
 *
 *   ?error=<reason>  → mostra mensagem de erro com link pra tentar de novo
 *   (sem erro)       → valida sessão e leva pro dashboard
 *
 * Nota: o query param `?token=...` ainda vem do backend durante a
 * transição; ignorado aqui (token vive APENAS no cookie HttpOnly).
 */
export default function AuthCallback(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errParam = params.get('error');
    if (errParam) {
      setError(decodeURIComponent(errParam));
      return;
    }

    (async () => {
      try {
        const user = await fetchMe();
        setSession(user);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        setError(`fetch_me_failed: ${msg}`);
      }
    })().catch(() => undefined);
  }, [params, navigate]);

  const errorMessage = ((): string => {
    switch (error) {
      case null:
        return '';
      case 'no_code':
        return 'O Google não retornou um código de autorização. Tente novamente.';
      case 'access_denied':
        return 'Você cancelou o login com o Google.';
      case 'google_auth_failed':
        return 'Não conseguimos validar sua identidade no Google. Tente outra vez.';
      case 'not_configured':
        return 'Google sign-in não está configurado neste ambiente.';
      case 'account_not_found':
        return 'Não encontramos conta FURY vinculada a esse Google. Crie sua conta primeiro.';
      case 'no_token':
        return 'Resposta inválida do servidor (sem token). Tente novamente.';
      default:
        return `Algo deu errado: ${error}`;
    }
  })();

  const isAccountNotFound = error === 'account_not_found';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--c-bg)',
        color: 'var(--c-text)',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        {!error ? (
          <>
            <span
              className="auth-form__spin"
              aria-hidden="true"
              style={{ width: 36, height: 36, borderWidth: 3, marginBottom: 16 }}
            />
            <p>Conectando sua conta…</p>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: 12 }}>
              {isAccountNotFound ? 'Conta não encontrada' : 'Não conseguimos fazer login'}
            </h1>
            <p style={{ color: 'var(--c-text-dim)', marginBottom: 24 }}>{errorMessage}</p>
            {isAccountNotFound ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/register" className="btn btn--primary">
                  Criar conta com Google
                </Link>
                <Link to="/login" className="btn btn--ghost">
                  Voltar pro login
                </Link>
              </div>
            ) : (
              <Link to="/login" className="btn btn--primary">
                Voltar pro login
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
