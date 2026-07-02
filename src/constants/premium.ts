// Premium subscription configuration
import { WalletType } from '../types';

export const FREE_TIER = {
  maxWallets: 6,
  maxWalletsPerType: 2,
  maxBudgets: 5,
  maxScansPerMonth: 15,
  maxAiCallsPerMonth: 100,
  exportData: true,
  googleDocsSync: false,
  maxActivePlaybooks: 2,
  maxSavedPlaybooks: 5,
};

export const PREMIUM_TIER = {
  maxWallets: Infinity,
  maxBudgets: Infinity,
  maxScansPerMonth: Infinity,
  maxAiCallsPerMonth: Infinity,
  exportData: true,
  googleDocsSync: true,
  maxActivePlaybooks: 2,
  maxSavedPlaybooks: Infinity,
};

export const TRIAL_DAYS = 7;

export const PREMIUM_CONFIG = {
  price: 10,
  currency: 'RM',
  period: 'month' as const,
};

// Wallet icon presets (Feather icon names) — generic fallback
export const WALLET_ICONS = [
  'i/card',
  'm/cash',
  'i/briefcase',
  'm/bank',
  'i/gift',
  'i/trending-up',
  'm/cellphone',
  'm/web',
] as const;

// Type-specific wallet icons — 12 per type for meaningful choices
export const WALLET_ICONS_BY_TYPE: Record<WalletType, string[]> = {
  bank: ['m/bank', 'i/briefcase', 'm/cash', 'i/shield-checkmark', 'i/lock-closed', 'm/web', 'i/trending-up', 'm/trophy', 'm/umbrella', 'i/bookmark', 'm/archive', 'm/key'],
  ewallet: ['m/cellphone', 'i/flash', 'i/send', 'm/wifi', 'i/gift', 'm/web', 'm/coffee', 'i/bag-handle', 'm/truck-delivery', 'm/music', 'i/camera', 'i/card'],
  credit: ['i/card', 'i/bag-handle', 'i/pricetag', 'm/percent', 'm/cart', 'i/gift', 'i/star', 'i/time', 'i/repeat', 'm/layers', 'i/bookmark', 'm/trophy'],
};

// Wallet color presets — earthy + muted tones, no harsh reds/pinks
export const WALLET_COLORS = [
  '#C1694F',  // terracotta
  '#D4A052',  // warm amber
  '#D9BD55',  // muted gold
  '#00B14F',  // green
  '#0052A5',  // blue
  '#5E72E4',  // indigo
  '#A06CD5',  // purple
  '#7A8B69',  // sage
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
  { id: 'bank_rakyat', name: 'Bank Rakyat', type: 'bank', icon: 'home', color: '#00539F' },
  { id: 'bsn', name: 'BSN', type: 'bank', icon: 'home', color: '#003DA5' },
  { id: 'agrobank', name: 'Agrobank', type: 'bank', icon: 'home', color: '#00914C' },
  { id: 'mbsb', name: 'MBSB', type: 'bank', icon: 'home', color: '#1B4F8A' },
  { id: 'affin', name: 'Affin Bank', type: 'bank', icon: 'home', color: '#004A98' },
  { id: 'alliance', name: 'Alliance Bank', type: 'bank', icon: 'home', color: '#003399' },
  { id: 'hsbc_my', name: 'HSBC', type: 'bank', icon: 'home', color: '#DB0011' },
  { id: 'uob_my', name: 'UOB', type: 'bank', icon: 'home', color: '#003478' },
  { id: 'ocbc_my', name: 'OCBC', type: 'bank', icon: 'home', color: '#DD0000' },
  // E-Wallets
  { id: 'tng', name: 'Touch n Go', type: 'ewallet', icon: 'smartphone', color: '#005ABE' },
  { id: 'grabpay', name: 'GrabPay', type: 'ewallet', icon: 'smartphone', color: '#00B14F' },
  { id: 'boost', name: 'Boost', type: 'ewallet', icon: 'smartphone', color: '#EE2E24' },
  { id: 'shopee_pay', name: 'ShopeePay', type: 'ewallet', icon: 'smartphone', color: '#EE4D2D' },
  { id: 'bigpay', name: 'BigPay', type: 'ewallet', icon: 'smartphone', color: '#1A2B6B' },
  { id: 'setel', name: 'Setel', type: 'ewallet', icon: 'smartphone', color: '#005EB8' },
  { id: 'duitnow', name: 'DuitNow', type: 'ewallet', icon: 'smartphone', color: '#2E3192' },
  { id: 'gxbank', name: 'GXBank', type: 'ewallet', icon: 'smartphone', color: '#7049D8' },
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

// Wallet provider logo assets — full logos for tiles and wallet details
export const BANK_LOGOS: Record<string, any> = {
  // Banks
  maybank: require('../../assets/bank-logo/maybank logo.png'),
  cimb: require('../../assets/bank-logo/cimb logo.png'),
  public_bank: require('../../assets/bank-logo/public bank logo.png'),
  rhb: require('../../assets/bank-logo/RHB_Logo.svg.png'),
  hong_leong: require('../../assets/bank-logo/Hong-Leong-Bank-Logo.png'),
  ambank: require('../../assets/bank-logo/ambank logo.png'),
  bank_islam: require('../../assets/bank-logo/bank islam.png'),
  bank_rakyat: require('../../assets/bank-logo/bank-rakyat logo.png'),
  bsn: require('../../assets/bank-logo/bsn logo.png'),
  agrobank: require('../../assets/bank-logo/agro bank.png'),
  mbsb: require('../../assets/bank-logo/mbsb logo.png'),
  affin: require('../../assets/bank-logo/affin bank logo.png'),
  alliance: require('../../assets/bank-logo/alliance bank logo.png'),
  hsbc_my: require('../../assets/bank-logo/hsbc logo.png'),
  uob_my: require('../../assets/bank-logo/uob logo.png'),
  ocbc_my: require('../../assets/bank-logo/ocbc logo.png'),
  // Credit / BNPL
  atome: require('../../assets/credit-logo/atome-logo.png'),
  spaylater: require('../../assets/credit-logo/SPayLater-Logo.png'),
  grab_paylater: require('../../assets/credit-logo/grabpaylater.png'),
  credit_card: require('../../assets/credit-logo/creditcard-logo.png'),
  tiktok_paylater: require('../../assets/credit-logo/tiktokpaylater-logo.png'),
  // E-Wallets
  tng: require('../../assets/e-wallet/touchngo-logo.png'),
  grabpay: require('../../assets/e-wallet/grab-pay-logo.png'),
  boost: require('../../assets/e-wallet/boost-logo.png'),
  shopee_pay: require('../../assets/e-wallet/shopee-pay-logo.png'),
  bigpay: require('../../assets/e-wallet/BigPay-Logo.png'),
  setel: require('../../assets/e-wallet/setel-log.png'),
  gxbank: require('../../assets/e-wallet/gx-bank-logo.png'),
  duitnow: require('../../assets/e-wallet/duit-now-logo.png'),
};

// Small/icon logos for compact contexts (list rows, action sheet, expense entry)
// Falls back to BANK_LOGOS if no small version exists
export const BANK_LOGOS_SMALL: Record<string, any> = {
  maybank: require('../../assets/bank-logo/maybank-logo-small.png'),
  cimb: require('../../assets/bank-logo/cimb-logo-small.png'),
  public_bank: require('../../assets/bank-logo/public-bank-logo-small.png'),
  hong_leong: require('../../assets/bank-logo/Hong-Leong-Bank-Logo-small.png'),
  alliance: require('../../assets/bank-logo/alliance-bank-logo-small.png'),
  atome: require('../../assets/credit-logo/atome-logo-small.png'),
  spaylater: require('../../assets/credit-logo/spaylater-logo-small.png'),
};

export const CARD_NETWORK_LOGOS: Record<string, any> = {
  visa: require('../../assets/credit-logo/creditcard-logo/visa.png'),
  mastercard: require('../../assets/credit-logo/creditcard-logo/mastercard.png'),
  amex: require('../../assets/credit-logo/creditcard-logo/amex-logo.png'),
};
