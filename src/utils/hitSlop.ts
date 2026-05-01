// Hit-slop presets + helper for WCAG 2.5.5 tap-target compliance (44×44 minimum).
// Import HITSLOP_10 for the common case of a 32×32 visual inside a 44×44 hit area
// (10px padding on every side → 52×52 touch region, well above the 44×44 floor).

export const HITSLOP_10 = { top: 10, bottom: 10, left: 10, right: 10 } as const;
export const HITSLOP_15 = { top: 15, bottom: 15, left: 15, right: 15 } as const;

/**
 * Returns a symmetric hitSlop that brings `currentSize` up to `targetSize` (default 44).
 * Useful when a visual target must stay small but the touch area must meet WCAG 2.5.5.
 */
export const hitSlopFor = (currentSize: number, targetSize = 44) => {
  const extra = Math.max(0, Math.ceil((targetSize - currentSize) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
};
