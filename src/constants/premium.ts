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
  '#5B4FE9',
  '#2DCE89',
  '#F5365C',
  '#FB8C3C',
  '#11CDEF',
  '#8B7CFF',
  '#1DE9B6',
  '#FF6B9D',
] as const;
