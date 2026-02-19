import { CategoryOption } from '../types';

// ─── DESIGN TOKENS ──────────────────────────────────────────
// Custom brand palette — intentionally NOT Tailwind defaults.
// Psychology: blue for expenses (calming), green for income (growth),
// red reserved strictly for errors / true danger.

export const COLORS = {
  // Brand
  primary: '#5B4FE9',
  secondary: '#22C993',
  accent: '#FF6B9D',

  // Semantic – psychology-driven
  expense: '#5E72E4',       // calm blue — reduces financial anxiety
  income: '#2DCE89',        // vibrant green — positive reinforcement
  danger: '#F5365C',        // true errors only
  warning: '#FB8C3C',       // warm orange — gentle
  info: '#11CDEF',
  success: '#2DCE89',
  error: '#F5365C',

  // Mode accent
  personal: '#5B4FE9',
  business: '#22C993',

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

  // Charts
  chart1: '#5B4FE9',
  chart2: '#2DCE89',
  chart3: '#FB8C3C',
  chart4: '#FF6B9D',
  chart5: '#11CDEF',
  chart6: '#A06CD5',
};

// ─── DARK MODE COLORS ───────────────────────────────────────────
export const COLORS_DARK = {
  // Brand colors remain same for brand consistency
  primary: '#5B4FE9',
  secondary: '#22C993',
  accent: '#FF6B9D',

  // Semantic colors remain same for accessibility
  expense: '#5E72E4',
  income: '#2DCE89',
  danger: '#F5365C',
  warning: '#FB8C3C',
  info: '#11CDEF',
  success: '#2DCE89',
  error: '#F5365C',

  // Mode accent (same)
  personal: '#5B4FE9',
  business: '#22C993',

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

  // Charts (same for data consistency)
  chart1: '#5B4FE9',
  chart2: '#2DCE89',
  chart3: '#FB8C3C',
  chart4: '#FF6B9D',
  chart5: '#11CDEF',
  chart6: '#A06CD5',
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

// ─── SPACING (8 px grid) ───────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
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
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  '2xl': {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
};

// Helper function for colored shadows
export const coloredShadow = (color: string) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 12,
  elevation: 6,
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
  normal: 280,
  slow: 450,
};

// ─── CATEGORIES ─────────────────────────────────────────────
// Updated with vibrant, distinct colours per category.

export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Dining', icon: 'coffee', color: '#FF6B9D' },
  { id: 'transport', name: 'Transportation', icon: 'truck', color: '#5E72E4' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#FB8C3C' },
  { id: 'entertainment', name: 'Entertainment', icon: 'film', color: '#A06CD5' },
  { id: 'bills', name: 'Bills & Utilities', icon: 'file-text', color: '#22C993' },
  { id: 'health', name: 'Healthcare', icon: 'heart', color: '#FF5757' },
  { id: 'education', name: 'Education', icon: 'book', color: '#5B4FE9' },
  { id: 'family', name: 'Family', icon: 'users', color: '#2DCE89' },
  { id: 'subscription', name: 'Subscriptions', icon: 'repeat', color: '#FB8C3C' },
  { id: 'other', name: 'Other', icon: 'more-horizontal', color: '#9CA3B4' },
];

export const INCOME_CATEGORIES: CategoryOption[] = [
  { id: 'salary', name: 'Salary', icon: 'dollar-sign', color: '#2DCE89' },
  { id: 'freelance', name: 'Freelance', icon: 'briefcase', color: '#5E72E4' },
  { id: 'business', name: 'Business', icon: 'trending-up', color: '#5B4FE9' },
  { id: 'investment', name: 'Investment', icon: 'pie-chart', color: '#A06CD5' },
  { id: 'gift', name: 'Gift', icon: 'gift', color: '#FF6B9D' },
  { id: 'other', name: 'Other', icon: 'plus-circle', color: '#9CA3B4' },
];

export const PRODUCT_CATEGORIES: CategoryOption[] = [
  { id: 'food', name: 'Food & Beverages', icon: 'coffee', color: '#FF6B9D' },
  { id: 'clothing', name: 'Clothing', icon: 'shopping-bag', color: '#A06CD5' },
  { id: 'electronics', name: 'Electronics', icon: 'smartphone', color: '#5E72E4' },
  { id: 'accessories', name: 'Accessories', icon: 'watch', color: '#FB8C3C' },
  { id: 'books', name: 'Books', icon: 'book', color: '#5B4FE9' },
  { id: 'toys', name: 'Toys', icon: 'gift', color: '#FF6B9D' },
  { id: 'health', name: 'Health & Beauty', icon: 'heart', color: '#2DCE89' },
  { id: 'home', name: 'Home & Garden', icon: 'home', color: '#22C993' },
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
  { label: 'I Owe', value: 'i_owe', icon: 'arrow-up-circle', color: '#F5365C' },
  { label: 'They Owe Me', value: 'they_owe', icon: 'arrow-down-circle', color: '#2DCE89' },
];

export const DEBT_STATUSES = [
  { label: 'Pending', value: 'pending', color: '#FB8C3C' },
  { label: 'Partial', value: 'partial', color: '#5E72E4' },
  { label: 'Settled', value: 'settled', color: '#2DCE89' },
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

// ─── HELPERS ────────────────────────────────────────────────
/** Safely derive a translucent version of any hex colour. */
export const withAlpha = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
