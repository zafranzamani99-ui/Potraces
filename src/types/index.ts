// Core App Types
export type AppMode = 'personal' | 'business';

// Business Income Types
export type IncomeType = 'seller' | 'stall' | 'freelance' | 'parttime' | 'rider' | 'mixed';

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
  gapFromLastPayment?: number; // days since last payment from same client
  incomeStream?: 'main' | 'side'; // part-time mode: main job vs side income
  // On-the-road mode fields
  roadTransactionType?: 'earning' | 'cost';
  costCategory?: CostCategory;
  costCategoryOther?: string;
  platform?: string;
  streamLabel?: string;         // mixed mode: user-defined stream label
};

export type Client = {
  id: string;
  name: string;
  totalPaid: number;
  lastPaid?: Date;
  paymentHistory: { date: Date; amount: number }[];
};

export interface FreelancerClient {
  id: string;
  name: string;
  contact?: string;
  notes?: string;
  createdAt: string; // ISO date
  isAutoDetected: boolean;
}

export interface PartTimeJobDetails {
  jobName: string;
  expectedMonthlyPay?: number;
  payDay?: number; // 1-31
  setupComplete: boolean;
}

export interface OnTheRoadDetails {
  description: string;
  vehicleType: 'car' | 'motorcycle' | 'bicycle' | 'other';
  vehicleOther?: string;
  setupComplete: boolean;
}

export type CostCategory = 'petrol' | 'maintenance' | 'data' | 'toll' | 'parking' | 'insurance' | 'other';

export interface MixedModeDetails {
  streams: string[];
  hasRoadCosts: boolean;
  setupComplete: boolean;
}

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
export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'delivered' | 'completed';
export type SellerPaymentMethod = 'cash' | 'bank_transfer' | 'ewallet';

export interface SellerProduct {
  id: string;
  name: string;
  pricePerUnit: number;
  costPerUnit?: number;
  unit: string; // 'tin', 'bekas', 'balang', 'pack', 'piece'
  isActive: boolean;
  totalSold: number;
  trackStock?: boolean;
  stockQuantity?: number;
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
  orderNumber?: string;
  items: SellerOrderItem[];
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  totalAmount: number;
  status: OrderStatus;
  isPaid: boolean;
  paidAmount?: number;
  paymentMethod?: SellerPaymentMethod;
  paidAt?: Date;
  note?: string;
  rawWhatsApp?: string;
  date: Date;
  deliveryDate?: Date;
  seasonId?: string;
  transferredToPersonal?: boolean;
  transferId?: string;
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
  costBudget?: number;
  createdAt: Date;
}

export interface IngredientCost {
  id: string;
  productId?: string;
  description: string;
  amount: number;
  date: Date;
  seasonId?: string;
  syncedToPersonal?: boolean;
  personalTransactionId?: string;
}

export interface SellerCustomer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  createdAt: Date;
}

export interface CostTemplate {
  id: string;
  description: string;
  amount: number;
}

export interface SellerState {
  products: SellerProduct[];
  orders: SellerOrder[];
  seasons: Season[];
  ingredientCosts: IngredientCost[];
  sellerCustomers: SellerCustomer[];
  customUnits: string[];
  costTemplates: CostTemplate[];
  productOrder: string[];

  addProduct: (product: Omit<SellerProduct, 'id' | 'totalSold' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<SellerProduct>) => void;
  deleteProduct: (id: string) => void;
  setProductOrder: (ids: string[]) => void;

  addOrder: (order: Omit<SellerOrder, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  updateOrder: (id: string, updates: Partial<Pick<SellerOrder, 'customerName' | 'note' | 'deliveryDate' | 'customerPhone' | 'customerAddress' | 'isPaid' | 'paymentMethod' | 'paidAt'>>) => void;
  updateOrderItems: (id: string, items: SellerOrderItem[]) => void;
  recordPayment: (id: string, amount: number, paymentMethod: SellerPaymentMethod) => void;
  markOrderPaid: (id: string, paymentMethod: SellerPaymentMethod) => void;
  markOrdersPaid: (ids: string[], paymentMethod: SellerPaymentMethod) => void;
  deleteOrder: (id: string) => void;
  deleteOrders: (ids: string[]) => void;
  markOrdersTransferred: (ids: string[], transferId: string) => void;
  unmarkOrdersTransferred: (transferId: string) => void;

  addSeason: (season: Omit<Season, 'id' | 'createdAt'>) => void;
  endSeason: (id: string) => void;
  deleteSeason: (id: string) => void;
  getActiveSeason: () => Season | null;
  updateSeasonName: (seasonId: string, name: string) => void;
  updateSeasonBudget: (seasonId: string, budget: number | undefined) => void;

  addIngredientCost: (cost: Omit<IngredientCost, 'id'>) => string;
  updateIngredientCost: (id: string, updates: Partial<IngredientCost>) => void;
  deleteIngredientCost: (id: string) => void;
  markCostSynced: (id: string, personalTransactionId: string) => void;

  addCostTemplate: (template: Omit<CostTemplate, 'id'>) => void;
  updateCostTemplate: (id: string, updates: Partial<Omit<CostTemplate, 'id'>>) => void;
  deleteCostTemplate: (id: string) => void;

  addSellerCustomer: (customer: Omit<SellerCustomer, 'id' | 'createdAt'>) => void;
  updateSellerCustomer: (id: string, updates: Partial<SellerCustomer>) => void;
  deleteSellerCustomer: (id: string) => void;

  addCustomUnit: (unit: string) => void;
  deleteCustomUnit: (unit: string) => void;
  renameCustomUnit: (oldName: string, newName: string) => void;
  hiddenUnits: string[];
  hideUnit: (unit: string) => void;
  unhideUnit: (unit: string) => void;
  unitOrder: string[];
  setUnitOrder: (order: string[]) => void;

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

// ─── STALL TYPES ──────────────────────────────────────────
export type SessionCondition = 'good' | 'slow' | 'rainy' | 'hot' | 'normal';
export type StallPaymentMethod = 'cash' | 'qr';

export interface StallProduct {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  totalSold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StallSale {
  id: string;
  sessionId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  paymentMethod: StallPaymentMethod;
  regularCustomerId?: string;
  timestamp: Date;
}

export interface StallSession {
  id: string;
  name?: string;
  startedAt: Date;
  closedAt?: Date;
  isActive: boolean;
  condition?: SessionCondition;
  sales: StallSale[];
  productsSnapshot: { productId: string; productName: string; startQty: number; remainingQty: number }[];
  totalRevenue: number;
  totalCash: number;
  totalQR: number;
  note?: string;
  transferredToPersonal?: boolean;
  transferAmount?: number;
}

export interface RegularCustomer {
  id: string;
  name: string;
  usualOrder?: string;
  visitCount: number;
  lastVisit?: Date;
  note?: string;
  createdAt: Date;
}

export interface StallState {
  sessions: StallSession[];
  activeSessionId: string | null;
  products: StallProduct[];
  regularCustomers: RegularCustomer[];

  // Session actions
  startSession: (name?: string, productSetup?: { productId: string; startQty: number }[]) => string;
  closeSession: (condition?: SessionCondition, note?: string) => void;
  getActiveSession: () => StallSession | null;

  // Sale actions
  addSale: (sale: Omit<StallSale, 'id' | 'sessionId' | 'timestamp'>) => void;
  removeSale: (saleId: string) => void;

  // Product actions
  addProduct: (product: Omit<StallProduct, 'id' | 'totalSold' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<StallProduct>) => void;
  deleteProduct: (id: string) => void;

  // Regular customer actions
  addRegularCustomer: (customer: Omit<RegularCustomer, 'id' | 'visitCount' | 'createdAt'>) => void;
  updateRegularCustomer: (id: string, updates: Partial<RegularCustomer>) => void;
  deleteRegularCustomer: (id: string) => void;
  recordVisit: (customerId: string) => void;

  // Derived data
  getSessionSummary: (sessionId: string) => {
    totalRevenue: number;
    totalCash: number;
    totalQR: number;
    saleCount: number;
    productBreakdown: { productName: string; qtySold: number; revenue: number }[];
    avgSaleValue: number;
    duration: number; // minutes
  };
  getProductPerformance: (productId: string) => {
    totalSold: number;
    totalRevenue: number;
    sessionsAppeared: number;
    avgPerSession: number;
  };
  getLifetimeStats: () => {
    totalSessions: number;
    totalRevenue: number;
    avgPerSession: number;
    bestSession: StallSession | null;
  };

  // Transfer bridge
  markSessionTransferred: (sessionId: string, amount: number) => void;
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
  SellerNewOrder: { customerName?: string; customerPhone?: string; customerAddress?: string } | undefined;
  SellerOrderList: undefined;
  SellerProducts: undefined;
  SeasonSummary: { seasonId?: string } | undefined;
  PastSeasons: undefined;
  Goals: undefined;
  FinancialPulse: undefined;
  Settings: { scrollTo?: string } | undefined;
  SellerSettings: undefined;
  // Stall screens
  StallSessionSetup: undefined;
  StallCloseSession: undefined;
  StallSessionSummary: { sessionId: string };
  StallProducts: undefined;
  // Freelancer screens
  FreelancerClientList: undefined;
  FreelancerClientDetail: { clientId: string };
  FreelancerAddPayment: undefined;
  FreelancerReports: undefined;
  // Part-time screens
  PartTimeSetup: undefined;
  PartTimeAddIncome: { preSelectMain?: boolean } | undefined;
  PartTimeIncomeHistory: undefined;
  PartTimeReports: undefined;
  // On-the-road screens
  OnTheRoadSetup: undefined;
  OnTheRoadAddEarnings: undefined;
  OnTheRoadAddCost: undefined;
  OnTheRoadCostHistory: { filter?: string } | undefined;
  OnTheRoadReports: undefined;
  // Mixed mode screens
  MixedSetup: undefined;
  MixedAddIncome: undefined;
  MixedAddCost: undefined;
  MixedStreamHistory: { filter?: string } | undefined;
  MixedReports: undefined;
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
  SellerOrders: { initialFilter?: string } | undefined;
  SellerNewOrder: { customerName?: string; customerPhone?: string; customerAddress?: string } | undefined;
  SellerProducts: undefined;
  SellerSeasons: undefined;
  SellerCustomers: undefined;
  SellerManage: undefined;
  // Stall tabs
  StallDashboard: undefined;
  StallSell: undefined;
  StallHistory: undefined;
  StallRegulars: undefined;
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

export interface GoalContribution {
  id: string;
  amount: number;
  note?: string;
  date: Date;
}

export interface GoalMilestone {
  percentage: number; // 25, 50, 75, 100
  label: string;
  reached: boolean;
  reachedAt?: Date;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date;
  category: string;
  icon: string;
  color: string;
  contributions: GoalContribution[];
  milestones: GoalMilestone[];
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
export type TaxHandling = 'divide' | 'waive';

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  isFromPhone: boolean;
}

export interface PaymentEdit {
  editedAt: Date;
  previousAmount: number;
  previousNote?: string;
}

export interface Payment {
  id: string;
  amount: number;
  date: Date;
  note?: string;
  tipAmount?: number;
  linkedTransactionId?: string;
  walletId?: string;
  createdAt: Date;
  editLog?: PaymentEdit[];
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
  splitId?: string;
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
  paidBy?: Contact;
  category?: string;
  taxAmount?: number;
  taxHandling?: TaxHandling;
  linkedTransactionId?: string;
  walletId?: string;
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
  goals: Goal[];
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addSubscription: (subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSubscription: (id: string, updates: Partial<Subscription>) => void;
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'spentAmount'>) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteSubscription: (id: string) => void;
  deleteBudget: (id: string) => void;
  addTransferIncome: (transfer: Transfer) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'currentAmount' | 'contributions' | 'milestones' | 'createdAt' | 'updatedAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  contributeToGoal: (goalId: string, amount: number, note?: string) => void;
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
  addBusinessTransaction: (tx: Omit<BusinessTransaction, 'id'>) => string;
  deleteBusinessTransaction: (id: string) => void;
  addClient: (client: Omit<Client, 'id' | 'totalPaid' | 'paymentHistory'>) => void;
  logClientPayment: (clientId: string, amount: number, date: Date) => void;
  addRiderCost: (cost: Omit<RiderCost, 'id'>) => void;
  addIncomeStream: (stream: Omit<IncomeStream, 'id'>) => void;
  addTransfer: (transfer: Transfer) => void;
  deleteTransfer: (id: string) => void;
  getTotalTransferredToPersonal: (month: Date) => number;
}

export interface DebtState {
  debts: Debt[];
  splits: SplitExpense[];
  contacts: Contact[];

  addDebt: (debt: Omit<Debt, 'id' | 'paidAmount' | 'status' | 'payments' | 'createdAt' | 'updatedAt'>) => string;
  updateDebt: (id: string, updates: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  addPayment: (debtId: string, payment: Omit<Payment, 'id' | 'createdAt'>) => void;
  deletePayment: (debtId: string, paymentId: string) => void;
  updatePayment: (debtId: string, paymentId: string, updates: Partial<Pick<Payment, 'amount' | 'note'>>) => void;

  addSplit: (split: Omit<SplitExpense, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateSplit: (id: string, updates: Partial<SplitExpense>) => void;
  deleteSplit: (id: string) => void;
  markSplitParticipantPaid: (splitId: string, contactId: string) => void;
  unmarkSplitParticipantPaid: (splitId: string, contactId: string) => void;

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

// Savings / Investment Types (string to support custom investment categories)
export type SavingsAccountType = string;

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
export type WalletType = 'bank' | 'ewallet' | 'credit';

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
  icon: string;
  color: string;
  isDefault: boolean;
  presetId?: string;
  creditLimit?: number;
  usedCredit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransfer {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  note?: string;
  date: Date;
  createdAt: Date;
}

export interface WalletState {
  wallets: Wallet[];
  transfers: WalletTransfer[];
  selectedWalletId: string | null;
  addWallet: (wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;
  deleteWallet: (id: string) => void;
  setSelectedWallet: (id: string | null) => void;
  setDefaultWallet: (id: string) => void;
  deductFromWallet: (id: string, amount: number) => void;
  addToWallet: (id: string, amount: number) => void;
  transferBetweenWallets: (fromId: string, toId: string, amount: number, note?: string) => void;
  useCredit: (id: string, amount: number) => void;
  repayCredit: (id: string, amount: number) => void;
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