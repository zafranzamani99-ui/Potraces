import { MyTaxCategory, CategoryOption } from '../types';

// ─── LHDN TAX RELIEF CATEGORIES (YA 2025) ─────────────────
// Filed during April-June 2026
// Source: https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/

export const MYTAX_CATEGORIES: MyTaxCategory[] = [
  {
    id: 'none',
    name: 'Not Claimable',
    limit: null,
    description: 'No tax relief for this purchase',
    icon: 'x-circle',
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    limit: 2500,
    description: 'Books, computers, phones, tablets, internet, sports equipment',
    icon: 'smartphone',
  },
  {
    id: 'sports',
    name: 'Sports (Additional)',
    limit: 1000,
    description: 'Gym fees, sports equipment, competition entry fees',
    icon: 'activity',
  },
  {
    id: 'medical',
    name: 'Medical',
    limit: 10000,
    description: 'Treatment, dental (RM1k sub), vaccination (RM1k sub), mental health, screening',
    icon: 'heart',
  },
  {
    id: 'parents_medical',
    name: 'Parents Medical',
    limit: 8000,
    description: 'Parents medical treatment + check-ups (RM1k sub)',
    icon: 'users',
  },
  {
    id: 'education',
    name: 'Education (Self)',
    limit: 7000,
    description: 'Diploma+, professional quals, upskilling (RM2k sub)',
    icon: 'book-open',
  },
  {
    id: 'childcare',
    name: 'Childcare',
    limit: 3000,
    description: 'Registered nursery/kindergarten, child age 6 and below',
    icon: 'smile',
  },
  {
    id: 'breastfeeding',
    name: 'Breastfeeding',
    limit: 1000,
    description: 'Breast pumps & accessories (every 2 years, child age 2 and below)',
    icon: 'droplet',
  },
  {
    id: 'ev_charging',
    name: 'EV Charging',
    limit: 2500,
    description: 'EV charging equipment installation',
    icon: 'zap',
  },
  {
    id: 'sspn',
    name: 'SSPN',
    limit: 8000,
    description: 'Net deposits in national education savings scheme',
    icon: 'bookmark',
  },
  {
    id: 'insurance_epf',
    name: 'EPF + Life Insurance',
    limit: 7000,
    description: 'EPF (RM4k) + life insurance/takaful (RM3k)',
    icon: 'shield',
  },
  {
    id: 'education_insurance',
    name: 'Education/Medical Insurance',
    limit: 4000,
    description: 'Education or medical insurance/takaful',
    icon: 'umbrella',
  },
  {
    id: 'prs',
    name: 'PRS / Deferred Annuity',
    limit: 3000,
    description: 'Private retirement scheme contributions',
    icon: 'trending-up',
  },
  {
    id: 'domestic_travel',
    name: 'Domestic Travel',
    limit: 1000,
    description: 'Registered accommodation, tourist attractions in Malaysia',
    icon: 'map-pin',
  },
  {
    id: 'housing_loan',
    name: 'Housing Loan Interest',
    limit: 7000,
    description: 'First home loan interest (SPA 2025-2027)',
    icon: 'home',
  },
];

// ─── RECEIPT PAYMENT METHODS ───────────────────────────────
// Common Malaysian payment methods — stored as CategoryOption for reuse with CategoryPicker

export const DEFAULT_PAYMENT_METHODS: CategoryOption[] = [
  { id: 'cash', name: 'Cash', icon: 'dollar-sign', color: '#4F5104' },
  { id: 'debit_card', name: 'Debit Card', icon: 'credit-card', color: '#6BA3BE' },
  { id: 'credit_card', name: 'Credit Card', icon: 'credit-card', color: '#B2780A' },
  { id: 'tng', name: 'TNG eWallet', icon: 'smartphone', color: '#5E72E4' },
  { id: 'grabpay', name: 'GrabPay', icon: 'smartphone', color: '#2E7D5B' },
  { id: 'boost', name: 'Boost', icon: 'zap', color: '#DEAB22' },
  { id: 'shopee_pay', name: 'ShopeePay', icon: 'shopping-bag', color: '#C4956A' },
  { id: 'mae', name: 'MAE', icon: 'smartphone', color: '#A06CD5' },
  { id: 'bigpay', name: 'BigPay', icon: 'smartphone', color: '#7C5CFC' },
  { id: 'duitnow_qr', name: 'DuitNow QR', icon: 'maximize', color: '#332D03' },
  { id: 'fpx', name: 'FPX', icon: 'globe', color: '#B8AFBC' },
  { id: 'other', name: 'Other', icon: 'more-horizontal', color: '#8B7355' },
];

// Legacy compat — old code referencing RECEIPT_PAYMENT_METHODS
export const RECEIPT_PAYMENT_METHODS = DEFAULT_PAYMENT_METHODS.map((m) => ({ id: m.id, label: m.name }));
export type ReceiptPaymentMethodId = string;
