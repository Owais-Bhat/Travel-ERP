import { Reveal } from './Motion';

/**
 * Page title block.
 *
 * Sits on the front Z plane of the page's scene so it reads slightly above
 * the content that scrolls beneath it.
 */
export default function PageHeader({ title, subtitle, icon: Icon, actions, children }) {
  return (
    <Reveal className="layer-3d">
      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="flex items-start gap-4 min-w-0">
          {Icon && (
            <span
              className="from-sm flex w-12 h-12 rounded-2xl items-center justify-center shrink-0 depth-1"
              style={{
                background: 'var(--neu-bg)',
                boxShadow: 'var(--neu-e2)',
                color: 'var(--neu-primary)',
              }}
            >
              <Icon className="w-6 h-6" />
            </span>
          )}
          <div className="min-w-0">
            <h1
              className="text-2xl sm:text-3xl font-bold font-display mb-1"
              style={{ color: 'var(--neu-ink)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </Reveal>
  );
}
