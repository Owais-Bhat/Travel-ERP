import { MdLoop } from 'react-icons/md';

/**
 * Neumorphic button.
 *
 * Raised at rest, lifts on hover, presses *into* the material on click —
 * the press state is the whole point of soft UI, so it is handled in CSS
 * (`:active`) rather than JS to stay in sync with real pointer timing.
 */
const VARIANTS = {
  primary: 'neu-btn neu-btn-primary',
  secondary: 'neu-btn',
  danger: 'neu-btn neu-btn-danger',
  ghost: 'neu-btn neu-btn-ghost',
  icon: 'neu-btn neu-btn-ghost neu-btn-icon',
};

const SIZES = {
  xs: 'neu-btn-xs',
  sm: 'neu-btn-sm',
  md: '',
  lg: 'neu-btn-lg',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconRight,
  fullWidth = false,
  className = '',
  ...props
}) {
  const IconRight = iconRight;

  return (
    <button
      className={[
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || '',
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading
        ? <span className="neu-spinner shrink-0" aria-hidden="true" />
        : Icon ? <Icon className="w-4 h-4 shrink-0" /> : null}
      {children}
      {IconRight && !loading && <IconRight className="w-4 h-4 shrink-0" />}
      {loading && <span className="sr-only">Loading</span>}
    </button>
  );
}

export { MdLoop };
