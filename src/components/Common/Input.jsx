import { useId, useState } from 'react';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';

/**
 * Neumorphic text input — carved into the surface rather than raised,
 * because you type *into* a field.
 */
export default function Input({
  label,
  error,
  hint,
  type = 'text',
  leftIcon: LeftIcon,
  className = '',
  required = false,
  wrapperClass = '',
  id,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  const [showPwd, setShowPwd] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword ? (showPwd ? 'text' : 'password') : type;

  return (
    <div className={wrapperClass}>
      {label && (
        <label htmlFor={inputId} className="neu-label">
          {label}
          {required && <span style={{ color: 'var(--neu-danger)' }} className="ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {LeftIcon && (
          <span
            className="absolute inset-y-0 left-0 flex w-11 items-center justify-center pointer-events-none"
            style={{ color: 'var(--neu-ink-muted)' }}
          >
            <LeftIcon className="w-5 h-5" />
          </span>
        )}

        <input
          id={inputId}
          type={resolvedType}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={[
            'neu-input',
            error ? 'neu-input-error' : '',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
          // `.neu-input` sets a padding shorthand and loads after Tailwind, so
          // a `pl-11` utility would lose to it. Inline styles clear the icons
          // reliably regardless of stylesheet order.
          style={{
            ...(LeftIcon ? { paddingLeft: '2.75rem' } : null),
            ...(isPassword ? { paddingRight: '2.75rem' } : null),
            ...props.style,
          }}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors"
            style={{ color: 'var(--neu-ink-muted)' }}
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPwd ? <MdVisibilityOff className="w-5 h-5" /> : <MdVisibility className="w-5 h-5" />}
          </button>
        )}
      </div>

      {error && (
        <p id={`${inputId}-error`} className="text-xs mt-1.5" style={{ color: 'var(--neu-danger)' }}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs mt-1.5" style={{ color: 'var(--neu-ink-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
