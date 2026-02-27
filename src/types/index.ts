// Core App Types
export type AppMode = 'personal' | 'business';

// Business Income Types
export type IncomeType = 'seller' | 'freelance' | 'parttime' | 'rider' | 'mixed';

export type IncomeStream = {
  id: string;
  label: string;
  type: IncomeType;
  color?: string;
};

export type BusinessTransaction = {
  id: string;
  date: Date;
  amount: number;
  type: 'income' | 'cost';
  streamId?: string;
  clientId?: string;
  note?: string;
  rawInput?: string;
  inputMethod?: 'manual' | 'text' | 'voice';
  category?: string;
};

export type Client = {
  id: string;
  name: string;
  totalPaid: number;
  lastPaid?: Date;
  paymentHistory: { date: Date; amount: number }[];
};

export type RiderCost = {
  id: string;
  date: Date;
  type: 'petrol' | 'maintenance' | 'data' | 'other';
  amount: number;
  note?: string;
};

export type Transfer = {
  id: string;
  amount: number;
  fromMode: 'business' | 'personal';
  toMode: 'business' | 'personal';
  note?: string;
  linkedBusinessTxId?: string;
  date: Date;
};

// ─── SELLER TYPES ─────────────────────────────────────────
export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'delivered' | 'paid';

export interface SellerProduct {
  id: string;
  name: string;
  pricePerUnit: number;
  costPerUnit?: number;
  unit: string; // 'tin', 'bekas', 'balang', 'pack', 'piece'
  isActive: boolean;
  totalSold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SellerOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

export interface SellerOrder {
  id: string;
  items: SellerOrderItem[];
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  status: OrderStatus;
  isPaid: boolean;
  note?: string;
  rawWhatsApp?: string;
  date: Date;
  deliveryDate?: Date;
  seasonId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  note?: string;
  createdAt: Date;
}

export interface IngredientCost {
  id: string;
  productId?: string;
  description: string;
  amount: number;
  date: Date;
  seasonId?: string;
}

export interface SellerState {
  products: SellerProduct[];
  orders: SellerOrder[];
  seasons: Season[];
  ingredientCosts: IngredientCost[];

  addProduct: (product: Omit<SellerProduct, 'id' | 'totalSold' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<SellerProduct>) => void;
  deleteProduct: (id: string) => void;

  addOrder: (order: Omit<SellerOrder, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  markOrderPaid: (id: string) => void;
  deleteOrder: (id: string) => void;

  addSeason: (season: Omit<Season, 'id' | 'createdAt'>) => void;
  endSeason: (id: string) => void;
  getActiveSeason: () => Season | null;

  addIngredientCost: (cost: Omit<IngredientCost, 'id'>) => void;
  deleteIngredientCost: (id: string) => void;

  getSeasonOrders: (seasonId: string) => SellerOrder[];
  getSeasonCosts: (seasonId: string) => IngredientCost[];
  getSeasonStats: (seasonId: string) => {
    totalOrders: number;
    totalIncome: number;
    totalCosts: number;
    kept: number;
    unpaidCount: number;
    unpaidAmount: number;
  };
}

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
  AccountOverview: undefined;
  SavingsTracker: undefined;
  MoneyChat: undefined;
  BusinessSetup: undefined;
  LogIncome: undefined;
  ClientList: undefined;
  RiderCosts: undefined;
  IncomeStreams: undefined;
  SellerNewOrder: undefined;
  SellerOrderList: undefined;
  SellerProducts: undefined;
  SeasonSummary: { seasonId?: string } | undefined;
  PastSeasons: undefined;
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
  LogIncome: undefined;
  // Seller tabs
  SellerOrders: undefined;
  SellerNewOrder: undefined;
  SellerProducts: undefined;
  SellerSeasons: undefined;
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
  // AI enrichment fields
  timeContext?: 'morning' | 'afternoon' | 'night';
  dayContext?: 'weekday' | 'weekend';
  sizeContext?: 'tiny' | 'medium' | 'heavy';
  frequencyContext?: 'isolated' | 'clustered';
  emotionalFlag?: boolean;
  rawInput?: string;
  inputMethod?: 'manual' | 'text' | 'photo' | 'voice';
  confidence?: 'high' | 'low';
  createdAt: Date;
  updatedAt: Date;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  startDate: Date;
  nextBillingDate: Date;
  category: string;
  isActive: boolean;
  reminderDays: number;
  isInstallment: boolean;
  totalInstallments?: number;
  completedInstallments?: number;
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
  discount?: number;
  subtotalBeforeDiscount?: number;
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
  address?: string;
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
  addTransferIncome: (transfer: Transfer) => void;
}

export interface BusinessState {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  incomeType: IncomeType | null;
  businessSetupComplete: boolean;
  businessTransactions: BusinessTransaction[];
  clients: Client[];
  riderCosts: RiderCost[];
  incomeStreams: IncomeStream[];
  transfers: Transfer[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'isSynced'>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteProduct: (id: string) => void;
  deleteSupplier: (id: string) => void;
  setIncomeType: (type: IncomeType) => void;
  completeSetup: () => void;
  addBusinessTransaction: (tx: Omit<BusinessTransaction, 'id'>) => void;
  addClient: (client: Omit<Client, 'id' | 'totalPaid' | 'paymentHistory'>) => void;
  logClientPayment: (clientId: string, amount: number, date: Date) => void;
  addRiderCost: (cost: Omit<RiderCost, 'id'>) => void;
  addIncomeStream: (stream: Omit<IncomeStream, 'id'>) => void;
  addTransfer: (transfer: Transfer) => void;
  getTotalTransferredToPersonal: (month: Date) => number;
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

// Savings / Investment Types
export type SavingsAccountType = 'tng_plus' | 'robo_crypto' | 'esa' | 'bank' | 'other';

export interface SavingsSnapshot {
  id: string;
  value: number;
  note?: string;
  date: Date;
}

export interface SavingsAccount {
  id: string;
  name: string;
  type: SavingsAccountType;
  description?: string;
  initialInvestment: number;
  currentValue: number;
  history: SavingsSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SavingsState {
  accounts: SavingsAccount[];
  addAccount: (account: Omit<SavingsAccount, 'id' | 'history' | 'createdAt' | 'updatedAt'>) => void;
  updateAccount: (id: string, updates: Partial<SavingsAccount>) => void;
  deleteAccount: (id: string) => void;
  addSnapshot: (accountId: string, value: number, note?: string) => void;
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