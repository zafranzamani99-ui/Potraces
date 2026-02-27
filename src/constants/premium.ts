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
  '#2DCE89',
  '#B2780A',
  '#FB8C3C',
  '#DEAB22',
  '#332D03',
  '#1DE9B6',
  '#B8AFBC',
] as const;
