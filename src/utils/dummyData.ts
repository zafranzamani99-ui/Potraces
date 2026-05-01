import { useWalletStore } from '../store/walletStore';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useSavingsStore } from '../store/savingsStore';
import { useNotesStore } from '../store/notesStore';
import { useReceiptStore } from '../store/receiptStore';

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

  // ─── 1. Wallets — ALL banks + ewallets + credits ──────
  // Banks
  walletStore.addWallet({ name: 'Maybank Savings',  type: 'bank', balance: 4250.00, icon: 'home', color: '#FFC300', isDefault: true,  presetId: 'maybank'     });
  walletStore.addWallet({ name: 'CIMB Current',     type: 'bank', balance: 1800.00, icon: 'home', color: '#EC1C24', isDefault: false, presetId: 'cimb'        });
  walletStore.addWallet({ name: 'Public Bank',      type: 'bank', balance:  950.00, icon: 'home', color: '#003087', isDefault: false, presetId: 'public_bank'  });
  walletStore.addWallet({ name: 'RHB Bank',         type: 'bank', balance:  620.00, icon: 'home', color: '#0052A5', isDefault: false, presetId: 'rhb'          });
  walletStore.addWallet({ name: 'Hong Leong Bank',  type: 'bank', balance:  480.00, icon: 'home', color: '#E30613', isDefault: false, presetId: 'hong_leong'   });
  walletStore.addWallet({ name: 'AmBank',           type: 'bank', balance:  350.00, icon: 'home', color: '#E31837', isDefault: false, presetId: 'ambank'       });
  walletStore.addWallet({ name: 'Bank Islam',       type: 'bank', balance:  720.00, icon: 'home', color: '#006341', isDefault: false, presetId: 'bank_islam'   });
  walletStore.addWallet({ name: 'Bank Rakyat',      type: 'bank', balance:  290.00, icon: 'home', color: '#003087', isDefault: false, presetId: 'bank_rakyat'  });
  walletStore.addWallet({ name: 'BSN',              type: 'bank', balance:  180.00, icon: 'home', color: '#0066CC', isDefault: false, presetId: 'bsn'          });
  walletStore.addWallet({ name: 'Agrobank',         type: 'bank', balance:  150.00, icon: 'home', color: '#006633', isDefault: false, presetId: 'agrobank'     });
  walletStore.addWallet({ name: 'MBSB Bank',        type: 'bank', balance:  420.00, icon: 'home', color: '#004B87', isDefault: false, presetId: 'mbsb'         });
  walletStore.addWallet({ name: 'Affin Bank',       type: 'bank', balance:  310.00, icon: 'home', color: '#0033A0', isDefault: false, presetId: 'affin'        });
  walletStore.addWallet({ name: 'Alliance Bank',    type: 'bank', balance:  265.00, icon: 'home', color: '#0072CE', isDefault: false, presetId: 'alliance'     });
  walletStore.addWallet({ name: 'HSBC Malaysia',    type: 'bank', balance:  890.00, icon: 'home', color: '#DB0011', isDefault: false, presetId: 'hsbc_my'      });
  walletStore.addWallet({ name: 'UOB Malaysia',     type: 'bank', balance:  560.00, icon: 'home', color: '#003087', isDefault: false, presetId: 'uob_my'       });
  walletStore.addWallet({ name: 'OCBC Malaysia',    type: 'bank', balance:  740.00, icon: 'home', color: '#E31837', isDefault: false, presetId: 'ocbc_my'      });
  // E-Wallets
  walletStore.addWallet({ name: "Touch 'n Go",      type: 'ewallet', balance: 185.00, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng'       });
  walletStore.addWallet({ name: 'GrabPay',          type: 'ewallet', balance:  67.50, icon: 'smartphone', color: '#00B14F', isDefault: false, presetId: 'grabpay'   });
  walletStore.addWallet({ name: 'ShopeePay',        type: 'ewallet', balance:  32.00, icon: 'smartphone', color: '#EE4D2D', isDefault: false, presetId: 'shopee_pay' });
  walletStore.addWallet({ name: 'Boost',            type: 'ewallet', balance:  15.00, icon: 'smartphone', color: '#EE2E24', isDefault: false, presetId: 'boost'      });
  walletStore.addWallet({ name: 'BigPay',           type: 'ewallet', balance:  45.00, icon: 'smartphone', color: '#00C4CC', isDefault: false, presetId: 'bigpay'     });
  walletStore.addWallet({ name: 'Setel',            type: 'ewallet', balance:  28.00, icon: 'smartphone', color: '#E30613', isDefault: false, presetId: 'setel'      });
  walletStore.addWallet({ name: 'GXBank',           type: 'ewallet', balance: 120.00, icon: 'smartphone', color: '#00A651', isDefault: false, presetId: 'gxbank'     });
  walletStore.addWallet({ name: 'DuitNow',          type: 'ewallet', balance:  55.00, icon: 'smartphone', color: '#E30613', isDefault: false, presetId: 'duitnow'    });
  // BNPL / Credit
  walletStore.addWallet({ name: 'Atome',            type: 'credit', balance: 0, icon: 'credit-card', color: '#00D4AA', isDefault: false, presetId: 'atome',          creditLimit: 2000,  usedCredit:  450 });
  walletStore.addWallet({ name: 'SPayLater',        type: 'credit', balance: 0, icon: 'credit-card', color: '#EE4D2D', isDefault: false, presetId: 'spaylater',      creditLimit: 1500,  usedCredit:  280 });
  walletStore.addWallet({ name: 'GrabPayLater',     type: 'credit', balance: 0, icon: 'credit-card', color: '#00B14F', isDefault: false, presetId: 'grab_paylater',  creditLimit: 1000,  usedCredit:  150 });
  walletStore.addWallet({ name: 'TikTok PayLater',  type: 'credit', balance: 0, icon: 'credit-card', color: '#010101', isDefault: false, presetId: 'tiktok_paylater',creditLimit:  500,  usedCredit:   80 });
  // Credit cards (bank + network combos)
  walletStore.addWallet({ name: 'Maybank Visa',     type: 'credit', balance: 0, icon: 'credit-card', color: '#FFC300', isDefault: false, presetId: 'credit_card', creditBank: 'maybank', creditNetwork: 'visa',       creditLimit: 10000, usedCredit: 3200 });
  walletStore.addWallet({ name: 'CIMB Mastercard',  type: 'credit', balance: 0, icon: 'credit-card', color: '#EC1C24', isDefault: false, presetId: 'credit_card', creditBank: 'cimb',    creditNetwork: 'mastercard', creditLimit:  8000, usedCredit: 1400 });
  walletStore.addWallet({ name: 'HSBC Amex',        type: 'credit', balance: 0, icon: 'credit-card', color: '#DB0011', isDefault: false, presetId: 'credit_card', creditBank: 'hsbc_my', creditNetwork: 'amex',       creditLimit:  5000, usedCredit:  600 });

  // Resolve wallet IDs by name
  const wallets = useWalletStore.getState().wallets;
  const w = (name: string) => wallets.find((wl) => wl.name === name)?.id;

  const maybankId     = w('Maybank Savings');
  const cimbId        = w('CIMB Current');
  const tngId         = w("Touch 'n Go");
  const grabpayId     = w('GrabPay');
  const shopeePayId   = w('ShopeePay');
  const boostId       = w('Boost');
  const bigpayId      = w('BigPay');
  const setelId       = w('Setel');
  const gxbankId      = w('GXBank');
  const atomeId       = w('Atome');
  const maybankVisaId = w('Maybank Visa');
  const cimbMCId      = w('CIMB Mastercard');
  const hsbcAmexId    = w('HSBC Amex');
  const bankIslamId   = w('Bank Islam');
  const hsbcId        = w('HSBC Malaysia');

  // ─── 2. Transactions ───────────────────────────────────
  // Expenses spread over 30 days, across many wallets
  personalStore.addTransaction({ amount:   8.50, category: 'food',          description: 'Nasi lemak breakfast',          date: daysAgo(1,  8),  type: 'expense', mode: 'personal', walletId: tngId,         inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  15.00, category: 'transport',     description: 'Grab to office',                date: daysAgo(1,  8),  type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 129.00, category: 'bills',         description: 'Unifi broadband',               date: daysAgo(2, 10),  type: 'expense', mode: 'personal', walletId: maybankId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  87.30, category: 'shopping',      description: 'Mydin groceries',               date: daysAgo(3, 17),  type: 'expense', mode: 'personal', walletId: maybankId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  80.00, category: 'transport',     description: 'Petronas petrol',               date: daysAgo(4,  7),  type: 'expense', mode: 'personal', walletId: setelId,       inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  54.90, category: 'subscription',  description: 'Netflix subscription',          date: daysAgo(5,  9),  type: 'expense', mode: 'personal', walletId: cimbId,        inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  12.50, category: 'food',          description: 'Mamak roti canai + teh',        date: daysAgo(6,  7),  type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 145.00, category: 'shopping',      description: 'Shopee purchase (baju raya)',   date: daysAgo(7, 14),  type: 'expense', mode: 'personal', walletId: shopeePayId,   inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  95.00, category: 'bills',         description: 'TNB electric bill',             date: daysAgo(8, 11),  type: 'expense', mode: 'personal', walletId: maybankId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  22.00, category: 'food',          description: 'Pasar malam vegetables',        date: daysAgo(9, 18),  type: 'expense', mode: 'personal', walletId: boostId,       inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  38.50, category: 'food',          description: 'GrabFood dinner',               date: daysAgo(10, 19), type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  18.00, category: 'transport',     description: 'Parking KLCC',                  date: daysAgo(11, 15), type: 'expense', mode: 'personal', walletId: tngId,         inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 180.00, category: 'shopping',      description: 'Atome (Zara purchase)',         date: daysAgo(12, 14), type: 'expense', mode: 'personal', walletId: atomeId,       inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  43.20, category: 'health',        description: 'Pharmacy Watsons',              date: daysAgo(13, 12), type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  88.00, category: 'bills',         description: 'Maxis postpaid',                date: daysAgo(14, 10), type: 'expense', mode: 'personal', walletId: maybankId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  67.00, category: 'food',          description: 'Pizza Hut dinner',              date: daysAgo(15, 19), type: 'expense', mode: 'personal', walletId: maybankVisaId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  55.00, category: 'transport',     description: 'Grab ride airport',             date: daysAgo(16,  6), type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  75.00, category: 'education',     description: 'Books MPH',                     date: daysAgo(17, 15), type: 'expense', mode: 'personal', walletId: cimbId,        inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 120.00, category: 'entertainment', description: 'Sunway Lagoon tickets',         date: daysAgo(18, 10), type: 'expense', mode: 'personal', walletId: cimbMCId,      inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  89.90, category: 'food',          description: 'KFC family bucket',             date: daysAgo(19, 12), type: 'expense', mode: 'personal', walletId: shopeePayId,   inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  35.00, category: 'food',          description: 'Teh tarik & roti bakar warung', date: daysAgo(20,  8), type: 'expense', mode: 'personal', walletId: bigpayId,      inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 210.00, category: 'shopping',      description: 'Zalora TikTok sale',            date: daysAgo(21, 14), type: 'expense', mode: 'personal', walletId: atomeId,       inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  45.00, category: 'transport',     description: 'LRT monthly pass',              date: daysAgo(22, 10), type: 'expense', mode: 'personal', walletId: tngId,         inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  60.00, category: 'health',        description: 'Klinik doktor',                 date: daysAgo(23, 11), type: 'expense', mode: 'personal', walletId: maybankId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 350.00, category: 'bills',         description: 'Sewa rumah partial',            date: daysAgo(25, 10), type: 'expense', mode: 'personal', walletId: bankIslamId,   inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  28.00, category: 'food',          description: 'McDonald drive-thru',           date: daysAgo(26, 13), type: 'expense', mode: 'personal', walletId: gxbankId,      inputMethod: 'manual' });
  personalStore.addTransaction({ amount: 480.00, category: 'shopping',      description: 'HSBC Amex (laptop aksesori)',   date: daysAgo(27, 15), type: 'expense', mode: 'personal', walletId: hsbcAmexId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  15.90, category: 'subscription',  description: 'Spotify Premium',               date: daysAgo(28,  9), type: 'expense', mode: 'personal', walletId: cimbId,        inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  90.00, category: 'transport',     description: 'Grab monthly subscription',     date: daysAgo(29, 10), type: 'expense', mode: 'personal', walletId: grabpayId,     inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  24.00, category: 'food',          description: 'Boba teh bersama kawan',        date: daysAgo(30, 16), type: 'expense', mode: 'personal', walletId: boostId,       inputMethod: 'manual' });
  // Income
  personalStore.addTransaction({ amount: 4500.00, category: 'salary',    description: 'Gaji bulan ini',             date: daysAgo(1,  9), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  800.00, category: 'freelance', description: 'Freelance design kerja',      date: daysAgo(10, 14), type: 'income', mode: 'personal', walletId: cimbId,    inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  300.00, category: 'gift',      description: 'Duit raya dari mak',         date: daysAgo(20, 11), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:   12.50, category: 'other',     description: 'Cashback GrabPay',           date: daysAgo(15, 10), type: 'income', mode: 'personal', walletId: grabpayId, inputMethod: 'manual' });
  personalStore.addTransaction({ amount:  250.00, category: 'freelance', description: 'Part-time weekend kerja',    date: daysAgo(5,  18), type: 'income', mode: 'personal', walletId: maybankId, inputMethod: 'manual' });

  // ─── 3. Subscriptions ──────────────────────────────────
  personalStore.addSubscription({ name: 'Netflix',              amount:  54.90, billingCycle: 'monthly', startDate: daysAgo(60), nextBillingDate: daysAgo(-25), category: 'subscription', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
  personalStore.addSubscription({ name: 'Spotify Premium',      amount:  15.90, billingCycle: 'monthly', startDate: daysAgo(90), nextBillingDate: daysAgo(-10), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
  personalStore.addSubscription({ name: 'Myvi loan installment',amount: 580.00, billingCycle: 'monthly', startDate: daysAgo(365), nextBillingDate: daysAgo(-5), category: 'transport',    isActive: true, isPaused: false, reminderDays: 5, isInstallment: true, totalInstallments: 84, completedInstallments: 24 });

  // ─── 4. Budgets ────────────────────────────────────────
  personalStore.addBudget({ category: 'food',      allocatedAmount: 800, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'transport', allocatedAmount: 300, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
  personalStore.addBudget({ category: 'shopping',  allocatedAmount: 400, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

  // ─── 5. Goals + contributions ──────────────────────────
  personalStore.addGoal({ name: 'Tabung Kecemasan',    targetAmount: 10000, category: 'savings', icon: 'shield',   color: '#4F5104' });
  personalStore.addGoal({ name: 'Percutian Langkawi',  targetAmount:  2500, category: 'travel',  icon: 'map-pin',  color: '#6BA3BE' });

  const goals = usePersonalStore.getState().goals;
  const goal1 = goals.find((g) => g.name === 'Tabung Kecemasan');
  const goal2 = goals.find((g) => g.name === 'Percutian Langkawi');
  if (goal1) {
    personalStore.contributeToGoal(goal1.id, 500, 'simpanan gaji pertama', maybankId);
    personalStore.contributeToGoal(goal1.id, 300, 'bonus sikit');
  }
  if (goal2) {
    personalStore.contributeToGoal(goal2.id, 200, 'mula simpan');
    personalStore.contributeToGoal(goal2.id, 150, 'tambah sikit lagi');
  }

  // ─── 6. Debts + payments ───────────────────────────────
  const debt1Id = debtStore.addDebt({ contact: { id: 'amin-001', name: 'Amin Razak',   phone: '0123456789', isFromPhone: false }, type: 'they_owe', totalAmount: 150, description: "Nando's makan malam",         mode: 'personal', category: 'food' });
  debtStore.addPayment(debt1Id, { amount: 50, date: daysAgo(5), note: 'bayar sikit dulu' });

  debtStore.addDebt({ contact: { id: 'siti-001', name: 'Siti Nabilah', phone: '0198765432', isFromPhone: false }, type: 'i_owe',    totalAmount: 200, description: 'Tiket konsert Taylor Swift', mode: 'personal' });

  const debt3Id = debtStore.addDebt({ contact: { id: 'faiz-001', name: 'Faiz Hakim',   isFromPhone: false },              type: 'they_owe', totalAmount:  85, description: 'Karaoke Red Box',             mode: 'personal' });
  debtStore.addPayment(debt3Id, { amount: 85, date: daysAgo(2), note: 'dah settle' });

  // ─── 7. Split ──────────────────────────────────────────
  debtStore.addSplit({
    description: 'Makan malam birthday Ayu',
    totalAmount: 180,
    splitMethod: 'equal',
    participants: [
      { contact: { id: 'self-001',  name: 'You',          isFromPhone: false }, amount: 45, isPaid: true  },
      { contact: { id: 'amin-001',  name: 'Amin Razak',   isFromPhone: false }, amount: 45, isPaid: true  },
      { contact: { id: 'siti-001',  name: 'Siti Nabilah', isFromPhone: false }, amount: 45, isPaid: false },
      { contact: { id: 'faiz-001',  name: 'Faiz Hakim',   isFromPhone: false }, amount: 45, isPaid: false },
    ],
    items: [],
    mode: 'personal',
    category: 'food',
  });

  // ─── 8. Savings + snapshots ────────────────────────────
  savingsStore.addAccount({ name: 'ASB',         type: 'investment', initialInvestment: 5000, currentValue: 5180, annualRate: 4.25, description: 'Amanah Saham Bumiputera' });
  savingsStore.addAccount({ name: 'Tabung Haji', type: 'savings',    initialInvestment: 3000, currentValue: 3120,                   description: 'Simpanan haji' });

  const accounts = useSavingsStore.getState().accounts;
  const asbId = accounts.find((a) => a.name === 'ASB')?.id;
  const thId  = accounts.find((a) => a.name === 'Tabung Haji')?.id;
  if (asbId) {
    savingsStore.addSnapshot(asbId, 5000, 'pembukaan', 'manual');
    savingsStore.addSnapshot(asbId, 5060, 'bulan 2',   'manual');
    savingsStore.addSnapshot(asbId, 5120, 'bulan 3',   'manual');
    savingsStore.addSnapshot(asbId, 5180, 'bulan 4',   'manual');
  }
  if (thId) {
    savingsStore.addSnapshot(thId, 3000, undefined, 'manual');
    savingsStore.addSnapshot(thId, 3040, undefined, 'manual');
    savingsStore.addSnapshot(thId, 3080, undefined, 'manual');
    savingsStore.addSnapshot(thId, 3120, undefined, 'manual');
  }

  // ─── 9. Notes ──────────────────────────────────────────
  const pageId1 = notesStore.createPage('personal');
  notesStore.updatePageContent(pageId1, 'makan rm12\ngrab rm8\nparking rm3\ntotal rm23 hari ni');

  const pageId2 = notesStore.createPage('personal');
  notesStore.updatePageContent(pageId2, 'gaji masuk rm4500\nbayar sewa rm800\nbeli barang dapur rm87\nbaki simpan rm3613');

  // ─── 10. Receipts ──────────────────────────────────────
  receiptStore.addReceipt({
    title: 'Mydin groceries',
    vendor: 'Mydin Holdings',
    total: 87.30, subtotal: 80.00, tax: 7.30,
    date: daysAgo(3),
    category: 'shopping', myTaxCategory: 'general',
    verified: true, walletId: maybankId,
    year: new Date().getFullYear(),
    items: [
      { name: 'Beras 5kg',       amount: 22.90 },
      { name: 'Minyak masak 2L', amount: 15.50 },
      { name: 'Tepung gandum',   amount:  4.50 },
      { name: 'Gula 1kg',        amount:  3.00 },
      { name: 'Sabun cuci baju', amount: 15.60 },
    ],
  });

  receiptStore.addReceipt({
    title: 'Petronas fuel',
    vendor: 'Petronas',
    total: 80.00,
    date: daysAgo(4),
    category: 'transport', myTaxCategory: 'fuel',
    verified: true, walletId: setelId,
    year: new Date().getFullYear(),
    items: [{ name: 'RON 95 petrol', amount: 80.00 }],
  });
};
