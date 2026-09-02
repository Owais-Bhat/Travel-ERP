import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MdClose } from 'react-icons/md';
import { motion, AnimatePresence, spring } from './Motion';
import { usePrefersReducedMotion } from '../../hooks/useTilt3d';

/**
 * Modal dialog.
 *
 * Enters by rotating up out of the page plane, which reads as the panel
 * rising toward the viewer rather than just fading in. Focus is trapped
 * while it is open and returned to the trigger on close.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  footer,
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep tabbing inside the dialog.
      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Move focus in on the next frame, once the panel is mounted.
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector(
        'input, textarea, select, button:not([disabled])'
      );
      target?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Portalled to <body> rather than rendered in place: the app shell wraps
  // routed content in ancestors with `perspective` and `will-change:
  // transform` (for the 3D tilt effect), and either one gives fixed-position
  // descendants a new containing block — so an in-place `fixed inset-0`
  // backdrop ends up sized to the scrollable content column instead of the
  // viewport, landing the dialog off-screen below the fold.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="neu-backdrop scene"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Dialog'}
            className={`neu-modal ${maxWidth}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, rotateX: -10, scale: 0.97 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            transition={spring}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {title && (
              <div className="neu-modal-header flex items-center justify-between">
                <h3 className="text-lg font-semibold font-display" style={{ color: 'var(--neu-ink)', margin: 0 }}>
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="neu-btn neu-btn-ghost neu-btn-icon"
                  aria-label="Close dialog"
                >
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="neu-modal-body">{children}</div>

            {footer && <div className="neu-modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
