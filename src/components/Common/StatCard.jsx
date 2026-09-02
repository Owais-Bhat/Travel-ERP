import Surface from './Surface';
import { AnimatedNumber } from './Motion';

/**
 * Metric tile.
 *
 * Tilts toward the pointer with its contents on separate Z planes, so the
 * number floats above the label rather than sliding with it. The value
 * counts up on mount and whenever it changes.
 */
const TONES = {
  primary: 'var(--neu-primary)',
  teal: 'var(--neu-teal)',
  coral: 'var(--neu-coral)',
  amber: 'var(--neu-amber)',
  violet: 'var(--neu-violet)',
  success: 'var(--neu-success)',
  danger: 'var(--neu-danger)',
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  prefix = '',
  suffix = '',
  decimals = 0,
  hint,
  animate = true,
  className = '',
}) {
  const color = TONES[tone] || TONES.primary;
  const numeric = typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)));

  return (
    <Surface tilt={5} lift className={`layer-3d ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 depth-1">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--neu-ink-muted)' }}
          >
            {label}
          </p>

          <p
            className="text-2xl sm:text-3xl font-bold font-display mb-0 tabular-nums"
            style={{ color: 'var(--neu-ink)' }}
          >
            {animate && numeric ? (
              <AnimatedNumber value={Number(value)} prefix={prefix} suffix={suffix} decimals={decimals} />
            ) : (
              `${prefix}${value ?? '—'}${suffix}`
            )}
          </p>

          {hint && (
            <p className="text-xs mt-1.5 mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
              {hint}
            </p>
          )}
        </div>

        {Icon && (
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 depth-2"
            style={{ boxShadow: 'var(--neu-inset-subtle)', color }}
          >
            <Icon className="w-5 h-5" />
          </span>
        )}
      </div>
    </Surface>
  );
}
