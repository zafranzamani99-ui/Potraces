// Core App Types
export type AppMode = 'personal' | 'business';

// Navigation Types
export type RootStackParamList = {
  PersonalMain: undefined;
  BusinessMain: undefined;
  PersonalReports: undefined;
  BusinessReports: undefined;
  TransactionsList: undefined;
  SubscriptionList: undefined;
  SupplierList: undefined;
  DebtTracking: { receiptData?: { vendor: string; total: number; items: { name: string; amount: number }[] } } | undefined;
  ReceiptScanner: undefined;
  WalletManagement: undefined;
};

export type PersonalStackParamList = {
  Dashboard: undefined;
  ExpenseEntry: undefined;
  ReceiptScanner: undefined;
  BudgetPlanning: undefined;
  Settings: undefined;
};

export type BusinessStackParamList = {
  Dashboard: undefined;
  POS: undefined;
  CRM: undefined;
  Inventory: undefined;
  Settings: undefined;
};

export interface Transaction {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: 'income' | 'expense';
  mode: AppMode;
  walletId?: string;
  receiptUrl?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  nextBillingDate: Date;
  category: string;
  isActive: boolean;
  reminderDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Budget {
  id: string;
  category: string;
  allocatedAmount: number;
  spentAmount: number;
  period: 'monthly' | 'weekly' | 'yearly';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  lowStockThreshold: number;
  category: string;
  imageUrl?: string;
  barcode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'digital' | 'card';
  customerName?: string;
  date: Date;
  isSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  products: string[];
  totalPurchased: number;
  lastPurchaseDate?: Date;
  paymentTerms?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Debt & Split Types
export type DebtType = 'i_owe' | 'they_owe';
export type DebtStatus = 'pending' | 'partial' | 'settled';
export type SplitMethod = 'equal' | 'custom' | 'item_based';

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  isFromPhone: boolean;
}

export interface Payment {
  id: string;
  amount: number;
  date: Date;
  note?: string;
  createdAt: Date;
}

export interface Debt {
  id: string;
  contact: Contact;
  type: DebtType;
  totalAmount: number;
  paidAmount: number;
  status: DebtStatus;
  description: string;
  category?: string;
  payments: Payment[];
  mode: AppMode;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SplitParticipant {
  contact: Contact;
  amount: number;
  isPaid: boolean;
}

export interface SplitItem {
  name: string;
  amount: number;
  assignedTo: Contact[];
}

export interface SplitExpense {
  id: string;
  description: string;
  totalAmount: number;
  splitMethod: SplitMethod;
  participants: SplitParticipant[];
  items: SplitItem[];
  paidBy: Contact;
  category?: string;
  mode: AppMode;
  createdAt: Date;
  updatedAt: Date;
}

// Receipt Scanner Types
export interface ReceiptItem {
  name: string;
  amount: number;
}

export interface ExtractedReceipt {
  vendor?: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  date?: string;
  rawText: string;
}

// CRM Types
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerOrder {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'completed' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number;
  date: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CRMState {
  customers: Customer[];
  orders: CustomerOrder[];
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addOrder: (order: Omit<CustomerOrder, 'id' | 'paidAmount' | 'paymentStatus' | 'createdAt' | 'updatedAt'>) => void;
  updateOrder: (id: string, updates: Partial<CustomerOrder>) => void;
  deleteOrder: (id: string) => void;
  addOrderPayment: (orderId: string, amount: number) => void;
  getCustomerStats: (customerId: string) => { totalSpent: number; orderCount: number; outstanding: number };
}

export interface AppState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export interface PersonalState {
  transactions: Transaction[];
  subscriptions: Subscription[];
  budgets: Budget[];
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addSubscription: (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSubscription: (id: string, updates: Partial<Subscription>) => void;
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'spentAmount'>) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteSubscription: (id: string) => void;
  deleteBudget: (id: string) => void;
}

export interface BusinessState {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'isSynced'>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteProduct: (id: string) => void;
  deleteSupplier: (id: string) => void;
}

export interface DebtState {
  debts: Debt[];
  splits: SplitExpense[];
  contacts: Contact[];

  addDebt: (debt: Omit<Debt, 'id' | 'paidAmount' | 'status' | 'payments' | 'createdAt' | 'updatedAt'>) => void;
  updateDebt: (id: string, updates: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  addPayment: (debtId: string, payment: Omit<Payment, 'id' | 'createdAt'>) => void;

  addSplit: (split: Omit<SplitExpense, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSplit: (id: string, updates: Partial<SplitExpense>) => void;
  deleteSplit: (id: string) => void;
  markSplitParticipantPaid: (splitId: string, contactId: string) => void;

  addContact: (contact: Omit<Contact, 'id'>) => void;
  deleteContact: (id: string) => void;
}

export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    data: number[];
    color?: (opacity: number) => string;
  }[];
}

// Wallet Types
export type PremiumTier = 'free' | 'premium';

export interface Wallet {
  id: string;
  name: string;
  balance: number;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletState {
  wallets: Wallet[];
  selectedWalletId: string | null;
  addWallet: (wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;
  deleteWallet: (id: string) => void;
  setSelectedWallet: (id: string | null) => void;
  setDefaultWallet: (id: string) => void;
  deductFromWallet: (id: string, amount: number) => void;
  addToWallet: (id: string, amount: number) => void;
}

export interface PremiumState {
  tier: PremiumTier;
  subscribedAt: Date | null;
  scanCount: number;
  scanResetDate: Date;
  subscribe: () => void;
  unsubscribe: () => void;
  incrementScanCount: () => void;
  resetScanCountIfNeeded: () => void;
  canCreateWallet: (currentCount: number) => boolean;
  canCreateBudget: (currentCount: number) => boolean;
  canScanReceipt: () => boolean;
  getRemainingScans: () => number;
}