import { daysAgo, startOfMonth, endOfMonth, type Persona } from '../core';

// ─── Persona ──────────────────────────────────────────────────────────
// Alia, 21, pelajar degree UiTM Shah Alam. (19–24 bracket.)
// Part-time barista kat ZUS Coffee + freelance design/photography side income.
// PTPTN masuk sekali sekala untuk cover yuran + keperluan semester.
// Naik Y15 ke kampus, 14 bulan into a 36-month loan.
// Tinggal sewa dengan housemates dekat Shah Alam, kongsi bil utiliti.
// Tight cashflow — gaji part-time + freelance tak seberapa, kena pandai jaga duit.
// ─────────────────────────────────────────────────────────────────────

export const student: Persona = {
  id: 'student',
  seed: (c) => {
    // ─── 1. Wallets — apa yang budak U ada dalam poket ──────────────
    // Bank
    c.wallet({ ref: 'bankislam', name: 'Bank Islam Savings', type: 'bank', balance: 780.0, icon: 'home', color: '#00954C', isDefault: true, presetId: 'bank_islam' });

    // E-wallets
    c.wallet({ ref: 'tng', name: "Touch 'n Go", type: 'ewallet', balance: 30.0, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng' });
    c.wallet({ ref: 'grabpay', name: 'GrabPay', type: 'ewallet', balance: 15.0, icon: 'smartphone', color: '#00B14F', isDefault: false, presetId: 'grabpay' });
    c.wallet({ ref: 'shopee', name: 'ShopeePay', type: 'ewallet', balance: 12.0, icon: 'smartphone', color: '#EE4D2D', isDefault: false, presetId: 'shopee_pay' });

    // Cash — duit runcit dalam dompet
    c.wallet({ ref: 'cash', name: 'Cash', type: 'cash', balance: 45.0, icon: 'dollar-sign', color: '#7A8B69', isDefault: false, presetId: 'cash' });

    // BNPL
    c.wallet({ ref: 'spaylater', name: 'SPayLater', type: 'credit', balance: 0, icon: 'credit-card', color: '#EE4D2D', isDefault: false, presetId: 'spaylater', creditLimit: 500, usedCredit: 120 });

    // ─── 2. Transactions — last 30 days, real student cashflow ─────
    // Day 1 (today)
    c.tx({ amount: 6.5, category: 'food', description: 'Kafe kampus — nasi lemak + teh o', date: daysAgo(0, 8), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 4.5, category: 'food', description: 'Kopi O kat DKG', date: daysAgo(0, 15), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 2
    c.tx({ amount: 22.0, category: 'food', description: 'GrabFood — Mr. DIY... eh McD', date: daysAgo(1, 21), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });
    c.tx({ amount: 1.5, category: 'education', description: 'Fotostat nota kelas', date: daysAgo(1, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 3
    c.tx({ amount: 3.0, category: 'transport', description: 'Parking UiTM Shah Alam', date: daysAgo(2, 8), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 25.0, category: 'transport', description: 'Minyak Y15 RON95', date: daysAgo(2, 18), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 4 — textbook
    c.tx({ amount: 68.0, category: 'education', description: 'Textbook Financial Accounting (2nd hand)', date: daysAgo(3, 14), type: 'expense', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });
    c.tx({ amount: 8.0, category: 'food', description: 'Kafe kampus — maggi goreng', date: daysAgo(3, 13), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 5 — thrift shopping
    c.tx({ amount: 35.0, category: 'shopping', description: 'Baju thrift Carousell', date: daysAgo(4, 20), type: 'expense', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });

    // Day 6 — printing assignment
    c.tx({ amount: 4.0, category: 'education', description: 'Print + jilid assignment', date: daysAgo(5, 11), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 7
    c.tx({ amount: 7.0, category: 'food', description: 'ZUS Coffee — americano (staff sikit discount)', date: daysAgo(6, 16), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 8 — wayang weekend
    c.tx({ amount: 15.0, category: 'entertainment', description: 'GSC wayang — tiket pelajar', date: daysAgo(7, 21), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 12.0, category: 'food', description: 'Popcorn + air kat wayang', date: daysAgo(7, 21), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });

    // Day 9 — groceries
    c.tx({ amount: 38.5, category: 'shopping', description: '99 Speedmart barang bilik', date: daysAgo(8, 19), type: 'expense', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });

    // Day 10 — pasar (cash)
    c.tx({ amount: 10.0, category: 'food', description: 'Pasar malam Seksyen 7 — ayam percik', date: daysAgo(9, 20), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 11 — SPayLater beli barang
    c.tx({ amount: 89.0, category: 'shopping', description: 'Shopee — kasut sukan (SPayLater 3x)', date: daysAgo(10, 22), type: 'expense', mode: 'personal', wallet: 'spaylater', inputMethod: 'manual' });

    // Day 12 — toll balik kampung
    c.tx({ amount: 9.0, category: 'transport', description: 'Tol balik kampung weekend', date: daysAgo(11, 15), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 30.0, category: 'transport', description: 'Minyak Y15 RON95', date: daysAgo(11, 16), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 14 — shift barista, lepas kerja makan
    c.tx({ amount: 9.5, category: 'food', description: 'Lunch kafe kampus lepas shift', date: daysAgo(13, 15), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 16 — Canva print poster untuk client freelance
    c.tx({ amount: 5.0, category: 'education', description: 'Print + laminate poster projek kelas', date: daysAgo(15, 12), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 18 — GrabFood malas masak
    c.tx({ amount: 18.0, category: 'food', description: 'GrabFood — Mixue + burger', date: daysAgo(17, 20), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });

    // Day 20 — shopping baju raya kolej
    c.tx({ amount: 45.0, category: 'shopping', description: 'Shopee — baju raya kolej', date: daysAgo(19, 21), type: 'expense', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });

    // Day 22 — groceries top up
    c.tx({ amount: 21.0, category: 'shopping', description: '99 Speedmart snek + air', date: daysAgo(21, 18), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 24 — mamak dengan classmates
    c.tx({ amount: 11.0, category: 'food', description: 'Mamak teh tarik + roti canai dgn classmates', date: daysAgo(23, 22), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 26 — beli data plan / bills
    c.tx({ amount: 30.0, category: 'bills', description: 'Topup prepaid Digi', date: daysAgo(25, 10), type: 'expense', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });

    // Day 28
    c.tx({ amount: 6.0, category: 'food', description: 'ZUS Coffee — cold brew', date: daysAgo(27, 9), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 14.0, category: 'food', description: 'GrabFood — nasi ayam', date: daysAgo(27, 19), type: 'expense', mode: 'personal', wallet: 'grabpay', inputMethod: 'manual' });

    // Day 29
    c.tx({ amount: 9.0, category: 'food', description: 'Kafe kampus — mee goreng (tunai)', date: daysAgo(28, 13), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // ─── Transfers — moving money between own wallets ──────────────
    // Reload Touch 'n Go dari bank lepas dapat gaji part-time.
    c.transfer('bankislam', 'tng', 40.0, "Reload Touch 'n Go");
    // Keluar cash kat ATM untuk belanja harian kampus.
    c.transfer('bankislam', 'cash', 60.0, 'Keluar duit ATM kampus');

    // ─── Income — last 30 days ───────────────────────────────────────
    c.tx({ amount: 3500.0, category: 'other', description: 'PTPTN semester masuk', date: daysAgo(20, 9), type: 'income', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });
    c.tx({ amount: 600.0, category: 'salary', description: 'Gaji part-time ZUS Coffee', date: daysAgo(5, 10), type: 'income', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });
    c.tx({ amount: 250.0, category: 'freelance', description: 'Freelance design poster untuk event kolej', date: daysAgo(9, 17), type: 'income', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });
    c.tx({ amount: 100.0, category: 'gift', description: 'Duit dari mak ayah', date: daysAgo(15, 12), type: 'income', mode: 'personal', wallet: 'bankislam', inputMethod: 'manual' });
    c.tx({ amount: 80.0, category: 'freelance', description: 'Freelance photography — grad shoot classmate', date: daysAgo(23, 16), type: 'income', mode: 'personal', wallet: 'shopee', inputMethod: 'manual' });

    // ─── 3. Subscriptions — fixed monthly outflow ───────────────────
    // Motor loan modeled as installment sub
    c.sub({ name: 'Y15 motor loan', amount: 220.0, billingCycle: 'monthly', startDate: daysAgo(420), nextBillingDate: daysAgo(-5), category: 'transport', isActive: true, isPaused: false, reminderDays: 3, isInstallment: true, totalInstallments: 36, completedInstallments: 14 });
    // Lifestyle / study subs
    c.sub({ name: 'Spotify Student', amount: 10.9, billingCycle: 'monthly', startDate: daysAgo(300), nextBillingDate: daysAgo(-14), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Netflix (share dgn housemate)', amount: 17.0, billingCycle: 'monthly', startDate: daysAgo(260), nextBillingDate: daysAgo(-9), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Canva Pro', amount: 39.9, billingCycle: 'monthly', startDate: daysAgo(190), nextBillingDate: daysAgo(-20), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });

    // ─── Echo budget planner — income + komitmen tetap ─────────────
    c.budgetProfile({
      takeHome: 1200,
      commitments: [
        { label: 'Y15 motor loan', monthly: 220 },
        { label: 'Langganan (Spotify/Netflix/Canva)', monthly: 68 },
      ],
    });

    // ─── 4. Budgets — apa yang Alia cuba jaga ───────────────────────
    c.budget({ category: 'food', allocatedAmount: 400, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'transport', allocatedAmount: 150, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'shopping', allocatedAmount: 150, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

    // ─── 5. Goals — apa yang budak U impikan ────────────────────────
    c.goal(
      { name: 'MacBook untuk design', targetAmount: 4500, category: 'other', icon: 'monitor', color: '#B2780A' },
      [
        { amount: 300, note: 'dari freelance design job' },
        { amount: 150, note: 'simpan sikit-sikit dari gaji part-time' },
        { amount: 100, note: 'duit raya masuk' },
      ],
    );
    c.goal(
      { name: 'Trip konvo bersama geng', targetAmount: 2000, category: 'travel', icon: 'map-pin', color: '#6BA3BE' },
      [
        { amount: 200, note: 'mula simpan awal-awal' },
        { amount: 100, note: 'freelance photography job' },
      ],
    );
    c.goal(
      { name: 'Emergency fund', targetAmount: 3000, category: 'savings', icon: 'shield', color: '#4F5104' },
      [{ amount: 150, note: 'lebihan lepas PTPTN masuk' }],
    );

    // ─── 6. Personal debts — kawan-kawan + PTPTN ────────────────────
    c.debt(
      { contact: { id: 'ptptn-001', name: 'PTPTN', isFromPhone: false }, type: 'i_owe', totalAmount: 40000, description: 'Pinjaman PTPTN', mode: 'personal', category: 'education' },
      [{ amount: 200, date: daysAgo(60), note: 'bayaran awal masa cuti sem' }],
    );
    c.debt(
      { contact: { id: 'husna-001', name: 'Husna (housemate)', phone: '0134567890', isFromPhone: false }, type: 'i_owe', totalAmount: 80, description: 'Bahagian bil utiliti bulan ni', mode: 'personal', category: 'bills' },
      [{ amount: 40, date: daysAgo(6), note: 'bayar setengah dulu' }],
    );
    c.debt(
      { contact: { id: 'danish-001', name: 'Danish', isFromPhone: false }, type: 'they_owe', totalAmount: 25, description: 'Makan kat kafe kampus, dia lupa bawak duit', mode: 'personal', category: 'food' },
    );

    // ─── 7. Splits — rumah sewa + trip ───────────────────────────────
    c.split({
      description: 'Bil utiliti rumah sewa Seksyen 7',
      totalAmount: 160,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 40, isPaid: true },
        { contact: { id: 'husna-001', name: 'Husna', isFromPhone: false }, amount: 40, isPaid: false },
        { contact: { id: 'aisyah-001', name: 'Aisyah', isFromPhone: false }, amount: 40, isPaid: true },
        { contact: { id: 'nabila-001', name: 'Nabila', isFromPhone: false }, amount: 40, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'bills',
    });
    c.split({
      description: 'Trip Melaka hujung minggu',
      totalAmount: 240,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 60, isPaid: true },
        { contact: { id: 'danish-001', name: 'Danish', isFromPhone: false }, amount: 60, isPaid: true },
        { contact: { id: 'aisyah-001', name: 'Aisyah', isFromPhone: false }, amount: 60, isPaid: false },
        { contact: { id: 'nabila-001', name: 'Nabila', isFromPhone: false }, amount: 60, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'travel',
    });

    // ─── 8. Savings + Investments ────────────────────────────────────
    c.savings(
      { name: 'ASB', type: 'asb', initialInvestment: 300, currentValue: 500, annualRate: 4.25, description: 'Amanah Saham Bumiputera — simpan bila ada lebihan' },
      [
        { value: 300, note: 'pembukaan guna duit raya', source: 'manual' },
        { value: 420, note: 'top up dari freelance job', source: 'manual' },
        { value: 500, note: 'dividen + simpan sikit-sikit', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'Tabung Haji', type: 'tabung_haji', initialInvestment: 200, currentValue: 300, annualRate: 3.1, description: 'Simpanan haji, isi bila ada rezeki' },
      [
        { value: 200, note: 'opening', source: 'manual' },
        { value: 300, note: 'top up dari gaji part-time', source: 'manual' },
      ],
    );

    // ─── 9. Notes — quick scribbles ──────────────────────────────────
    c.note('personal', 'lepas PTPTN masuk rm3500:\n- textbook + fotostat rm70\n- bayar husna utiliti rm40\n- simpan asb rm300\n- baki kena tahan sampai akhir sem\n\njangan boros shopee!!');
    c.note('personal', 'jadual shift ZUS bulan ni:\nisnin & rabu 4-9pm\nsabtu 10am-6pm\n\nincome part-time ~rm600/bulan\nfreelance design/photography bila ada job je, tak tetap');

    // ─── 10. Receipts — recent scans ─────────────────────────────────
    c.receipt({
      title: '99 Speedmart groceries',
      vendor: '99 Speedmart',
      total: 38.5, subtotal: 36.3, tax: 2.2,
      date: daysAgo(8),
      category: 'shopping', myTaxCategory: 'general',
      verified: true, wallet: 'bankislam',
      year: new Date().getFullYear(),
      items: [
        { name: 'Maggi kari x5', amount: 6.5 },
        { name: 'Roti Gardenia', amount: 4.3 },
        { name: 'Air mineral 1.5L x6', amount: 9.0 },
        { name: 'Telur Grade B 10', amount: 5.8 },
        { name: 'Snek + biskut', amount: 12.9 },
      ],
    });
    c.receipt({
      title: 'Minyak Y15',
      vendor: 'Petronas Setel',
      total: 25.0,
      date: daysAgo(2),
      category: 'transport', myTaxCategory: 'fuel',
      verified: true, wallet: 'tng',
      year: new Date().getFullYear(),
      items: [{ name: 'RON95 — 12.19L @ RM2.05', amount: 25.0 }],
    });
    c.receipt({
      title: 'Textbook Financial Accounting',
      vendor: 'Kedai Buku Kampus',
      total: 68.0,
      date: daysAgo(3),
      category: 'education', myTaxCategory: 'general',
      verified: true, wallet: 'bankislam',
      year: new Date().getFullYear(),
      items: [{ name: 'Financial Accounting 2nd hand (sem 4)', amount: 68.0 }],
    });

    // ─── Echo's notebook — shortcuts Echo learned + what it remembers ──────
    // Trusted category rules (count ≥ 2 → "knows you")
    c.learnCategory('zus', 'food', 4);
    c.learnCategory('shopee', 'shopping', 3);
    c.learnCategory('petrol', 'transport', 2);
    c.learnCategory('mcd', 'food', 2);
    // Still learning (count 1)
    c.learnCategory('daiso', 'shopping', 1);
    c.learnCategory('grab', 'transport', 1);
    // Which wallet a keyword is usually paid from
    c.learnWallet('shopee', 'ShopeePay', 3);
    c.learnWallet('grab', 'GrabPay', 2);
    c.learnWallet('makan', 'Cash', 1);
    // People Echo learned to recognise
    c.learnPerson('mak', 'Mama', 2);
    c.learnPerson('abg', 'Abang', 1);
    // Type corrections (PTPTN + freelance + part-time wage are income)
    c.learnType('ptptn', 'income', 2);
    c.learnType('freelance', 'income', 1);
    c.learnType('gaji zus', 'income', 1);
    // Keywords Echo learned to skip
    c.learnSkip('spaylater', 1);
    c.learnSkip('transfer', 1);
    // Durable memories — what Echo carries into every chat
    c.memory({ kind: 'goal', text: 'Paying off the Y15 motorbike loan (14 of 36 months done)', source: 'echo', pinned: true });
    c.memory({ kind: 'bill', text: 'Shares monthly utility bills with housemates in Shah Alam', source: 'echo' });
    c.memory({ kind: 'fact', text: 'UiTM degree student — part-time ZUS barista plus freelance design income', source: 'echo' });
    c.memory({ kind: 'worry', text: 'Cashflow is tight between PTPTN disbursements', source: 'echo' });
    c.memory({ kind: 'win', text: 'Freelance photography gigs are bringing in extra side income', source: 'echo' });
    c.memory({ kind: 'style', text: 'Prefers a casual Malay-English mix and practical student budgeting tips', source: 'you' });
  },
};
