import { forwardRef } from 'react';
import { useTilt3d, usePrefersReducedMotion } from '../../hooks/useTilt3d';

/**
 * The neumorphic surface primitive.
 *
 * Every panel in the app is one of these. `variant` picks how the material
 * is lit (extruded, carved, or flush) and `tilt` opts into pointer-driven
 * 3D — which is switched off automatically for reduced-motion users.
 */
const VARIANTS = {
  raised: 'neu-card',
  flat: 'neu-flat',
  inset: 'neu-inset',
  plain: '',
};

const ELEVATION = {
  1: 'neu-e1',
  2: 'neu-e2',
  3: 'neu-e3',
  4: 'neu-e4',
};

const Surface = forwardRef(function Surface({
  as: Tag = 'div',
  variant = 'raised',
  elevation,
  tilt = false,
  lift = false,
  interactive = false,
  className = '',
  children,
  ...props
}, forwardedRef) {
  const reducedMotion = usePrefersReducedMotion();
  const tiltProps = useTilt3d({
    max: typeof tilt === 'number' ? tilt : 6,
    disabled: !tilt || reducedMotion,
  });

  const classes = [
    VARIANTS[variant] ?? VARIANTS.raised,
    elevation ? ELEVATION[elevation] : '',
    lift ? 'neu-card-lift' : '',
    interactive ? 'neu-interactive' : '',
    tilt && !reducedMotion ? 'tilt-3d tilt-sheen' : '',
    className,
  ].filter(Boolean).join(' ');

  if (!tilt || reducedMotion) {
    return (
      <Tag ref={forwardedRef} className={classes} {...props}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      {...tiltProps}
      ref={(node) => {
        tiltProps.ref.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={classes}
      {...props}
    >
      {children}
    </Tag>
  );
});

export default Surface;
