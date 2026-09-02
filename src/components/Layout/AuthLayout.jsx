import { motion } from '../Common/Motion';
import { DepthField } from '../Common/Motion';

/**
 * Sign-in shell.
 *
 * Two halves of the same material: a recessed marketing panel on the left,
 * the form raised out of the canvas on the right. The whole thing is one
 * perspective scene so the card can lift toward the viewer on mount.
 */
export default function AuthLayout({ children }) {
  const highlights = [
    ['Live Ops', 'Admissions, attendance, fees and messages in one daily command view.'],
    ['Growth', 'Lead CRM, referrals, commissions and scholarships, end to end.'],
    ['Tenant Safe', 'Every institution runs inside its own isolated workspace.'],
  ];

  const stats = [
    ['15+', 'ERP modules'],
    ['AI', 'Automation layer'],
    ['MT', 'Multi-tenant ready'],
  ];

  const Logo = ({ size = 'w-11 h-11', icon = 'w-6 h-6' }) => (
    <div
      className={`${size} rounded-2xl flex items-center justify-center shrink-0`}
      style={{
        background: 'linear-gradient(145deg, var(--neu-teal), var(--neu-primary))',
        boxShadow: 'var(--neu-e2)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" className={`${icon} text-white`}>
        <path d="M12 3L2 8l10 5 10-5-10-5z" fill="currentColor" opacity="0.92" />
        <path d="M2 16l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );

  return (
    <div
      className="auth-shell scene min-h-screen grid md:grid-cols-[1.08fr_0.92fr] relative"
      style={{ background: 'var(--neu-bg)' }}
    >
      <DepthField />

      {/* Marketing panel — carved into the canvas */}
      <section className="from-md flex flex-col justify-between p-8 lg:p-10 relative z-10">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
              CyberMilo
            </h1>
            <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
              Education operations workspace
            </p>
          </div>
        </div>

        <div className="max-w-xl layer-3d">
          <p
            className="text-sm font-bold uppercase tracking-[0.18em] mb-4"
            style={{ color: 'var(--neu-coral)' }}
          >
            SaaS Campus Intelligence
          </p>
          <h2
            className="text-4xl xl:text-5xl font-display leading-tight mb-5"
            style={{ color: 'var(--neu-ink)' }}
          >
            Run every institution from one calm, intelligent operations desk.
          </h2>
          <p className="text-lg max-w-lg" style={{ color: 'var(--neu-ink-soft)' }}>
            Admissions, academics, scholarships, referrals, communication and AI
            insights — for universities, colleges, schools and training centres.
          </p>

          <div className="mt-8 grid gap-3">
            {highlights.map(([title, copy], index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.08, type: 'spring', stiffness: 220, damping: 28 }}
                className="p-4 neu-inset"
                style={{ borderRadius: 'var(--neu-radius)' }}
              >
                <p className="font-bold mb-1" style={{ color: 'var(--neu-ink)' }}>{title}</p>
                <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{copy}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 max-w-xl">
          {stats.map(([value, label]) => (
            <div
              key={label}
              className="p-4"
              style={{ borderRadius: 'var(--neu-radius)', boxShadow: 'var(--neu-e1)' }}
            >
              <p className="text-2xl font-extrabold mb-1" style={{ color: 'var(--neu-primary)' }}>
                {value}
              </p>
              <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form — raised out of the canvas */}
      <section className="flex items-center justify-center p-5 sm:p-8 relative z-10">
        <div className="w-full max-w-md">
          <div className="upto-md text-center mb-8">
            <div className="flex justify-center mb-3">
              <Logo size="w-12 h-12" />
            </div>
            <h1 className="text-3xl font-display mb-1" style={{ color: 'var(--neu-ink)' }}>
              CyberMilo
            </h1>
            <p className="text-sm mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
              Education operations workspace
            </p>
          </div>

          <motion.div
            className="px-6 sm:px-8 py-8 layer-3d"
            initial={{ opacity: 0, y: 24, rotateX: -8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 28 }}
            style={{
              background: 'var(--neu-bg)',
              borderRadius: 'var(--neu-radius-xl)',
              boxShadow: 'var(--neu-e4)',
              transformStyle: 'preserve-3d',
            }}
          >
            {children}
          </motion.div>

          <p className="text-center mt-6 text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
            Copyright 2026 CyberMilo. All rights reserved.
          </p>
        </div>
      </section>
    </div>
  );
}
