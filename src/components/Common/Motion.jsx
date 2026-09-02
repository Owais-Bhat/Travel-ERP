import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useTilt3d';

/**
 * Shared motion vocabulary.
 *
 * One spring, used everywhere, so the whole app decelerates the same way.
 * Anything here collapses to an instant, still render under reduced motion.
 */
export const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 };
export const softSpring = { type: 'spring', stiffness: 220, damping: 28, mass: 1 };

export const riseVariants = {
  hidden: { opacity: 0, y: 18, rotateX: -6 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: spring },
  exit: { opacity: 0, y: -10, transition: { duration: 0.16 } },
};

export const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

/** Page-level wrapper: fades and lifts a route into the scene. */
export function PageTransition({ children, className = '' }) {
  const reduced = usePrefersReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={softSpring}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
}

/** Reveals its children once, when they first scroll into view. */
export function Reveal({ children, delay = 0, className = '', as = 'div' }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (reduced || seen) return undefined;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, seen]);

  if (reduced) return <div className={className}>{children}</div>;

  const MotionTag = motion[as] || motion.div;

  return (
    <MotionTag
      ref={ref}
      className={className}
      initial="hidden"
      animate={seen ? 'visible' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: 22, rotateX: -5 },
        visible: { opacity: 1, y: 0, rotateX: 0, transition: { ...spring, delay } },
      }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </MotionTag>
  );
}

/** Staggered container — pair with `<StaggerItem>` children. */
export function Stagger({ children, className = '' }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} initial="hidden" animate="visible" variants={listVariants}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={riseVariants} style={{ transformStyle: 'preserve-3d' }}>
      {children}
    </motion.div>
  );
}

/**
 * Counts a number up when it enters the viewport (and again whenever the
 * value changes). Uses an eased ramp rather than a linear one so the last
 * digits settle instead of snapping.
 */
export function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) {
  const reduced = usePrefersReducedMotion();
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(reduced ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return undefined;
    }

    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}

/** Ambient extruded shapes drifting behind the app shell. */
export function DepthField() {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;

  const blobs = [
    { size: 320, top: '-6%', left: '-4%', duration: 22, delay: 0 },
    { size: 210, top: '58%', left: '82%', duration: 28, delay: 3 },
    { size: 150, top: '78%', left: '8%', duration: 19, delay: 6 },
    { size: 260, top: '14%', left: '68%', duration: 32, delay: 1.5 },
  ];

  return (
    <div className="depth-field" aria-hidden="true">
      {blobs.map((blob, index) => (
        <motion.div
          key={index}
          className="depth-blob"
          style={{ width: blob.size, height: blob.size, top: blob.top, left: blob.left }}
          animate={{
            y: [0, -26, 6, 0],
            x: [0, 14, -10, 0],
            rotate: [0, 6, -4, 0],
          }}
          transition={{
            duration: blob.duration,
            delay: blob.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export { motion, AnimatePresence };
