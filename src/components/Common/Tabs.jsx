import { motion, spring } from './Motion';

/**
 * Segmented tabs.
 *
 * The whole strip is a carved groove and the active tab is the raised key
 * inside it, so selection reads as a physical position rather than a colour
 * change. The raised pill is shared via `layoutId`, so switching tabs slides
 * it instead of cutting.
 */
export default function Tabs({ tabs = [], value, onChange, className = '', id = 'tabs' }) {
  return (
    <div
      role="tablist"
      className={`inline-flex flex-wrap gap-1 p-1.5 ${className}`}
      style={{
        borderRadius: 'var(--neu-radius-lg)',
        background: 'var(--neu-bg)',
        boxShadow: 'var(--neu-inset)',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        const Icon = tab.icon;

        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange?.(tab.key)}
            className="relative px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              borderRadius: 'var(--neu-radius)',
              color: active ? 'var(--neu-primary)' : 'var(--neu-ink-muted)',
            }}
          >
            {active && (
              <motion.span
                layoutId={`${id}-active`}
                transition={spring}
                className="absolute inset-0"
                style={{
                  borderRadius: 'var(--neu-radius)',
                  background: 'var(--neu-bg)',
                  boxShadow: 'var(--neu-e2)',
                }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ boxShadow: 'var(--neu-inset-subtle)' }}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
