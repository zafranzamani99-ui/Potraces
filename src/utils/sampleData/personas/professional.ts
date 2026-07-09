import { daysAgo, startOfMonth, endOfMonth, type Persona } from '../core';

// ─── Persona ──────────────────────────────────────────────────────────
// Aiman, 25, marketing exec in KL. (25–29 bracket.)
// Gross salary RM 4,000 → take-home ≈ RM 3,420 after EPF/SOCSO/EIS/PCB.
// First-home buyer (PR1MA condo, 18 months into a 35-year loan).
// Drives a Perodua Myvi 1.5 (30 months into an 84-month loan).
// Lives in Subang, single, sends RM 300/mo to mom.
// Tight cashflow, building emergency fund in GXBank, slowly investing in ASB + Versa.
// ─────────────────────────────────────────────────────────────────────

export const professional: Persona = {
  id: 'professional',
  seed: (c) => {
    // ─── 1. Wallets — what a real 25yo actually has ─────────────────
    // Banks
    c.wallet({ ref: 'maybank', name: 'Maybank Savings', type: 'bank', balance: 1420.0, icon: 'home', color: '#FFC300', isDefault: true, presetId: 'maybank' });
    c.wallet({ ref: 'cimb', name: 'CIMB Octosavers', type: 'bank', balance: 2800.0, icon: 'home', color: '#EC1C24', isDefault: false, presetId: 'cimb' });
    c.wallet({ ref: 'gxbank', name: 'GXBank', type: 'ewallet', balance: 8500.0, icon: 'smartphone', color: '#00A651', isDefault: false, presetId: 'gxbank' });

    // E-wallets (the ones actually opened daily)
    c.wallet({ ref: 'tng', name: "Touch 'n Go", type: 'ewallet', balance: 65.0, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng' });
    c.wallet({ ref: 'grabpay', name: 'GrabPay', type: 'ewallet', balance: 18.5, icon: 'smartphone', color: '#00B14F', isDefault: false, presetId: 'grabpay' });
    c.wallet({ ref: 'shopee', name: 'ShopeePay', type: 'ewallet', balance: 8.0, icon: 'smartphone', color: '#EE4D2D', isDefault: false, presetId: 'shopee_pay' });

    // Cash — physical duit in the wallet
    c.wallet({ ref: 'cash', name: 'Cash dalam wallet', type: 'cash', balance: 150.0, icon: 'dollar-sign', color: '#7A8B69', isDefault: false, presetId: 'cash' });

    // BNPL
    c.wallet({ ref: 'atome', name: 'Atome', type: 'credit', balance: 0, icon: 'credit-card', color: '#00D4AA', isDefault: false, presetId: 'atome', creditLimit: 1500, usedCredit: 320 });

    // Credit cards
    c.wallet({ ref: 'visa', name: 'Maybank Visa', type: 'credit', balance: 0, icon: 'credit-card', color: '#FFC300', isDefault: false, presetId: 'credit_card', creditBank: 'maybank', creditNetwork: 'visa', creditLimit: 8000, usedCredit: 1847 });
    c.wallet({ ref: 'mc', name: 'CIMB Mastercard', type: 'credit', balance: 0, icon: 'credit-card', color: '#EC1C24', isDefault: false, presetId: 'credit_card', creditBank: 'cimb', creditNetwork: 'mastercard', creditLimit: 5000, usedCredit: 580 });

    // ─── 2. Transactions — last 30 days, real cashflow ─────────────
    // Day 1 (today)
    c.tx({ amount: 9.5, category: 'food', description: 'Zus Coffee — americano', date: daysAgo(0, 8), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 12.0, category: 'food', description: 'Lunch nasi campur', date: daysAgo(0, 13), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 6.0, category: 'food', description: 'Pisang goreng + air tebu (tunai)', date: daysAgo(0, 17), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 2
    c.tx({ amount: 28.0, category: 'food', description: 'GrabFood — Pak Cik Burger', date: daysAgo(1, 21), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });
    c.tx({ amount: 7.0, category: 'food', description: 'Mamak teh tarik + roti canai', date: daysAgo(1, 23), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 3
    c.tx({ amount: 8.0, category: 'food', description: '7-Eleven energy drink', date: daysAgo(2, 7), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 19.4, category: 'food', description: 'Llao Llao mango froyo', date: daysAgo(2, 15), type: 'expense', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });

    // Day 4 — groceries day
    c.tx({ amount: 145.2, category: 'shopping', description: "Lotus's groceries", date: daysAgo(3, 18), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 70.0, category: 'transport', description: 'Petronas RON95', date: daysAgo(3, 19), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 5 — movie + dessert
    c.tx({ amount: 32.0, category: 'entertainment', description: 'TGV — Wicked Part 2', date: daysAgo(4, 21), type: 'expense', mode: 'personal', wallet: 'mc', inputMethod: 'manual' });
    c.tx({ amount: 24.0, category: 'food', description: 'Mixue ice cream', date: daysAgo(4, 22), type: 'expense', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });

    // Day 6 — utilities week
    c.tx({ amount: 87.4, category: 'bills', description: 'TNB electric', date: daysAgo(5, 11), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 28.5, category: 'bills', description: 'SYABAS air', date: daysAgo(5, 11), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 7 — boring weekday
    c.tx({ amount: 11.5, category: 'food', description: 'Tealive brown sugar', date: daysAgo(6, 14), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 14.0, category: 'food', description: 'Lunch chap fan', date: daysAgo(6, 13), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 8 — Shopee Live + Atome
    c.tx({ amount: 89.0, category: 'shopping', description: 'Shopee Live — NaeLofar tudung', date: daysAgo(7, 23), type: 'expense', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });
    c.tx({ amount: 320.0, category: 'shopping', description: 'Zara work shirt (Atome 3-month)', date: daysAgo(7, 20), type: 'expense', mode: 'personal', wallet: 'atome', inputMethod: 'manual' });

    // Day 9 — barber (cash)
    c.tx({ amount: 25.0, category: 'other', description: 'Gunting rambut kedai barber (tunai)', date: daysAgo(8, 16), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 10 — IKEA Saturday
    c.tx({ amount: 24.5, category: 'food', description: 'IKEA Swedish meatballs', date: daysAgo(9, 13), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 18.4, category: 'shopping', description: 'Daiso — kitchen organisers', date: daysAgo(9, 15), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 22.0, category: 'transport', description: 'Tol PLUS pulang', date: daysAgo(9, 18), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 11 — pasar malam (cash)
    c.tx({ amount: 23.0, category: 'food', description: 'Pasar malam — ayam percik + kuih', date: daysAgo(10, 20), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 12
    c.tx({ amount: 31.4, category: 'food', description: 'KFC drive-thru', date: daysAgo(11, 20), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 14 — petrol again
    c.tx({ amount: 65.0, category: 'transport', description: 'Petronas RON95', date: daysAgo(13, 17), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 15 — PAYDAY: family + savings transfer
    c.tx({ amount: 300.0, category: 'family', description: 'Hantar duit mak', date: daysAgo(14, 10), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 200.0, category: 'savings', description: 'ASB monthly contribution', date: daysAgo(14, 10), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 100.0, category: 'savings', description: 'Versa Save top-up', date: daysAgo(14, 10), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 16
    c.tx({ amount: 14.0, category: 'food', description: 'Mamak with friends', date: daysAgo(15, 22), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 18 — Bruno Mars concert weekend
    c.tx({ amount: 488.0, category: 'entertainment', description: 'Bruno Mars KL concert ticket', date: daysAgo(17, 20), type: 'expense', mode: 'personal', wallet: 'mc', inputMethod: 'manual' });
    c.tx({ amount: 35.0, category: 'food', description: 'Pre-show makan Suria KLCC', date: daysAgo(17, 18), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });
    c.tx({ amount: 18.0, category: 'transport', description: 'Grab pulang dari Axiata Arena', date: daysAgo(17, 23), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });

    // Day 20 — birthday family dinner
    c.tx({ amount: 145.0, category: 'food', description: "Tony Roma's — birthday adik", date: daysAgo(19, 19), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });

    // Day 22 — pharmacy + groceries top-up
    c.tx({ amount: 45.0, category: 'health', description: 'Watsons — vitamin C + panadol', date: daysAgo(21, 14), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 92.0, category: 'shopping', description: 'Mydin — barang basah weekly', date: daysAgo(21, 18), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 24 — supper (TnG reload is a transfer, see below)
    c.tx({ amount: 19.0, category: 'food', description: "McDonald's late night", date: daysAgo(23, 23), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 26 — boring stuff
    c.tx({ amount: 13.5, category: 'food', description: 'Zus Coffee morning', date: daysAgo(25, 8), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 28 — karaoke + supper
    c.tx({ amount: 88.0, category: 'entertainment', description: 'Red Box karaoke (split bahagian aku)', date: daysAgo(27, 22), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 38.0, category: 'food', description: 'Marutama ramen supper', date: daysAgo(27, 23), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });

    // Day 30
    c.tx({ amount: 26.0, category: 'food', description: 'Sushi King set lunch', date: daysAgo(29, 13), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 14.2, category: 'shopping', description: '99 Speedmart sundries', date: daysAgo(29, 19), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // ─── Transfers — moving money between own wallets ──────────────
    // Reloading Touch 'n Go from Maybank is a real bank→e-wallet transfer.
    c.transfer('maybank', 'tng', 50.0, "Reload Touch 'n Go");
    // Drew physical cash out at the ATM.
    c.transfer('maybank', 'cash', 100.0, 'Keluar duit ATM');

    // ─── Income — last 30 days ─────────────────────────────────────
    c.tx({ amount: 3420.0, category: 'salary', description: 'Gaji bulan ini (net)', date: daysAgo(14, 9), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 350.0, category: 'freelance', description: 'Freelance design — kawan punya kedai', date: daysAgo(7, 17), type: 'income', mode: 'personal', wallet: 'cimb', inputMethod: 'manual' });
    c.tx({ amount: 800.0, category: 'other', description: 'Carousell — jual iPhone lama', date: daysAgo(4, 16), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 12.3, category: 'other', description: 'Cashback ShopeePay', date: daysAgo(2, 11), type: 'income', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });
    c.tx({ amount: 85.0, category: 'gift', description: 'Duit raya (lambat sikit)', date: daysAgo(20, 14), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // ─── 3. Subscriptions — fixed monthly outflow ──────────────────
    // Long-term loans modeled as installment subs
    c.sub({ name: 'PR1MA condo loan', amount: 1150.0, billingCycle: 'monthly', startDate: daysAgo(548), nextBillingDate: daysAgo(-7), category: 'bills', isActive: true, isPaused: false, reminderDays: 5, isInstallment: true, totalInstallments: 420, completedInstallments: 18 });
    c.sub({ name: 'Myvi 1.5 car loan', amount: 580.0, billingCycle: 'monthly', startDate: daysAgo(910), nextBillingDate: daysAgo(-3), category: 'transport', isActive: true, isPaused: false, reminderDays: 3, isInstallment: true, totalInstallments: 84, completedInstallments: 30 });
    // Insurance / takaful
    c.sub({ name: 'AIA i-Friends takaful', amount: 198.0, billingCycle: 'monthly', startDate: daysAgo(720), nextBillingDate: daysAgo(-12), category: 'health', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
    // Phone + internet
    c.sub({ name: 'Maxis postpaid', amount: 79.0, billingCycle: 'monthly', startDate: daysAgo(800), nextBillingDate: daysAgo(-9), category: 'bills', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Unifi 100Mbps', amount: 99.0, billingCycle: 'monthly', startDate: daysAgo(540), nextBillingDate: daysAgo(-15), category: 'bills', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
    // Lifestyle
    c.sub({ name: 'Anytime Fitness', amount: 99.0, billingCycle: 'monthly', startDate: daysAgo(180), nextBillingDate: daysAgo(-22), category: 'health', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
    c.sub({ name: 'ChatGPT Plus', amount: 89.0, billingCycle: 'monthly', startDate: daysAgo(150), nextBillingDate: daysAgo(-18), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Netflix Standard', amount: 45.0, billingCycle: 'monthly', startDate: daysAgo(420), nextBillingDate: daysAgo(-19), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Spotify Premium', amount: 14.9, billingCycle: 'monthly', startDate: daysAgo(680), nextBillingDate: daysAgo(-11), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'iCloud 200GB', amount: 15.9, billingCycle: 'monthly', startDate: daysAgo(900), nextBillingDate: daysAgo(-25), category: 'subscription', isActive: true, isPaused: false, reminderDays: 1, isInstallment: false });

    // ─── 4. Budgets — what Aiman tries to stick to ─────────────────
    c.budget({ category: 'food', allocatedAmount: 600, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'transport', allocatedAmount: 400, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'shopping', allocatedAmount: 300, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'entertainment', allocatedAmount: 200, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'family', allocatedAmount: 300, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

    // ─── 5. Goals — what 25yo dreams about ─────────────────────────
    c.goal(
      { name: 'Tabung Kecemasan (3 bulan)', targetAmount: 12000, category: 'savings', icon: 'shield', color: '#4F5104' },
      [
        { amount: 5000, note: 'starter dari bonus tahun lepas' },
        { amount: 2000, note: 'tax refund LHDN' },
        { amount: 1500, note: 'simpan sikit-sikit' },
      ],
    );
    c.goal(
      { name: 'Trip Japan musim sakura', targetAmount: 5000, category: 'travel', icon: 'map-pin', color: '#6BA3BE' },
      [
        { amount: 1500, note: 'mula simpan after gaji naik' },
        { amount: 800, note: 'cashback Shopee + side hustle' },
        { amount: 500, note: 'jual baju tak pakai' },
      ],
    );
    c.goal(
      { name: 'Tabung kahwin', targetAmount: 30000, category: 'other', icon: 'heart', color: '#A688B8' },
      [
        { amount: 2500, note: 'opening simpanan kahwin' },
        { amount: 1000, note: 'angpau raya kumpul' },
      ],
    );
    c.goal(
      { name: 'iPhone baru', targetAmount: 5000, category: 'other', icon: 'smartphone', color: '#B2780A' },
      [{ amount: 800, note: 'jual iPhone lama Carousell' }],
    );

    // ─── 6. Personal debts — friends + family kecik-kecik ──────────
    c.debt(
      { contact: { id: 'zikri-001', name: 'Zikri', phone: '0123456789', isFromPhone: false }, type: 'they_owe', totalAmount: 120, description: 'GrabFood Loop1 weekend (kau bayar dulu)', mode: 'personal', category: 'food' },
      [{ amount: 60, date: daysAgo(8), note: 'transfer DuitNow' }],
    );
    c.debt(
      { contact: { id: 'hakim-001', name: 'Hakim', phone: '0198765432', isFromPhone: false }, type: 'i_owe', totalAmount: 250, description: 'Hakim bayar dulu untuk Bruno Mars ticket', mode: 'personal', category: 'entertainment' },
      [{ amount: 100, date: daysAgo(15), note: 'bayar setengah dulu' }],
    );
    c.debt(
      { contact: { id: 'aina-001', name: 'Aina', isFromPhone: false }, type: 'they_owe', totalAmount: 65, description: 'TGV ticket — Wicked Part 2', mode: 'personal', category: 'entertainment' },
      [{ amount: 65, date: daysAgo(2), note: 'dah settle DuitNow' }],
    );
    c.debt({ contact: { id: 'abang-001', name: 'Abang Long', phone: '0167778888', isFromPhone: false }, type: 'i_owe', totalAmount: 500, description: 'Abang tolong cover deposit Myvi (bayar bulan-bulan)', mode: 'personal' });

    // ─── 7. Splits — group makan with friends ──────────────────────
    c.split({
      description: 'Steamboat birthday Aina',
      totalAmount: 190,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 38, isPaid: true },
        { contact: { id: 'zikri-001', name: 'Zikri', isFromPhone: false }, amount: 38, isPaid: true },
        { contact: { id: 'hakim-001', name: 'Hakim', isFromPhone: false }, amount: 38, isPaid: false },
        { contact: { id: 'aina-001', name: 'Aina', isFromPhone: false }, amount: 38, isPaid: true },
        { contact: { id: 'syaza-001', name: 'Syaza', isFromPhone: false }, amount: 38, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'food',
    });
    c.split({
      description: 'Trip Penang — Airbnb + tol + petrol',
      totalAmount: 480,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 120, isPaid: true },
        { contact: { id: 'zikri-001', name: 'Zikri', isFromPhone: false }, amount: 120, isPaid: false },
        { contact: { id: 'hakim-001', name: 'Hakim', isFromPhone: false }, amount: 120, isPaid: true },
        { contact: { id: 'aina-001', name: 'Aina', isFromPhone: false }, amount: 120, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'travel',
    });

    // ─── 8. Savings + Investments ──────────────────────────────────
    c.savings(
      { name: 'ASB', type: 'investment', initialInvestment: 5000, currentValue: 6500, annualRate: 4.25, description: 'Amanah Saham Bumiputera — RM 200/bulan' },
      [
        { value: 5000, note: 'pembukaan', source: 'manual' },
        { value: 5400, note: 'after RM 400 contribute', source: 'manual' },
        { value: 5900, note: 'dividen tahun lepas masuk', source: 'manual' },
        { value: 6500, note: 'monthly contribute build up', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'Tabung Haji', type: 'savings', initialInvestment: 2000, currentValue: 2400, annualRate: 3.1, description: 'Simpanan haji + dividen' },
      [
        { value: 2000, note: 'opening', source: 'manual' },
        { value: 2200, note: 'top up raya', source: 'manual' },
        { value: 2400, note: 'dividen masuk', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'Versa Save', type: 'investment', initialInvestment: 1000, currentValue: 1180, annualRate: 3.8, description: 'Money market robo (Affin Hwang)' },
      [
        { value: 1000, note: 'starter', source: 'manual' },
        { value: 1100, note: 'monthly RM 100', source: 'manual' },
        { value: 1180, note: 'auto-DCA + return', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'Luno BTC', type: 'investment', initialInvestment: 500, currentValue: 720, description: 'DCA bitcoin sikit-sikit' },
      [
        { value: 500, note: 'try crypto sikit', source: 'manual' },
        { value: 720, note: 'BTC pump', source: 'manual' },
      ],
    );

    // ─── 9. Notes — quick scribbles ────────────────────────────────
    c.note('personal', 'spend hari ni:\nzus rm9.50\nlunch rm12\nteh tarik rm7\ntol rm3\ntotal rm31.50\n\nbudget makan minggu ni dah tinggal rm180');
    c.note('personal', 'after gaji 28hb:\n- bayar mortgage rm1150\n- bayar myvi rm580\n- takaful rm198\n- maxis + unifi rm178\n- kirim mak rm300\n- asb rm200 + versa rm100\n\nyg tinggal rm714 untuk makan + minyak + lain² 2 minggu next.\nbila boleh ke japan?');
    c.note('personal', 'todo bulan depan:\n- review subscription (chatgpt vs gemini?)\n- top up emergency fund\n- ajak hakim settle debt rm150 lagi\n- check ASB dividen tahun ni');

    // ─── 10. Receipts — recent scans ───────────────────────────────
    c.receipt({
      title: "Lotus's groceries",
      vendor: "Lotus's Malaysia",
      total: 145.2, subtotal: 137.0, tax: 8.2,
      date: daysAgo(3),
      category: 'shopping', myTaxCategory: 'general',
      verified: true, wallet: 'maybank',
      year: new Date().getFullYear(),
      items: [
        { name: 'Beras Jasmine 5kg', amount: 28.9 },
        { name: 'Ayam segar 1.2kg', amount: 18.4 },
        { name: 'Telur Grade A 30', amount: 14.5 },
        { name: 'Susu Dutch Lady 2L', amount: 17.9 },
        { name: 'Roti Gardenia', amount: 4.3 },
        { name: 'Indomie Goreng x10', amount: 14.9 },
        { name: 'Sayur campur', amount: 22.0 },
        { name: 'Sabun + ubat gigi', amount: 16.1 },
      ],
    });
    c.receipt({
      title: 'Petronas RON95',
      vendor: 'Petronas Setel',
      total: 70.0,
      date: daysAgo(3),
      category: 'transport', myTaxCategory: 'fuel',
      verified: true, wallet: 'tng',
      year: new Date().getFullYear(),
      items: [{ name: 'RON95 — 33.99L @ RM2.05', amount: 70.0 }],
    });
    c.receipt({
      title: 'Watsons',
      vendor: 'Watsons Malaysia',
      total: 45.0, subtotal: 42.45, tax: 2.55,
      date: daysAgo(21),
      category: 'health', myTaxCategory: 'medical',
      verified: true, wallet: 'visa',
      year: new Date().getFullYear(),
      items: [
        { name: 'Vitamin C 500mg x60', amount: 24.9 },
        { name: 'Panadol Soluble', amount: 9.5 },
        { name: 'Hand sanitizer 50ml', amount: 10.6 },
      ],
    });
  },
};
