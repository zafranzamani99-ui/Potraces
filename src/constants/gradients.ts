import { COLORS, withAlpha } from './index';

/**
 * Gradient definitions for premium UI effects
 * Used with expo-linear-gradient LinearGradient component
 */

export interface GradientConfig {
  colors: string[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// ─── HERO GRADIENTS ─────────────────────────────────────────────
// Bold gradients for main dashboard hero sections

export const GRADIENTS = {
  // Personal mode hero
  personalHero: {
    colors: [COLORS.personal, '#DEAB22'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // Business mode hero
  businessHero: {
    colors: [COLORS.business, '#1DE9B6'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } as GradientConfig,

  // ─── BUTTON GRADIENTS ───────────────────────────────────────────
  // For CTA buttons and primary actions

  primary: {
    colors: ['#4F5104', '#B2780A'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  success: {
    colors: ['#2DCE89', '#1DE9B6'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  danger: {
    colors: ['#F5365C', '#FF6B9D'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  warning: {
    colors: ['#FB8C3C', '#FFB15C'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  info: {
    colors: ['#11CDEF', '#5FDEF5'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  // ─── CARD GRADIENTS ─────────────────────────────────────────────
  // Subtle gradients for card backgrounds

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
  // For gradient icon backgrounds in StatCards, etc.

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
  // For skeleton loading screens

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
  // For modal backdrops and overlays

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
  // For status badges and indicators

  pending: {
    colors: ['#FB8C3C', '#FFB15C'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  completed: {
    colors: ['#2DCE89', '#1DE9B6'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  cancelled: {
    colors: ['#F5365C', '#FF6B9D'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,

  // ─── PREMIUM GRADIENT ─────────────────────────────────────────
  // Gold gradient for premium/subscription UI

  premium: {
    colors: ['#FFB347', '#FFCC33'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  } as GradientConfig,
};

// Helper function to create custom gradient from any color
export const createGradient = (
  baseColor: string,
  lighten: number = 20
): GradientConfig => {
  // Simple lightening by adding to hex values
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
