import { CategoryOption } from '../types';

// ─── DESIGN TOKENS ──────────────────────────────────────────
// CALM design system — anxiety-reducing, no red, no green success.
// Aligned to frontend-design.md spec.

export const COLORS = {
  // Brand — olive palette
  primary: '#4F5104',
  secondary: '#B2780A',
  accent: '#DEAB22',

  // Semantic – calm, non-alarming
  expense: '#5E72E4',       // calm blue — reduces financial anxiety
  income: '#4F5104',        // olive — neutral direction indicator
  danger: '#B8AFBC',        // neutral — no red ever
  warning: '#DEAB22',       // warm gold — gentle
  info: '#6BA3BE',
  success: '#4F5104',       // olive accent — no green as success
  error: '#B8AFBC',         // neutral — no red ever

  // Mode accent
  personal: '#4F5104',      // olive green
  business: '#B2780A',      // warm bronze (yellow-orange, muted)

  // Surfaces
  background: '#FFFFFF',
  surface: '#F8F9FE',
  surfaceAlt: '#F1F3F9',
  card: '#FFFFFF',
  overlay: 'rgba(17, 24, 39, 0.6)',

  // Text
  text: '#1F2937',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3B4',

  // Borders
  border: '#E4E7F0',
  borderLight: '#F1F3F9',

  // Charts — palette-aligned, no red, no bright green
  chart1: '#4F5104',
  chart2: '#B2780A',
  chart3: '#DEAB22',
  chart4: '#6BA3BE',
  chart5: '#A06CD5',
  chart6: '#B8AFBC',
};

// ─── DARK MODE COLORS ───────────────────────────────────────────
export const COLORS_DARK = {
  // Brand colors — olive palette
  primary: '#4F5104',
  secondary: '#B2780A',
  accent: '#DEAB22',

  // Semantic colors — calm
  expense: '#5E72E4',
  income: '#4F5104',
  danger: '#B8AFBC',
  warning: '#DEAB22',
  info: '#6BA3BE',
  success: '#4F5104',
  error: '#B8AFBC',

  // Mode accent
  personal: '#4F5104',
  business: '#B2780A',

  // Surfaces (dark)
  background: '#0F1419',
  surface: '#1A1F2E',
  surfaceAlt: '#252B3B',
  card: '#1E2433',
  overlay: 'rgba(0, 0, 0, 0.7)',

  // Text (inverted)
  text: '#F8F9FE',
  textSecondary: '#A1A8B8',
  textTertiary: '#6B7280',

  // Borders (dark)
  border: '#2D3548',
  borderLight: '#252B3B',

  // Charts
  chart1: '#4F5104',
  chart2: '#B2780A',
  chart3: '#DEAB22',
  chart4: '#6BA3BE',
  chart5: '#A06CD5',
  chart6: '#B8AFBC',
};

// ─── TYPOGRAPHY ─────────────────────────────────────────────
export const TYPOGRAPHY = {
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  weight: {
    extraLight: '200' as const,
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

// ─── LETTER SPACING ─────────────────────────────────────────────
export const LETTER_SPACING = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1,
  widest: 1.5,
};

// ─── ICON SIZES ─────────────────────────────────────────────────
export const ICON_SIZE = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 44,
  '2xl': 56,
};

// ─── SPACING (8pt grid) ───────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 16,
  xl: 24,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 56,
  '7xl': 64,
};

// ─── BORDER RADIUS ──────────────────────────────────────────
export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
};

// ─── SHADOWS ────────────────────────────────────────────────
// Spec: no drop shadows with opacity above 0.06
export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  '2xl': {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 5,
  },
};

// Helper function for colored shadows — capped at 0.06 per spec
export const coloredShadow = (color: string) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
});

// ─── BLUR VALUES ────────────────────────────────────────────────
export const BLUR = {
  none: 0,
  sm: 10,
  md: 20,
  lg: 40,
  xl: 60,
};

// ─── ANIMATION ──────────────────────────────────────────────
export const ANIMATION = {
  fast: 150,
  normal: 200,
  slow: 450,
};

// ─── CATEGORIES ─────────────────────────────────────────────
// Calm palette — no red, no orange, no bright green.

export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', icon: 'coffee', color: '#C4956A' },
  { id: 'transport', name: 'Transportation', icon: 'truck', color: '#5E72E4' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#DEAB22' },
  { id: 'entertainment', name: 'Entertainment', icon: 'film', color: '#A06CD5' },
  { id: 'bills', name: 'Bills & Utilities', icon: 'file-text', color: '#4F5104' },
  { id: 'health', name: 'Healthcare', icon: 'heart', color: '#6BA3BE' },
  { id: 'education', name: 'Education', icon: 'book', color: '#8B7355' },
  { id: 'family', name: 'Family', icon: 'users', color: '#7C8DA4' },
  { id: 'subscription', name: 'Subscriptions', icon: 'repeat', color: '#7C5CFC' },
  { id: 'business cost', name: 'Business Cost', icon: 'briefcase', color: '#B2780A' },
  { id: 'other', name: 'Other', icon: 'more-horizontal', color: '#9CA3B4' },
];

export const INCOME_CATEGORIES: CategoryOption[] = [
  { id: 'salary', name: 'Salary', icon: 'dollar-sign', color: '#4F5104' },
  { id: 'freelance', name: 'Freelance', icon: 'briefcase', color: '#5E72E4' },
  { id: 'business', name: 'Business', icon: 'trending-up', color: '#B2780A' },
  { id: 'investment', name: 'Investment', icon: 'pie-chart', color: '#A06CD5' },
  { id: 'gift', name: 'Gift', icon: 'gift', color: '#C4956A' },
  { id: 'from business', name: 'From Business', icon: 'refresh-cw', color: '#6BA3BE' },
  { id: 'other', name: 'Other', icon: 'plus-circle', color: '#9CA3B4' },
];

export const BUSINESS_EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'rent', name: 'Rent & Lease', icon: 'home', color: '#5E72E4' },
  { id: 'inventory', name: 'Inventory / COGS', icon: 'package', color: '#DEAB22' },
  { id: 'payroll', name: 'Payroll & Wages', icon: 'users', color: '#4F5104' },
  { id: 'marketing', name: 'Marketing & Ads', icon: 'target', color: '#C4956A' },
  { id: 'utilities', name: 'Utilities', icon: 'zap', color: '#6BA3BE' },
  { id: 'office', name: 'Office Supplies', icon: 'clipboard', color: '#A06CD5' },
  { id: 'travel', name: 'Travel & Meetings', icon: 'map-pin', color: '#8B7355' },
  { id: 'insurance', name: 'Insurance', icon: 'shield', color: '#7C8DA4' },
  { id: 'maintenance', name: 'Maintenance', icon: 'tool', color: '#B2780A' },
  { id: 'professional', name: 'Professional Services', icon: 'briefcase', color: '#7C5CFC' },
  { id: 'shipping', name: 'Shipping & Delivery', icon: 'truck', color: '#6BA3BE' },
  { id: 'other', name: 'Other', icon: 'more-horizontal', color: '#9CA3B4' },
];

export const BUSINESS_INCOME_CATEGORIES: CategoryOption[] = [
  { id: 'sales', name: 'Sales Revenue', icon: 'shopping-cart', color: '#4F5104' },
  { id: 'services', name: 'Service Income', icon: 'tool', color: '#5E72E4' },
  { id: 'consulting', name: 'Consulting', icon: 'message-circle', color: '#A06CD5' },
  { id: 'commission', name: 'Commission', icon: 'percent', color: '#DEAB22' },
  { id: 'rental', name: 'Rental Income', icon: 'home', color: '#6BA3BE' },
  { id: 'interest', name: 'Interest & Returns', icon: 'trending-up', color: '#B2780A' },
  { id: 'other', name: 'Other', icon: 'plus-circle', color: '#9CA3B4' },
];

export const INVESTMENT_CATEGORIES: CategoryOption[] = [
  { id: 'tng_plus', name: 'TNG+', icon: 'smartphone', color: '#005ABD' },
  { id: 'robo_crypto', name: 'Robo Crypto', icon: 'cpu', color: '#B2780A' },
  { id: 'esa', name: 'ESA', icon: 'shield', color: '#6BA3BE' },
  { id: 'bank', name: 'Bank', icon: 'home', color: '#5E72E4' },
  { id: 'asb', name: 'ASB', icon: 'lock', color: '#4F5104' },
  { id: 'tabung_haji', name: 'Tabung Haji', icon: 'book', color: '#DEAB22' },
  { id: 'stocks', name: 'Stocks', icon: 'trending-up', color: '#A06CD5' },
  { id: 'gold', name: 'Gold', icon: 'star', color: '#C4956A' },
  { id: 'other', name: 'Other', icon: 'briefcase', color: '#9CA3B4' },
];

export const PRODUCT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Beverages', icon: 'coffee', color: '#C4956A' },
  { id: 'clothing', name: 'Clothing', icon: 'shopping-bag', color: '#A06CD5' },
  { id: 'electronics', name: 'Electronics', icon: 'smartphone', color: '#5E72E4' },
  { id: 'accessories', name: 'Accessories', icon: 'watch', color: '#DEAB22' },
  { id: 'books', name: 'Books', icon: 'book', color: '#8B7355' },
  { id: 'toys', name: 'Toys', icon: 'gift', color: '#7C5CFC' },
  { id: 'health', name: 'Health & Beauty', icon: 'heart', color: '#6BA3BE' },
  { id: 'home', name: 'Home & Garden', icon: 'home', color: '#4F5104' },
  { id: 'other', name: 'Other', icon: 'grid', color: '#9CA3B4' },
];

export const BILLING_CYCLES = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

export const BUDGET_PERIODS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

export const PAYMENT_METHODS = [
  { label: 'Cash', value: 'cash', icon: 'dollar-sign' },
  { label: 'Digital Payment', value: 'digital', icon: 'smartphone' },
  { label: 'Card', value: 'card', icon: 'credit-card' },
];

export const SPLIT_METHODS = [
  { label: 'Equal', value: 'equal', icon: 'users', description: 'Split evenly among all' },
  { label: 'Custom', value: 'custom', icon: 'sliders', description: 'Set amount per person' },
  { label: 'By Item', value: 'item_based', icon: 'list', description: 'Assign items to people' },
];

export const DEBT_TYPES = [
  { label: 'I Owe', value: 'i_owe', icon: 'arrow-up-circle', color: '#8E8E93' },
  { label: 'They Owe Me', value: 'they_owe', icon: 'arrow-down-circle', color: '#4F5104' },
];

export const DEBT_STATUSES = [
  { label: 'Pending', value: 'pending', color: '#4F5104' },
  { label: 'Partial', value: 'partial', color: '#8E8E93' },
  { label: 'Settled', value: 'settled', color: '#B2780A' },
];

export const RECEIPT_SCANNER_CONFIG = {
  apiUrl: 'https://vision.googleapis.com/v1/images:annotate',
  apiKey: process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || 'YOUR_API_KEY_HERE',
};

export const APP_CONFIG = {
  currency: 'RM',
  dateFormat: 'MMM dd, yyyy',
  timeFormat: 'HH:mm',
  lowStockThreshold: 10,
  reminderDaysBeforeBilling: 3,
  offlineSyncInterval: 300000,
};

// ─── CALM DESIGN SYSTEM ────────────────────────────────────
// Olive palette: #332D03, #4F5104, #B2780A, #DEAB22, #B8AFBC
export const CALM = {
  background: '#F9F9F7',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textMuted: '#A0A0A0',
  accent: '#4F5104',        // olive green — one per screen
  positive: '#4F5104',      // olive (no green as success)
  neutral: '#B8AFBC',
  border: '#EBEBEB',
  bar: '#D4D4D4',
  barActive: '#4F5104',
  highlight: '#FFF7E6',
  gold: '#DEAB22',
  bronze: '#B2780A',
  deepOlive: '#332D03',
  lavender: '#B8AFBC',
};

// ─── BUSINESS SEMANTIC COLORS ──────────────────────────────
// Softer, pleasant tones — visually distinct without being heavy/depressing.
export const BIZ = {
  profit: '#332D03',        // deep olive — earned value, authoritative
  loss: '#B2780A',          // bronze — loss / negative, warm warning
  overdue: '#B87333',       // burnt orange — urgent but not depressing
  unpaid: '#C4956A',        // warm sand — gentle reminder
  pending: '#D4884A',       // warm amber-orange — urges action
  success: '#6BA3BE',       // calm teal-blue — settled, positive
  warning: '#D4A03C',       // warm gold — needs attention
  error: '#A0714A',         // burnt sienna — error state (no red)
};

// ─── TYPE SCALE ────────────────────────────────────────────
// Spec: numbers use tabular figures, large balances fontWeight 200-300
export const TYPE = {
  hero: { fontSize: 48, fontWeight: '200' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  insight: { fontSize: 14, lineHeight: 22 },
  label: { fontSize: 12, color: '#6B6B6B', textTransform: 'uppercase' as const, letterSpacing: 1 },
  balance: { fontSize: 36, fontWeight: '300' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  muted: { fontSize: 12, color: '#A0A0A0' },
  amount: { fontSize: 48, fontWeight: '200' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

// ─── HELPERS ────────────────────────────────────────────────
/** Safely derive a translucent version of any hex colour. */
export const withAlpha = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
