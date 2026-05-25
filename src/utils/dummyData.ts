import { useWalletStore } from '../store/walletStore';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useSavingsStore } from '../store/savingsStore';
import { useNotesStore } from '../store/notesStore';
import { useReceiptStore } from '../store/receiptStore';

// ─── Persona ──────────────────────────────────────────────────────────
// Aiman, 25, marketing exec in KL.
// Gross salary RM 4,000 → take-home ≈ RM 3,420 after EPF/SOCSO/EIS/PCB.
// First-home buyer (PR1MA condo, 18 months into a 35-year loan).
// Drives a Perodua Myvi 1.5 (30 months into an 84-month loan).
// Lives in Subang, single, sends RM 300/mo to mom.
// Tight cashflow, building emergency fund in GXBank, slowly investing in ASB + Versa.
// ─────────────────────────────────────────────────────────────────────

const daysAgo = (n: number, hour = 12): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = (): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const loadDummyData = (): void => {
  const walletStore = useWalletStore.getState();
  const personalStore = usePersonalStore.getState();
  const debtStore = useDebtStore.getState();
  const savingsStore = useSavingsStore.getState();
  const notesStore = useNotesStore.getState();
  const receiptStore = useReceiptStore.getState();

  // ─── 1. Wallets — what a real 25yo actually has (9 wallets, not 34) ─
  // Banks
  walletStore.addWallet({ name: 'Maybank Savings',  type: 'bank', balance: 1420.00, icon: 'home', color: '#FFC300', isDefault: true,  presetId: 'maybank' });
  walletStore.addWallet({ name: 'CIMB Octosavers',  type: 'bank', balance: 2800.00, icon: 'home', color: '#EC1C24', isDefault: false, presetId: 'cimb' });
  walletStore.addWallet({ name: 'GXBank',           type: 'ewallet', balance: 8500.00, icon: 'smartphone', color: '#00A651', isDefault: false, presetId: 'gxbank' });

  // E-wallets (the ones actually opened daily)
  walletStore.addWallet({ name: "Touch 'n Go",      type: 'ewallet', balance:   65.00, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng' });
  walletStore.addWallet({ name: 'GrabPay',          type: 'ewallet', balance:   18.50, icon: 'smartphone', color: '#00B14F', isDefault: false, presetId: 'grabpay' });
  walletStore.addWallet({ name: 'ShopeePay',        type: 'ewallet', balance:    8.00, icon: 'smartphone', color: '#EE4D2D', isDefault: false, presetId: 'shopee_pay' });

  // BNPL
  walletStore.addWallet({ name: 'Atome',            type: 'credit', balance: 0, icon: 'credit-card', color: '#00D4AA', isDefault: false, presetId: 'atome', creditLimit: 1500, usedCredit: 320 });

  // Credit cards
  walletStore.addWallet({ name: 'Maybank Visa',     type: 'credit', balance: 0, icon: 'credit-card', color: '#FFC300', isDefault: false, presetId: 'credit_card', creditBank: 'maybank', creditNetwork: 'visa',       creditLimit: 8000, usedCredit: 1847 });
  walletStore.addWallet({ name: 'CIMB Mastercard',  type: 'credit', balance: 0, icon: 'credit-card', color: '#EC1C24', isDefault: false, presetId: 'credit_card', creditBank: 'cimb',    creditNetwork: 'mastercard', creditLimit: 5000, usedCredit:  580 });

  // Resolve wallet IDs
  const wallets = useWalletStore.getState().wallets;
  const w = (name: string) => wallets.find((wl) => wl.name === name)?.id;

  const maybankId   = w('Maybank Savings');
  const cimbId      = w('CIMB Octosavers');
  const gxbankId    = w('GXBank');
  const tngId       = w("Touch 'n Go");
  const grabpayId   = w('GrabPay');
  const shopeeId    = w('ShopeePay');
  const atomeId     = w('Atome');
  const visaId      = w('Maybank Visa');
  const mcId        = w('CIMB Mastercard');

  // ─── 2. Transactions — last 30 days, real cashflow ─────────────────
  // ─── Expenses (sorted newest → oldest)
  // Day 1 (today)
  personalStore.addTransaction({ amount:   9.50, category: 'food',          description: 'Zus Coffee — americano',                date: daysAgo(0,  8), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  12.00, category: 'food',          description: 'Lunch nasi campur',                     date: daysAgo(0, 13), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 2
  personalStore.addTransaction({ amount:  28.00, category: 'food',          description: 'GrabFood — Pak Cik Burger',             date: daysAgo(1, 21), type: 'expense', mode: 'personal', walletId: grabpayId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:   7.00, category: 'food',          description: 'Mamak teh tarik + roti canai',          date: daysAgo(1, 23), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 3
  personalStore.addTransaction({ amount:   8.00, category: 'food',          description: '7-Eleven energy drink',                 date: daysAgo(2,  7), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  19.40, category: 'food',          description: 'Llao Llao mango froyo',                 date: daysAgo(2, 15), type: 'expense', mode: 'personal', walletId: shopeeId,  inputMethod: 'manual' });

  // Day 4 — groceries day
  personalStore.addTransaction({ amount: 145.20, category: 'shopping',      description: "Lotus's groceries",                     date: daysAgo(3, 18), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  70.00, category: 'transport',     description: 'Petronas RON95',                        date: daysAgo(3, 19), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 5 — movie + dessert
  personalStore.addTransaction({ amount:  32.00, category: 'entertainment', description: 'TGV — Wicked Part 2',                   date: daysAgo(4, 21), type: 'expense', mode: 'personal', walletId: mcId,      inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  24.00, category: 'food',          description: 'Mixue ice cream',                       date: daysAgo(4, 22), type: 'expense', mode: 'personal', walletId: shopeeId,  inputMethod: 'manual' });

  // Day 6 — utilities week
  personalStore.addTransaction({ amount:  87.40, category: 'bills',         description: 'TNB electric',                          date: daysAgo(5, 11), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  28.50, category: 'bills',         description: 'SYABAS air',                            date: daysAgo(5, 11), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // Day 7 — boring weekday
  personalStore.addTransaction({ amount:  11.50, category: 'food',          description: 'Tealive brown sugar',                   date: daysAgo(6, 14), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  14.00, category: 'food',          description: 'Lunch chap fan',                        date: daysAgo(6, 13), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 8 — Shopee Live + Atome
  personalStore.addTransaction({ amount:  89.00, category: 'shopping',      description: 'Shopee Live — NaeLofar tudung',         date: daysAgo(7, 23), type: 'expense', mode: 'personal', walletId: shopeeId,  inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 320.00, category: 'shopping',      description: 'Zara work shirt (Atome 3-month)',       date: daysAgo(7, 20), type: 'expense', mode: 'personal', walletId: atomeId,   inputMethod: 'manual' });

  // Day 10 — IKEA Saturday
  personalStore.addTransaction({ amount:  24.50, category: 'food',          description: 'IKEA Swedish meatballs',                date: daysAgo(9, 13), type: 'expense', mode: 'personal', walletId: visaId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  18.40, category: 'shopping',      description: 'Daiso — kitchen organisers',            date: daysAgo(9, 15), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  22.00, category: 'transport',     description: 'Tol PLUS pulang',                       date: daysAgo(9, 18), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 12
  personalStore.addTransaction({ amount:  31.40, category: 'food',          description: 'KFC drive-thru',                        date: daysAgo(11, 20), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // Day 14 — petrol again
  personalStore.addTransaction({ amount:  65.00, category: 'transport',     description: 'Petronas RON95',                        date: daysAgo(13, 17), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 15 — PAYDAY: family + savings transfer
  personalStore.addTransaction({ amount: 300.00, category: 'family',        description: 'Hantar duit mak',                       date: daysAgo(14, 10), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 200.00, category: 'savings',       description: 'ASB monthly contribution',              date: daysAgo(14, 10), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 100.00, category: 'savings',       description: 'Versa Save top-up',                     date: daysAgo(14, 10), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // Day 16
  personalStore.addTransaction({ amount:  14.00, category: 'food',          description: 'Mamak with friends',                    date: daysAgo(15, 22), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 18 — Bruno Mars concert weekend
  personalStore.addTransaction({ amount: 488.00, category: 'entertainment', description: 'Bruno Mars KL concert ticket',          date: daysAgo(17, 20), type: 'expense', mode: 'personal', walletId: mcId,      inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  35.00, category: 'food',          description: 'Pre-show makan Suria KLCC',             date: daysAgo(17, 18), type: 'expense', mode: 'personal', walletId: grabpayId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  18.00, category: 'transport',     description: 'Grab pulang dari Axiata Arena',         date: daysAgo(17, 23), type: 'expense', mode: 'personal', walletId: grabpayId, inputMethod: 'manual' });

  // Day 20 — birthday family dinner
  personalStore.addTransaction({ amount: 145.00, category: 'food',          description: 'Tony Roma\'s — birthday adik',          date: daysAgo(19, 19), type: 'expense', mode: 'personal', walletId: visaId,    inputMethod: 'manual' });

  // Day 22 — pharmacy + groceries top-up
  personalStore.addTransaction({ amount:  45.00, category: 'health',        description: 'Watsons — vitamin C + panadol',         date: daysAgo(21, 14), type: 'expense', mode: 'personal', walletId: visaId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  92.00, category: 'shopping',      description: 'Mydin — barang basah weekly',           date: daysAgo(21, 18), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // Day 24 — TnG reload + supper
  personalStore.addTransaction({ amount:  50.00, category: 'transport',     description: "Touch 'n Go reload",                    date: daysAgo(23, 12), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  19.00, category: 'food',          description: "McDonald's late night",                 date: daysAgo(23, 23), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 26 — boring stuff
  personalStore.addTransaction({ amount:  13.50, category: 'food',          description: 'Zus Coffee morning',                    date: daysAgo(25,  8), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // Day 28 — karaoke + supper
  personalStore.addTransaction({ amount:  88.00, category: 'entertainment', description: 'Red Box karaoke (split bahagian aku)',  date: daysAgo(27, 22), type: 'expense', mode: 'personal', walletId: visaId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  38.00, category: 'food',          description: 'Marutama ramen supper',                 date: daysAgo(27, 23), type: 'expense', mode: 'personal', walletId: grabpayId, inputMethod: 'manual' });

  // Day 30
  personalStore.addTransaction({ amount:  26.00, category: 'food',          description: 'Sushi King set lunch',                  date: daysAgo(29, 13), type: 'expense', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  14.20, category: 'shopping',      description: '99 Speedmart sundries',                 date: daysAgo(29, 19), type: 'expense', mode: 'personal', walletId: tngId,     inputMethod: 'manual' });

  // ─── Income — last 30 days
  personalStore.addTransaction({ amount: 3420.00, category: 'salary',    description: 'Gaji bulan ini (net)',         date: daysAgo(14, 9), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  350.00, category: 'freelance', description: 'Freelance design — kawan punya kedai', date: daysAgo(7, 17), type: 'income', mode: 'personal', walletId: cimbId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  800.00, category: 'other',     description: 'Carousell — jual iPhone lama',  date: daysAgo(4, 16), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:   12.30, category: 'other',     description: 'Cashback ShopeePay',           date: daysAgo(2, 11), type: 'income', mode: 'personal', walletId: shopeeId,  inputMethod: 'manual' });
  personalStore.addTransaction({ amount:   85.00, category: 'gift',      description: 'Duit raya (lambat sikit)',     date: daysAgo(20, 14), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // ─── 3. Subscriptions — fixed monthly outflow (the boring big stuff) ─
  // Long-term loans modeled as installment subs
  personalStore.addSubscription({ name: 'PR1MA condo loan',    amount: 1150.00, billingCycle: 'monthly', startDate: daysAgo(548), nextBillingDate: daysAgo(-7),  category: 'bills',         isActive: true, isPaused: false, reminderDays: 5, isInstallment: true,  totalInstallments: 420, completedInstallments: 18 });
  personalStore.addSubscription({ name: 'Myvi 1.5 car loan',   amount:  580.00, billingCycle: 'monthly', startDate: daysAgo(910), nextBillingDate: daysAgo(-3),  category: 'transport',     isActive: true, isPaused: false, reminderDays: 3, isInstallment: true,  totalInstallments:  84, completedInstallments: 30 });
  // Insurance / takaful
  personalStore.addSubscription({ name: 'AIA i-Friends takaful', amount: 198.00, billingCycle: 'monthly', startDate: daysAgo(720), nextBillingDate: daysAgo(-12), category: 'health',       isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
  // Phone + internet
  personalStore.addSubscription({ name: 'Maxis postpaid',      amount:   79.00, billingCycle: 'monthly', startDate: daysAgo(800), nextBillingDate: daysAgo(-9),  category: 'bills',         isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
  personalStore.addSubscription({ name: 'Unifi 100Mbps',       amount:   99.00, billingCycle: 'monthly', startDate: daysAgo(540), nextBillingDate: daysAgo(-15), category: 'bills',         isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
  // Lifestyle
  personalStore.addSubscription({ name: 'Anytime Fitness',     amount:   99.00, billingCycle: 'monthly', startDate: daysAgo(180), nextBillingDate: daysAgo(-22), category: 'health',        isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
  personalStore.addSubscription({ name: 'ChatGPT Plus',        amount:   89.00, billingCycle: 'monthly', startDate: daysAgo(150), nextBillingDate: daysAgo(-18), category: 'subscription',  isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
  personalStore.addSubscription({ name: 'Netflix Standard',    amount:   45.00, billingCycle: 'monthly', startDate: daysAgo(420), nextBillingDate: daysAgo(-19), category: 'subscription',  isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
  personalStore.addSubscription({ name: 'Spotify Premium',     amount:   14.90, billingCycle: 'monthly', startDate: daysAgo(680), nextBillingDate: daysAgo(-11), category: 'subscription',  isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
  personalStore.addSubscription({ name: 'iCloud 200GB',        amount:   15.90, billingCycle: 'monthly', startDate: daysAgo(900), nextBillingDate: daysAgo(-25), category: 'subscription',  isActive: true, isPaused: false, reminderDays: 1, isInstallment: false });

  // ─── 4. Budgets — what Aiman tries to stick to ──────────────────────
  personalStore.addBudget({ category: 'food',          allocatedAmount: 600, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'transport',     allocatedAmount: 400, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'shopping',      allocatedAmount: 300, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'entertainment', allocatedAmount: 200, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'family',        allocatedAmount: 300, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

  // ─── 5. Goals — what 25yo dreams about ─────────────────────────────
  personalStore.addGoal({ name: 'Tabung Kecemasan (3 bulan)',  targetAmount: 12000, category: 'savings', icon: 'shield',     color: '#4F5104' });
  personalStore.addGoal({ name: 'Trip Japan musim sakura',     targetAmount:  5000, category: 'travel',  icon: 'map-pin',    color: '#6BA3BE' });
  personalStore.addGoal({ name: 'Tabung kahwin',               targetAmount: 30000, category: 'other',   icon: 'heart',      color: '#A688B8' });
  personalStore.addGoal({ name: 'iPhone baru',                 targetAmount:  5000, category: 'other',   icon: 'smartphone', color: '#B2780A' });

  const goals = usePersonalStore.getState().goals;
  const goalEmergency = goals.find((g) => g.name === 'Tabung Kecemasan (3 bulan)');
  const goalJapan     = goals.find((g) => g.name === 'Trip Japan musim sakura');
  const goalWedding   = goals.find((g) => g.name === 'Tabung kahwin');
  const goalIphone    = goals.find((g) => g.name === 'iPhone baru');
  if (goalEmergency) {
    personalStore.contributeToGoal(goalEmergency.id, 5000, 'starter dari bonus tahun lepas');
    personalStore.contributeToGoal(goalEmergency.id, 2000, 'tax refund LHDN');
    personalStore.contributeToGoal(goalEmergency.id, 1500, 'simpan sikit-sikit');
  }
  if (goalJapan) {
    personalStore.contributeToGoal(goalJapan.id, 1500, 'mula simpan after gaji naik');
    personalStore.contributeToGoal(goalJapan.id,  800, 'cashback Shopee + side hustle');
    personalStore.contributeToGoal(goalJapan.id,  500, 'jual baju tak pakai');
  }
  if (goalWedding) {
    personalStore.contributeToGoal(goalWedding.id, 2500, 'opening simpanan kahwin');
    personalStore.contributeToGoal(goalWedding.id, 1000, 'angpau raya kumpul');
  }
  if (goalIphone) {
    personalStore.contributeToGoal(goalIphone.id,  800, 'jual iPhone lama Carousell');
  }

  // ─── 6. Personal debts — friends + family kecik-kecik ──────────────
  const debt1Id = debtStore.addDebt({ contact: { id: 'zikri-001', name: 'Zikri',        phone: '0123456789', isFromPhone: false }, type: 'they_owe', totalAmount: 120, description: 'GrabFood Loop1 weekend (kau bayar dulu)', mode: 'personal', category: 'food' });
  debtStore.addPayment(debt1Id, { amount: 60, date: daysAgo(8), note: 'transfer DuitNow' });

  const debt2Id = debtStore.addDebt({ contact: { id: 'hakim-001', name: 'Hakim',        phone: '0198765432', isFromPhone: false }, type: 'i_owe',    totalAmount: 250, description: 'Hakim bayar dulu untuk Bruno Mars ticket',  mode: 'personal', category: 'entertainment' });
  debtStore.addPayment(debt2Id, { amount: 100, date: daysAgo(15), note: 'bayar setengah dulu' });

  const debt3Id = debtStore.addDebt({ contact: { id: 'aina-001',  name: 'Aina',                              isFromPhone: false }, type: 'they_owe', totalAmount:  65, description: 'TGV ticket — Wicked Part 2',                 mode: 'personal', category: 'entertainment' });
  debtStore.addPayment(debt3Id, { amount: 65, date: daysAgo(2), note: 'dah settle DuitNow' });

  debtStore.addDebt({ contact: { id: 'abang-001', name: 'Abang Long', phone: '0167778888', isFromPhone: false }, type: 'i_owe',    totalAmount: 500, description: 'Abang tolong cover deposit Myvi (bayar bulan-bulan)', mode: 'personal' });

  // ─── 7. Splits — group makan with friends ──────────────────────────
  debtStore.addSplit({
    description: 'Steamboat birthday Aina',
    totalAmount: 190,
    splitMethod: 'equal',
    participants: [
      { contact: { id: 'self-001',  name: 'You',     isFromPhone: false }, amount: 38, isPaid: true  },
      { contact: { id: 'zikri-001', name: 'Zikri',   isFromPhone: false }, amount: 38, isPaid: true  },
      { contact: { id: 'hakim-001', name: 'Hakim',   isFromPhone: false }, amount: 38, isPaid: false },
      { contact: { id: 'aina-001',  name: 'Aina',    isFromPhone: false }, amount: 38, isPaid: true  },
      { contact: { id: 'syaza-001', name: 'Syaza',   isFromPhone: false }, amount: 38, isPaid: false },
    ],
    items: [],
    mode: 'personal',
    category: 'food',
  });

  debtStore.addSplit({
    description: 'Trip Penang — Airbnb + tol + petrol',
    totalAmount: 480,
    splitMethod: 'equal',
    participants: [
      { contact: { id: 'self-001',  name: 'You',     isFromPhone: false }, amount: 120, isPaid: true  },
      { contact: { id: 'zikri-001', name: 'Zikri',   isFromPhone: false }, amount: 120, isPaid: false },
      { contact: { id: 'hakim-001', name: 'Hakim',   isFromPhone: false }, amount: 120, isPaid: true  },
      { contact: { id: 'aina-001',  name: 'Aina',    isFromPhone: false }, amount: 120, isPaid: false },
    ],
    items: [],
    mode: 'personal',
    category: 'travel',
  });

  // ─── 8. Savings + Investments ──────────────────────────────────────
  savingsStore.addAccount({ name: 'ASB',         type: 'investment', initialInvestment: 5000, currentValue: 6500, annualRate: 4.25, description: 'Amanah Saham Bumiputera — RM 200/bulan' });
  savingsStore.addAccount({ name: 'Tabung Haji', type: 'savings',    initialInvestment: 2000, currentValue: 2400, annualRate: 3.10, description: 'Simpanan haji + dividen' });
  savingsStore.addAccount({ name: 'Versa Save',  type: 'investment', initialInvestment: 1000, currentValue: 1180, annualRate: 3.80, description: 'Money market robo (Affin Hwang)' });
  savingsStore.addAccount({ name: 'Luno BTC',    type: 'investment', initialInvestment:  500, currentValue:  720,                   description: 'DCA bitcoin sikit-sikit' });

  const accounts = useSavingsStore.getState().accounts;
  const asbId   = accounts.find((a) => a.name === 'ASB')?.id;
  const thId    = accounts.find((a) => a.name === 'Tabung Haji')?.id;
  const versaId = accounts.find((a) => a.name === 'Versa Save')?.id;
  const lunoId  = accounts.find((a) => a.name === 'Luno BTC')?.id;
  if (asbId) {
    savingsStore.addSnapshot(asbId, 5000, 'pembukaan',  'manual');
    savingsStore.addSnapshot(asbId, 5400, 'after RM 400 contribute', 'manual');
    savingsStore.addSnapshot(asbId, 5900, 'dividen tahun lepas masuk', 'manual');
    savingsStore.addSnapshot(asbId, 6500, 'monthly contribute build up', 'manual');
  }
  if (thId) {
    savingsStore.addSnapshot(thId, 2000, 'opening', 'manual');
    savingsStore.addSnapshot(thId, 2200, 'top up raya', 'manual');
    savingsStore.addSnapshot(thId, 2400, 'dividen masuk', 'manual');
  }
  if (versaId) {
    savingsStore.addSnapshot(versaId, 1000, 'starter', 'manual');
    savingsStore.addSnapshot(versaId, 1100, 'monthly RM 100', 'manual');
    savingsStore.addSnapshot(versaId, 1180, 'auto-DCA + return', 'manual');
  }
  if (lunoId) {
    savingsStore.addSnapshot(lunoId, 500, 'try crypto sikit', 'manual');
    savingsStore.addSnapshot(lunoId, 720, 'BTC pump', 'manual');
  }

  // ─── 9. Notes — quick scribbles ────────────────────────────────────
  const pageId1 = notesStore.createPage('personal');
  notesStore.updatePageContent(pageId1, 'spend hari ni:\nzus rm9.50\nlunch rm12\nteh tarik rm7\ntol rm3\ntotal rm31.50\n\nbudget makan minggu ni dah tinggal rm180');

  const pageId2 = notesStore.createPage('personal');
  notesStore.updatePageContent(pageId2, 'after gaji 28hb:\n- bayar mortgage rm1150\n- bayar myvi rm580\n- takaful rm198\n- maxis + unifi rm178\n- kirim mak rm300\n- asb rm200 + versa rm100\n\nyg tinggal rm714 untuk makan + minyak + lain² 2 minggu next.\nbila boleh ke japan?');

  const pageId3 = notesStore.createPage('personal');
  notesStore.updatePageContent(pageId3, 'todo bulan depan:\n- review subscription (chatgpt vs gemini?)\n- top up emergency fund\n- ajak hakim settle debt rm150 lagi\n- check ASB dividen tahun ni');

  // ─── 10. Receipts — recent scans ───────────────────────────────────
  receiptStore.addReceipt({
    title: "Lotus's groceries",
    vendor: "Lotus's Malaysia",
    total: 145.20, subtotal: 137.00, tax: 8.20,
    date: daysAgo(3),
    category: 'shopping', myTaxCategory: 'general',
    verified: true, walletId: maybankId,
    year: new Date().getFullYear(),
    items: [
      { name: 'Beras Jasmine 5kg',   amount: 28.90 },
      { name: 'Ayam segar 1.2kg',    amount: 18.40 },
      { name: 'Telur Grade A 30',    amount: 14.50 },
      { name: 'Susu Dutch Lady 2L',  amount: 17.90 },
      { name: 'Roti Gardenia',       amount:  4.30 },
      { name: 'Indomie Goreng x10',  amount: 14.90 },
      { name: 'Sayur campur',        amount: 22.00 },
      { name: 'Sabun + ubat gigi',   amount: 16.10 },
    ],
  });

  receiptStore.addReceipt({
    title: 'Petronas RON95',
    vendor: 'Petronas Setel',
    total: 70.00,
    date: daysAgo(3),
    category: 'transport', myTaxCategory: 'fuel',
    verified: true, walletId: tngId,
    year: new Date().getFullYear(),
    items: [{ name: 'RON95 — 33.99L @ RM2.05', amount: 70.00 }],
  });

  receiptStore.addReceipt({
    title: 'Watsons',
    vendor: 'Watsons Malaysia',
    total: 45.00, subtotal: 42.45, tax: 2.55,
    date: daysAgo(21),
    category: 'health', myTaxCategory: 'medical',
    verified: true, walletId: visaId,
    year: new Date().getFullYear(),
    items: [
      { name: 'Vitamin C 500mg x60',  amount: 24.90 },
      { name: 'Panadol Soluble',      amount:  9.50 },
      { name: 'Hand sanitizer 50ml',  amount: 10.60 },
    ],
  });
};
