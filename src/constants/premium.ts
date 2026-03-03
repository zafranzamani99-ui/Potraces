// Premium subscription configuration

export const FREE_TIER = {
  maxWallets: 2,
  maxBudgets: 5,
  maxScansPerMonth: 15,
  exportData: true,
  googleDocsSync: false,
};

export const PREMIUM_TIER = {
  maxWallets: Infinity,
  maxBudgets: Infinity,
  maxScansPerMonth: Infinity,
  exportData: true,
  googleDocsSync: true,
};

export const PREMIUM_CONFIG = {
  price: 10,
  currency: 'RM',
  period: 'month' as const,
};

// Wallet icon presets (Feather icon names)
export const WALLET_ICONS = [
  'credit-card',
  'dollar-sign',
  'briefcase',
  'home',
  'gift',
  'trending-up',
  'smartphone',
  'globe',
] as const;

// Wallet color presets
export const WALLET_COLORS = [
  '#4F5104',
  '#6BA3BE',
  '#B2780A',
  '#DEAB22',
  '#8B6F4E',
  '#332D03',
  '#C4956A',
  '#B8AFBC',
] as const;
