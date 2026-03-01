import { COLORS, withAlpha } from './index';

/**
 * Gradient definitions — olive palette aligned.
 * No red, no bright green, no orange.
 */

export interface GradientConfig {
  colors: string[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// ─── HERO GRADIENTS ─────────────────────────────────────────────

export const GRADIENTS = {
  // Personal mode hero (olive → gold)
  personalHero: {
    colors: [COLORS.personal, '#DEAB22'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // Business mode hero (bronze → gold)
  businessHero: {
    colors: [COLORS.business, '#DEAB22'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // ─── BUTTON GRADIENTS ───────────────────────────────────────────

  primary: {
    colors: ['#4F5104', '#B2780A'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  success: {
    colors: ['#4F5104', '#DEAB22'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  danger: {
    colors: ['#B8AFBC', '#9CA3B4'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  warning: {
    colors: ['#DEAB22', '#B2780A'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  info: {
    colors: ['#6BA3BE', '#8BBDD0'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  // ─── CARD GRADIENTS ─────────────────────────────────────────────

  incomeCard: {
    colors: [withAlpha(COLORS.income, 0.15), withAlpha(COLORS.income, 0.05)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  expenseCard: {
    colors: [withAlpha(COLORS.expense, 0.15), withAlpha(COLORS.expense, 0.05)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  neutralCard: {
    colors: [withAlpha('#4F5104', 0.08), withAlpha('#4F5104', 0.02)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // ─── ICON GRADIENTS ─────────────────────────────────────────────

  personalIcon: {
    colors: [withAlpha(COLORS.personal, 0.2), withAlpha(COLORS.personal, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  businessIcon: {
    colors: [withAlpha(COLORS.business, 0.2), withAlpha(COLORS.business, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  incomeIcon: {
    colors: [withAlpha(COLORS.income, 0.2), withAlpha(COLORS.income, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  expenseIcon: {
    colors: [withAlpha(COLORS.expense, 0.2), withAlpha(COLORS.expense, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  warningIcon: {
    colors: [withAlpha(COLORS.warning, 0.2), withAlpha(COLORS.warning, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // ─── SHIMMER GRADIENT ───────────────────────────────────────────

  shimmer: {
    colors: [
      'rgba(255, 255, 255, 0)',
      'rgba(255, 255, 255, 0.3)',
      'rgba(255, 255, 255, 0)',
    ],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  } as GradientConfig,

  shimmerDark: {
    colors: [
      'rgba(255, 255, 255, 0)',
      'rgba(255, 255, 255, 0.1)',
      'rgba(255, 255, 255, 0)',
    ],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  } as GradientConfig,

  // ─── OVERLAY GRADIENTS ──────────────────────────────────────────

  modalOverlay: {
    colors: ['rgba(17, 24, 39, 0)', 'rgba(17, 24, 39, 0.8)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  } as GradientConfig,

  bottomFade: {
    colors: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 1)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  } as GradientConfig,

  topFade: {
    colors: ['rgba(255, 255, 255, 1)', 'rgba(255, 255, 255, 0)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  } as GradientConfig,

  // ─── STATUS GRADIENTS ───────────────────────────────────────────

  pending: {
    colors: ['#DEAB22', '#B2780A'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  completed: {
    colors: ['#4F5104', '#DEAB22'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  cancelled: {
    colors: ['#B8AFBC', '#9CA3B4'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  // ─── PREMIUM GRADIENT ─────────────────────────────────────────

  premium: {
    colors: ['#DEAB22', '#B2780A'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,
};

// Helper function to create custom gradient from any color
export const createGradient = (
  baseColor: string,
  lighten: number = 20
): GradientConfig => {
  const hex = baseColor.replace('#', '');
  const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + lighten);
  const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + lighten);
  const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + lighten);
  const lighterColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

  return {
    colors: [baseColor, lighterColor],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  };
};

export default GRADIENTS;
