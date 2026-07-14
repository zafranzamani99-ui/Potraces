import { daysAgo, startOfMonth, endOfMonth, type Persona } from '../core';

// ─── Persona ──────────────────────────────────────────────────────────
// Danish, 16, pelajar Form 4 kat sekolah menengah Shah Alam.
// Takde gaji — duit poket mingguan dari mak ayah, lebihan duit raya, dan
// side income kecik-kecikan (jual keropok kat sekolah + edit CapCut kawan).
// Bank MAE (Maybank) untuk simpan, TnG untuk canteen/MRT, cash untuk jajan.
// Tengah simpan untuk phone baru + lesen kereta lepas SPM.
// ─────────────────────────────────────────────────────────────────────

export const teen: Persona = {
  id: 'teen',
  seed: (c) => {
    // ─── 1. Wallets — apa yang budak sekolah form 4 betul-betul ada ─
    c.wallet({ ref: 'mae', name: 'Bank MAE', type: 'bank', balance: 320.0, icon: 'home', color: '#FFC300', isDefault: true, presetId: 'maybank' });
    c.wallet({ ref: 'tng', name: "Touch 'n Go eWallet", type: 'ewallet', balance: 22.0, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng' });
    c.wallet({ ref: 'boost', name: 'Boost', type: 'ewallet', balance: 8.0, icon: 'smartphone', color: '#FA4616', isDefault: false, presetId: 'boost' });
    c.wallet({ ref: 'cash', name: 'Duit poket', type: 'cash', balance: 35.0, icon: 'dollar-sign', color: '#7A8B69', isDefault: false, presetId: 'cash' });

    // ─── 2. Transactions — last 30 days, small budak sekolah spends ─
    // Day 1 (today)
    c.tx({ amount: 4.0, category: 'food', description: 'Canteen nasi lemak + milo', date: daysAgo(0, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 3.0, category: 'transport', description: 'Bas sekolah pulang', date: daysAgo(0, 14), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 2
    c.tx({ amount: 5.0, category: 'entertainment', description: 'Top-up Mobile Legends diamond', date: daysAgo(1, 20), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 3.5, category: 'food', description: 'Canteen roti john', date: daysAgo(1, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 3
    c.tx({ amount: 6.5, category: 'food', description: 'Bubble tea Tealive lepas sekolah', date: daysAgo(2, 15), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 4
    c.tx({ amount: 7.0, category: 'education', description: 'Fotostat nota + alat tulis', date: daysAgo(3, 13), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 3.0, category: 'food', description: 'Canteen mee goreng', date: daysAgo(3, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 5 — MRT balik rumah nenek
    c.tx({ amount: 4.5, category: 'transport', description: 'MRT ke rumah nenek', date: daysAgo(4, 16), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 6 — jajan kedai runcit (cash)
    c.tx({ amount: 2.5, category: 'food', description: 'Kedai runcit — Cheezels + Twisties', date: daysAgo(5, 17), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 7 — weekend wayang dengan kawan
    c.tx({ amount: 18.0, category: 'entertainment', description: 'GSC wayang dengan kawan-kawan', date: daysAgo(6, 19), type: 'expense', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 9.0, category: 'food', description: 'Popcorn + air masa wayang', date: daysAgo(6, 19), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 9 — 7-Eleven
    c.tx({ amount: 6.0, category: 'food', description: '7-Eleven Slurpee + snack', date: daysAgo(8, 16), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 10 — arcade (cash)
    c.tx({ amount: 10.0, category: 'entertainment', description: 'Arcade — game token', date: daysAgo(9, 18), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 11
    c.tx({ amount: 3.0, category: 'transport', description: 'Bas sekolah pergi', date: daysAgo(10, 7), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 4.0, category: 'food', description: 'Canteen nasi lemak', date: daysAgo(10, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 13 — Roblox Robux
    c.tx({ amount: 12.0, category: 'entertainment', description: 'Roblox Robux top-up', date: daysAgo(12, 21), type: 'expense', mode: 'personal', wallet: 'boost', inputMethod: 'manual' });

    // Day 15 — mamak dengan kawan
    c.tx({ amount: 8.0, category: 'food', description: 'Mamak maggi goreng + teh ais', date: daysAgo(14, 20), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 17 — beli buku latihan
    c.tx({ amount: 15.0, category: 'education', description: 'Buku latihan SPM — Popular Bookstore', date: daysAgo(16, 15), type: 'expense', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });

    // Day 19 — canteen + jajan runcit
    c.tx({ amount: 4.0, category: 'food', description: 'Canteen mee hoon goreng', date: daysAgo(18, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 2.0, category: 'food', description: 'Kedai runcit — air kotak', date: daysAgo(18, 13), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 22 — birthday kawan, beli hadiah kecik
    c.tx({ amount: 10.0, category: 'shopping', description: 'Hadiah birthday kawan — stationery set', date: daysAgo(21, 17), type: 'expense', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });

    // Day 25 — bubble tea lagi
    c.tx({ amount: 7.5, category: 'food', description: 'Bubble tea CHAGEE', date: daysAgo(24, 16), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 27 — canteen
    c.tx({ amount: 3.5, category: 'food', description: 'Canteen roti telur', date: daysAgo(26, 10), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // ─── Transfer — reload TnG untuk naik MRT ───────────────────────
    c.transfer('mae', 'tng', 10.0, 'Reload TnG naik MRT');

    // ─── Income — duit poket, duit raya, side income ────────────────
    c.tx({ amount: 40.0, category: 'other', description: 'Duit poket mingguan dari mak', date: daysAgo(28, 8), type: 'income', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 40.0, category: 'other', description: 'Duit poket mingguan dari mak', date: daysAgo(21, 8), type: 'income', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 40.0, category: 'other', description: 'Duit poket mingguan dari mak', date: daysAgo(14, 8), type: 'income', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 40.0, category: 'other', description: 'Duit poket mingguan dari mak', date: daysAgo(7, 8), type: 'income', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 15.0, category: 'other', description: 'Duit poket extra dari ayah', date: daysAgo(0, 9), type: 'income', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 60.0, category: 'gift', description: 'Baki duit raya masih ada', date: daysAgo(25, 12), type: 'income', mode: 'personal', wallet: 'mae', inputMethod: 'manual' });
    c.tx({ amount: 18.0, category: 'freelance', description: 'Jual keropok lekor kat sekolah', date: daysAgo(9, 13), type: 'income', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 25.0, category: 'freelance', description: 'Edit CapCut untuk video TikTok kawan', date: daysAgo(4, 20), type: 'income', mode: 'personal', wallet: 'boost', inputMethod: 'manual' });

    // ─── 3. Subscriptions — kecik-kecikan je ────────────────────────
    c.sub({ name: 'Spotify Premium Student', amount: 10.9, billingCycle: 'monthly', startDate: daysAgo(200), nextBillingDate: daysAgo(-14), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Hotlink prepaid top-up', amount: 15.0, billingCycle: 'monthly', startDate: daysAgo(300), nextBillingDate: daysAgo(-6), category: 'bills', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });

    // ─── 4. Budgets ──────────────────────────────────────────────────
    c.budget({ category: 'food', allocatedAmount: 120, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'entertainment', allocatedAmount: 60, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

    // ─── 5. Goals — apa budak form 4 impikan ────────────────────────
    c.goal(
      { name: 'Phone baru — iPhone 13', targetAmount: 2000, category: 'other', icon: 'smartphone', color: '#B2780A' },
      [
        { amount: 60, note: 'baki duit raya' },
        { amount: 40, note: 'simpan dari duit poket' },
        { amount: 25, note: 'duit edit CapCut kawan' },
      ],
    );
    c.goal(
      { name: 'Nintendo eShop — game baru', targetAmount: 250, category: 'other', icon: 'gift', color: '#6BA3BE' },
      [
        { amount: 30, note: 'simpan sikit-sikit' },
        { amount: 18, note: 'duit jual keropok lekor' },
      ],
    );
    c.goal(
      { name: 'Lesen kereta lepas SPM', targetAmount: 1500, category: 'other', icon: 'award', color: '#4F5104' },
      [{ amount: 50, note: 'start simpan awal-awal' }],
    );

    // ─── 6. Personal debts — kawan-kawan kecik-kecikan ──────────────
    c.debt(
      { contact: { id: 'aiman-001', name: 'Aiman', isFromPhone: false }, type: 'i_owe', totalAmount: 8, description: 'Aiman belanja makan canteen semalam', mode: 'personal', category: 'food' },
      [{ amount: 4, date: daysAgo(3), note: 'bayar separuh dulu' }],
    );
    c.debt(
      { contact: { id: 'firdaus-001', name: 'Firdaus', isFromPhone: false }, type: 'they_owe', totalAmount: 15, description: 'Firdaus pinjam untuk top-up game', mode: 'personal', category: 'entertainment' },
      [],
    );

    // ─── 7. Splits — patungan hadiah cikgu ──────────────────────────
    c.split({
      description: 'Patungan hadiah birthday Cikgu Aina',
      totalAmount: 40,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 10, isPaid: true },
        { contact: { id: 'aiman-001', name: 'Aiman', isFromPhone: false }, amount: 10, isPaid: true },
        { contact: { id: 'firdaus-001', name: 'Firdaus', isFromPhone: false }, amount: 10, isPaid: false },
        { contact: { id: 'hazwan-001', name: 'Hazwan', isFromPhone: false }, amount: 10, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'other',
    });

    // ─── 8. Savings — tabung celengan + ASB Junior ──────────────────
    c.savings(
      { name: 'Tabung celengan', type: 'save_generic', initialInvestment: 100, currentValue: 200, description: 'Simpan dalam tabung kat bilik' },
      [
        { value: 100, note: 'opening', source: 'manual' },
        { value: 150, note: 'masuk duit poket lebihan', source: 'manual' },
        { value: 200, note: 'masuk duit raya', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'ASB Junior', type: 'asb', initialInvestment: 400, currentValue: 500, annualRate: 4.0, description: 'Dibuka oleh mak ayah, dividen masuk tiap tahun' },
      [
        { value: 400, note: 'opening oleh mak', source: 'manual' },
        { value: 460, note: 'dividen tahun lepas', source: 'manual' },
        { value: 500, note: 'top up sikit dari ayah', source: 'manual' },
      ],
    );

    // ─── 9. Notes ────────────────────────────────────────────────────
    c.note('personal', 'jajan minggu ni:\ncanteen rm4 x5 hari\nbubble tea rm6.50\ntop up ML rm5\ntotal dah lebih rm40 duit poket 😭\n\nkurangkan bubble tea bulan depan');
    c.note('personal', 'simpan untuk phone plan lepas SPM:\n- target rm2000 iphone\n- duit raya + duit poket simpan\n- kurangkan beli game topup\n- tanya ayah pasal top up ASB junior');

    // ─── 10. Receipts ──────────────────────────────────────────────
    c.receipt({
      title: 'Popular Bookstore',
      vendor: 'Popular Bookstore',
      total: 15.0, subtotal: 15.0,
      date: daysAgo(16),
      category: 'education', myTaxCategory: 'general',
      verified: true, wallet: 'mae',
      year: new Date().getFullYear(),
      items: [
        { name: 'Buku latihan Add Maths', amount: 8.5 },
        { name: 'Pen + pensel set', amount: 6.5 },
      ],
    });
  },
};
