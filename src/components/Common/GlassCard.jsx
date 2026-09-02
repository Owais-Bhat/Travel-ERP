import Surface from './Surface';

/**
 * Card surface.
 *
 * Kept under its original name because every module page imports it; the
 * material underneath is now neumorphic rather than glass. `light` used to
 * pick the pale glass tint — under a single-material system it maps to the
 * flatter, lower elevation.
 */
export default function GlassCard({
  children,
  className = '',
  light = false,
  tilt = false,
  lift = true,
  ...props
}) {
  return (
    <Surface
      variant={light ? 'flat' : 'raised'}
      lift={lift}
      tilt={tilt}
      className={className}
      {...props}
    >
      {children}
    </Surface>
  );
}
