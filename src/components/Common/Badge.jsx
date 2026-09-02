import { getStatusBadge } from '../../utils/helpers';

/**
 * Status pill.
 *
 * Carved into the surface rather than raised — a status is a label, not an
 * action, so it should read as recessed. The tone lives in the text and the
 * leading dot; `tone` overrides the status lookup when you need a specific
 * colour for a non-status label.
 */
const TONE_CLASS = {
  success: 'neu-badge-success',
  warning: 'neu-badge-warning',
  danger: 'neu-badge-danger',
  info: 'neu-badge-info',
  violet: 'neu-badge-violet',
  neutral: '',
};

export default function Badge({ status, tone, children, dot = true, className = '' }) {
  const resolved = status !== undefined ? getStatusBadge(status) : null;
  const toneClass = tone ? (TONE_CLASS[tone] ?? '') : (resolved?.color ?? '');

  return (
    <span
      className={[
        'neu-badge',
        toneClass,
        dot ? '' : 'neu-badge-plain',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children || resolved?.label}
    </span>
  );
}
