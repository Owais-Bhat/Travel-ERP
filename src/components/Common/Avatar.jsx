/**
 * Avatar.
 *
 * Sits in a carved well so faces and initials read as inlaid into the
 * surface. The tint is derived from the name so the same person keeps the
 * same colour across the app.
 */
const TINTS = [
  ['var(--neu-primary)', 'var(--neu-violet)'],
  ['var(--neu-teal)', 'var(--neu-primary)'],
  ['var(--neu-coral)', 'var(--neu-amber)'],
  ['var(--neu-violet)', 'var(--neu-coral)'],
  ['var(--neu-success)', 'var(--neu-teal)'],
  ['var(--neu-amber)', 'var(--neu-coral)'],
];

function getTint(name = '') {
  const code = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return TINTS[code % TINTS.length];
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase() || 'U';
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl',
};

export default function Avatar({
  name = '',
  src,
  size = 'md',
  className = '',
  rounded = 'rounded-2xl',
  ring = false,
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const [from, to] = getTint(name);

  return (
    <div
      className={`${sizeClass} ${rounded} ${className} flex items-center justify-center font-semibold shrink-0 overflow-hidden`}
      style={{
        color: '#fff',
        background: `linear-gradient(145deg, ${from}, ${to})`,
        boxShadow: ring
          ? 'var(--neu-e1), 0 0 0 3px color-mix(in srgb, var(--neu-primary) 26%, transparent)'
          : 'var(--neu-e1)',
      }}
      title={name || undefined}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-display" aria-hidden="true">{getInitials(name)}</span>
      )}
    </div>
  );
}
