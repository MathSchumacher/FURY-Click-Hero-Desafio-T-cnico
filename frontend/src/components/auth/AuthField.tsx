import { useId, useState, type ChangeEvent, type ReactNode } from 'react';

type Props = {
  label: string;
  type?: 'email' | 'password' | 'text';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: ReactNode;
  rightSlot?: ReactNode;
  icon?: ReactNode;
};

export function AuthField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  hint,
  rightSlot,
  icon,
}: Props): JSX.Element {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={`field ${value ? 'field--filled' : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {required && <span className="field__req" aria-hidden="true">*</span>}
      </label>
      <div className="field__wrap">
        {icon && <span className="field__icon" aria-hidden="true">{icon}</span>}
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="field__input"
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            )}
          </button>
        )}
        {rightSlot}
      </div>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}
