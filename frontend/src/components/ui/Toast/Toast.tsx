import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import './Toast.css';

/**
 * Toast system mínimo + branded.
 *
 * Decisões:
 *   - Context API (vs lib externa): zero deps, ~80 linhas, controle total
 *   - Variants: success (verde), error (vermelho/aria-live=assertive),
 *     info (azul)
 *   - Auto-dismiss em 4s default, dismiss manual sempre disponível
 *   - Stack vertical no canto inferior-direito (não bloqueia UI principal)
 *   - role=status (polite) pra success/info; role=alert (assertive) pra error
 *   - Anim de slide-in via CSS keyframes (no JS pra perf)
 */

export type ToastVariant = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
};

type ToastContextValue = {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000; /* erros ficam mais tempo — user precisa ler */

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, duration?: number): void => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const finalDuration = duration ?? (variant === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
      setToasts((prev) => [...prev, { id, variant, message, duration: finalDuration }]);
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m, d) => { push('success', m, d); },
      error: (m, d) => { push('error', m, d); },
      info: (m, d) => { push('info', m, d); },
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast precisa estar dentro de <ToastProvider>');
  }
  return ctx;
}

/* ── Viewport: container fixo + lista renderizada ─────────── */

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}): JSX.Element {
  return (
    <div className="toast-viewport" aria-label="Notificações">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => { onDismiss(toast.id); }, toast.duration);
    return () => { clearTimeout(timer); };
  }, [toast.id, toast.duration, onDismiss]);

  const isError = toast.variant === 'error';
  const role = isError ? 'alert' : 'status';
  const ariaLive = isError ? 'assertive' : 'polite';

  return (
    <div
      className={`toast toast--${toast.variant}`}
      role={role}
      aria-live={ariaLive}
    >
      <span className="toast__icon" aria-hidden="true">
        {toast.variant === 'success' && '✓'}
        {toast.variant === 'error' && '✕'}
        {toast.variant === 'info' && 'ⓘ'}
      </span>
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={() => { onDismiss(toast.id); }}
        aria-label="Dispensar notificação"
      >
        ×
      </button>
    </div>
  );
}
