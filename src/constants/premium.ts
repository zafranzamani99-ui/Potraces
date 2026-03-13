// Premium subscription configuration
import { WalletType } from '../types';

export const FREE_TIER = {
  maxWallets: 3,
  maxWalletsPerType: 1,
  maxBudgets: 5,
  maxScansPerMonth: 15,
  maxAiCallsPerMonth: 100,
  exportData: true,
  googleDocsSync: false,
};

export const PREMIUM_TIER = {
  maxWallets: Infinity,
  maxBudgets: Infinity,
  maxScansPerMonth: Infinity,
  maxAiCallsPerMonth: Infinity,
  exportData: true,
  googleDocsSync: true,
};

export const TRIAL_DAYS = 7;

export const PREMIUM_CONFIG = {
  price: 10,
  currency: 'RM',
  period: 'month' as const,
};

// Wallet icon presets (Feather icon names) — generic fallback
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

// Type-specific wallet icons
export const WALLET_ICONS_BY_TYPE: Record<WalletType, string[]> = {
  bank: ['home', 'briefcase', 'dollar-sign', 'shield', 'lock', 'globe'],
  ewallet: ['smartphone', 'zap', 'send', 'wifi', 'gift', 'globe'],
  credit: ['credit-card', 'shopping-bag', 'tag', 'percent', 'shopping-cart', 'gift'],
};

// Wallet color presets — vivid + muted mix for brand matching
export const WALLET_COLORS = [
  '#E53935',  // red
  '#F57C00',  // orange
  '#FFC300',  // bright yellow
  '#00B14F',  // green
  '#0052A5',  // blue
  '#5E72E4',  // indigo
  '#A06CD5',  // purple
  '#E91E8C',  // pink
  '#00897B',  // teal
  '#4F5104',  // olive
  '#B2780A',  // bronze
  '#332D03',  // dark olive
  '#8B6F4E',  // brown
  '#6BA3BE',  // sky blue
  '#1A2B6B',  // navy
  '#010101',  // black
] as const;

// Malaysian wallet presets
export interface WalletPreset {
  id: string;
  name: string;
  type: WalletType;
  icon: string;
  color: string;
}

export const WALLET_PRESETS: WalletPreset[] = [
  // Banks
  { id: 'maybank', name: 'Maybank', type: 'bank', icon: 'home', color: '#FFC300' },
  { id: 'cimb', name: 'CIMB', type: 'bank', icon: 'home', color: '#EC1C24' },
  { id: 'public_bank', name: 'Public Bank', type: 'bank', icon: 'home', color: '#ED1C24' },
  { id: 'rhb', name: 'RHB', type: 'bank', icon: 'home', color: '#0052A5' },
  { id: 'hong_leong', name: 'Hong Leong', type: 'bank', icon: 'home', color: '#005BAA' },
  { id: 'ambank', name: 'AmBank', type: 'bank', icon: 'home', color: '#007D3A' },
  { id: 'bank_islam', name: 'Bank Islam', type: 'bank', icon: 'home', color: '#008D4F' },
  { id: 'bsn', name: 'BSN', type: 'bank', icon: 'home', color: '#003DA5' },
  // E-Wallets
  { id: 'tng', name: 'Touch n Go', type: 'ewallet', icon: 'smartphone', color: '#005ABE' },
  { id: 'grabpay', name: 'GrabPay', type: 'ewallet', icon: 'smartphone', color: '#00B14F' },
  { id: 'boost', name: 'Boost', type: 'ewallet', icon: 'smartphone', color: '#EE2E24' },
  { id: 'shopee_pay', name: 'ShopeePay', type: 'ewallet', icon: 'smartphone', color: '#EE4D2D' },
  { id: 'bigpay', name: 'BigPay', type: 'ewallet', icon: 'smartphone', color: '#1A2B6B' },
  { id: 'mae', name: 'MAE', type: 'ewallet', icon: 'smartphone', color: '#FFC300' },
  // Credit/BNPL
  { id: 'atome', name: 'Atome', type: 'credit', icon: 'credit-card', color: '#00D4AA' },
  { id: 'spaylater', name: 'SPayLater', type: 'credit', icon: 'credit-card', color: '#EE4D2D' },
  { id: 'grab_paylater', name: 'Grab PayLater', type: 'credit', icon: 'credit-card', color: '#00B14F' },
  { id: 'credit_card', name: 'Credit Card', type: 'credit', icon: 'credit-card', color: '#4F5104' },
  { id: 'tiktok_paylater', name: 'TikTok PayLater', type: 'credit', icon: 'credit-card', color: '#010101' },
];

// Wallet type labels and icons
export const WALLET_TYPE_CONFIG: Record<WalletType, { label: string; icon: string; description: string }> = {
  bank: { label: 'Bank Account', icon: 'home', description: 'Maybank, CIMB, Public Bank...' },
  ewallet: { label: 'E-Wallet', icon: 'smartphone', description: 'TnG, GrabPay, ShopeePay...' },
  credit: { label: 'Credit / BNPL', icon: 'credit-card', description: 'Atome, SPayLater, Credit Card...' },
};
