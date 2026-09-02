import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pointer-driven 3D tilt.
 *
 * Writes CSS custom properties straight onto the node instead of going
 * through React state, so a pointer move never triggers a re-render — the
 * browser composites the transform on the GPU.
 *
 * Returns props to spread on the element you want to tilt.
 *
 *   const tilt = useTilt3d({ max: 8 });
 *   <div className="tilt-3d tilt-sheen" {...tilt}>…</div>
 */
export function useTilt3d({
  max = 7,          // maximum rotation in degrees
  lift = 14,        // translateZ on hover, in px
  scale = 1.015,
  sheen = true,
  disabled = false,
} = {}) {
  const ref = useRef(null);
  const frame = useRef(0);

  const reset = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
    node.style.setProperty('--tilt-z', '0px');
    node.style.setProperty('--tilt-scale', '1');
    node.style.setProperty('--sheen-opacity', '0');
    // Springy settle when the pointer leaves.
    node.style.transition = 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)';
  }, []);

  const handleMove = useCallback((event) => {
    const node = ref.current;
    if (!node || disabled) return;

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // -0.5 … 0.5 relative to the element's centre.
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;

      // Y-rotation follows horizontal travel; X-rotation is inverted so the
      // card leans toward the cursor rather than away from it.
      node.style.setProperty('--tilt-y', `${(px * max * 2).toFixed(2)}deg`);
      node.style.setProperty('--tilt-x', `${(-py * max * 2).toFixed(2)}deg`);
      node.style.setProperty('--tilt-z', `${lift}px`);
      node.style.setProperty('--tilt-scale', String(scale));

      if (sheen) {
        node.style.setProperty('--sheen-x', `${((px + 0.5) * 100).toFixed(1)}%`);
        node.style.setProperty('--sheen-y', `${((py + 0.5) * 100).toFixed(1)}%`);
        node.style.setProperty('--sheen-opacity', '1');
      }
    });
  }, [disabled, lift, max, scale, sheen]);

  const handleEnter = useCallback(() => {
    const node = ref.current;
    if (!node || disabled) return;
    // Track the pointer with no easing; easing here reads as lag.
    node.style.transition = 'transform 90ms linear';
  }, [disabled]);

  const handleLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    reset();
  }, [reset]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  return {
    ref,
    onPointerMove: handleMove,
    onPointerEnter: handleEnter,
    onPointerLeave: handleLeave,
  };
}

/** True when the OS asks for reduced motion; updates if the user changes it. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export default useTilt3d;
