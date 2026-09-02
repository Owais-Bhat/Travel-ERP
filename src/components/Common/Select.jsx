import { useId } from 'react';
import { MdExpandMore } from 'react-icons/md';

export default function Select({
  label,
  error,
  hint,
  className = '',
  wrapperClass = 'mb-4',
  required = false,
  options = [],
  placeholder,
  id,
  ...props
}) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className={wrapperClass}>
      {label && (
        <label htmlFor={selectId} className="neu-label">
          {label}
          {required && <span style={{ color: 'var(--neu-danger)' }} className="ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={[
            'neu-select',
            error ? 'neu-input-error' : '',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => {
            const value = typeof option === 'object' ? option.value : option;
            const optionLabel = typeof option === 'object' ? option.label : option;
            return (
              <option key={value} value={value}>{optionLabel}</option>
            );
          })}
        </select>

        <MdExpandMore
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
          style={{ color: 'var(--neu-ink-muted)' }}
        />
      </div>

      {error && (
        <p id={`${selectId}-error`} className="text-xs mt-1.5" style={{ color: 'var(--neu-danger)' }}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-xs mt-1.5" style={{ color: 'var(--neu-ink-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
