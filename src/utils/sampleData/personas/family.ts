import { daysAgo, startOfMonth, endOfMonth, type Persona } from '../core';

// ─── Persona ──────────────────────────────────────────────────────────
// Farah, 34, HR manager di sebuah firma korporat KL. (30+ bracket.)
// Suami (Encik) kerja swasta, kongsi belanja rumah via joint account.
// 2 anak kecil — anak sulung dah masuk tadika, anak kedua dalam lampin.
// Duduk rumah teres di Cheras, 7.5 tahun into a 30-year mortgage.
// Pandu SUV keluarga (Honda CR-V), 3.5 tahun into a 9-year loan.
// Established household — bigger income, bigger commitments, bigger savings.
// Ada tuition part-time petang (mengajar budak sekolah rendah dekat rumah),
// simpan untuk pendidikan anak (SSPN), umrah sekeluarga, and renovate rumah.
// ─────────────────────────────────────────────────────────────────────

export const family: Persona = {
  id: 'family',
  seed: (c) => {
    // ─── 1. Wallets — a full household setup ────────────────────────
    // Banks
    c.wallet({ ref: 'maybank', name: 'Maybank Joint Account', type: 'bank', balance: 6200.0, icon: 'home', color: '#FFC300', isDefault: true, presetId: 'maybank' });
    c.wallet({ ref: 'cimb', name: 'CIMB Savings', type: 'bank', balance: 3500.0, icon: 'home', color: '#EC1C24', isDefault: false, presetId: 'cimb' });

    // E-wallets
    c.wallet({ ref: 'gxbank', name: 'GXBank Emergency Fund', type: 'ewallet', balance: 15000.0, icon: 'smartphone', color: '#00A651', isDefault: false, presetId: 'gxbank' });
    c.wallet({ ref: 'tng', name: 'Touch \'n Go SmartTAG', type: 'ewallet', balance: 40.0, icon: 'smartphone', color: '#005ABE', isDefault: false, presetId: 'tng' });

    // Cash — physical duit rumah
    c.wallet({ ref: 'cash', name: 'Cash rumah', type: 'cash', balance: 250.0, icon: 'dollar-sign', color: '#7A8B69', isDefault: false, presetId: 'cash' });

    // Credit cards
    c.wallet({ ref: 'visa', name: 'Maybank Visa', type: 'credit', balance: 0, icon: 'credit-card', color: '#FFC300', isDefault: false, presetId: 'credit_card', creditBank: 'maybank', creditNetwork: 'visa', creditLimit: 15000, usedCredit: 3200 });
    c.wallet({ ref: 'mc', name: 'CIMB Mastercard', type: 'credit', balance: 0, icon: 'credit-card', color: '#EC1C24', isDefault: false, presetId: 'credit_card', creditBank: 'cimb', creditNetwork: 'mastercard', creditLimit: 10000, usedCredit: 1500 });

    // ─── 2. Transactions — last 30 days, real household cashflow ───
    // Day 1 (today)
    c.tx({ amount: 18.5, category: 'food', description: 'Sarapan nasi lemak sekeluarga', date: daysAgo(0, 8), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });
    c.tx({ amount: 12.0, category: 'family', description: 'Parking sekolah tadika (tunai)', date: daysAgo(0, 7), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 2 — pasar pagi
    c.tx({ amount: 45.0, category: 'food', description: 'Pasar pagi Cheras — sayur + ikan (tunai)', date: daysAgo(1, 8), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 89.0, category: 'family', description: 'Lampin + susu formula anak kedua', date: daysAgo(1, 17), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 3 — big groceries run
    c.tx({ amount: 312.4, category: 'food', description: 'Jaya Grocer — grocery bulanan keluarga', date: daysAgo(2, 19), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 85.0, category: 'transport', description: 'Petronas RON95 — CR-V', date: daysAgo(2, 20), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 4 — tadika + tuition
    c.tx({ amount: 480.0, category: 'education', description: 'Yuran tadika anak sulung (bulanan)', date: daysAgo(3, 9), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 5 — klinik anak
    c.tx({ amount: 65.0, category: 'health', description: 'Klinik anak — demam + ubat batuk', date: daysAgo(4, 15), type: 'expense', mode: 'personal', wallet: 'cimb', inputMethod: 'manual' });

    // Day 6 — makan keluarga hujung minggu
    c.tx({ amount: 128.0, category: 'food', description: 'Makan keluarga hujung minggu — Kenny Rogers', date: daysAgo(5, 20), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 22.0, category: 'entertainment', description: 'Playground indoor anak-anak', date: daysAgo(5, 17), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 7 — tol SmartTAG
    c.tx({ amount: 18.4, category: 'transport', description: 'Tol SmartTAG — LDP + Grand Saga', date: daysAgo(6, 8), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 8 — upah bibik
    c.tx({ amount: 800.0, category: 'family', description: 'Upah bibik jaga anak (bulanan, tunai)', date: daysAgo(7, 18), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 60.0, category: 'family', description: 'Upah tukang kebun (tunai)', date: daysAgo(7, 19), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 9 — baju sekolah anak
    c.tx({ amount: 156.0, category: 'shopping', description: 'Baju + kasut sekolah anak sulung', date: daysAgo(8, 16), type: 'expense', mode: 'personal', wallet: 'mc', inputMethod: 'manual' });

    // Day 10 — Shopee barang anak
    c.tx({ amount: 78.5, category: 'shopping', description: 'Shopee — mainan + buku cerita anak', date: daysAgo(9, 21), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 11 — pasar pagi lagi
    c.tx({ amount: 38.0, category: 'food', description: 'Pasar pagi — ikan kembung + udang (tunai)', date: daysAgo(10, 8), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 12 — duit belanja sekolah
    c.tx({ amount: 30.0, category: 'family', description: 'Duit belanja sekolah anak seminggu (tunai)', date: daysAgo(11, 7), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 13 — angpau kenduri
    c.tx({ amount: 100.0, category: 'family', description: 'Angpau kenduri kahwin sepupu', date: daysAgo(12, 19), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 14 — bills week
    c.tx({ amount: 165.0, category: 'bills', description: 'TNB electric rumah', date: daysAgo(13, 11), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 42.0, category: 'bills', description: 'Indah Water + air rumah', date: daysAgo(13, 11), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 15 — PAYDAY week: pharmacy + groceries top-up
    c.tx({ amount: 58.0, category: 'health', description: 'Guardian — vitamin anak + ubat panas', date: daysAgo(14, 14), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });
    c.tx({ amount: 210.0, category: 'food', description: "Lotus's — grocery top-up minggu ni", date: daysAgo(14, 18), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // Day 17 — minyak SUV lagi
    c.tx({ amount: 90.0, category: 'transport', description: 'Petronas RON95 — CR-V isi penuh', date: daysAgo(16, 9), type: 'expense', mode: 'personal', wallet: 'visa', inputMethod: 'manual' });

    // Day 19 — makan luar keluarga
    c.tx({ amount: 98.0, category: 'food', description: 'Mamak family dinner', date: daysAgo(18, 20), type: 'expense', mode: 'personal', wallet: 'tng', inputMethod: 'manual' });

    // Day 21 — susu + lampin lagi
    c.tx({ amount: 95.0, category: 'family', description: 'Susu formula + lampin (restock bulanan)', date: daysAgo(20, 17), type: 'expense', mode: 'personal', wallet: 'cimb', inputMethod: 'manual' });

    // Day 23 — parking + pasar pagi
    c.tx({ amount: 8.0, category: 'transport', description: 'Parking mall (tunai)', date: daysAgo(22, 15), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });
    c.tx({ amount: 41.0, category: 'food', description: 'Pasar pagi — sayur + buah (tunai)', date: daysAgo(22, 8), type: 'expense', mode: 'personal', wallet: 'cash', inputMethod: 'manual' });

    // Day 25 — Mydin grocery run
    c.tx({ amount: 187.0, category: 'food', description: 'Mydin — barang dapur bulanan', date: daysAgo(24, 18), type: 'expense', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // ─── Transfers — moving money between own wallets ──────────────
    // Top-up the emergency fund savings pot.
    c.transfer('maybank', 'gxbank', 1000.0, 'Top-up tabung kecemasan GXBank');
    // Drew physical cash out for household spending.
    c.transfer('maybank', 'cash', 300.0, 'Keluar duit ATM belanja rumah');
    // Reload the SmartTAG for toll.
    c.transfer('maybank', 'tng', 50.0, 'Reload SmartTAG untuk tol');

    // ─── Income — last 30 days ───────────────────────────────────────
    c.tx({ amount: 7500.0, category: 'salary', description: 'Gaji HR Manager bulan ini (net)', date: daysAgo(14, 9), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 3000.0, category: 'other', description: 'Duit Encik masuk joint', date: daysAgo(14, 10), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });
    c.tx({ amount: 400.0, category: 'freelance', description: 'Tuition petang budak sekolah rendah', date: daysAgo(6, 16), type: 'income', mode: 'personal', wallet: 'cimb', inputMethod: 'manual' });
    c.tx({ amount: 65.0, category: 'investment', description: 'Dividen ASB masuk', date: daysAgo(9, 11), type: 'income', mode: 'personal', wallet: 'maybank', inputMethod: 'manual' });

    // ─── 3. Subscriptions — fixed monthly outflow ────────────────────
    // Long-term loans modeled as installment subs
    c.sub({ name: 'Rumah teres Cheras — home loan', amount: 1850.0, billingCycle: 'monthly', startDate: daysAgo(2740), nextBillingDate: daysAgo(-6), category: 'bills', isActive: true, isPaused: false, reminderDays: 5, isInstallment: true, totalInstallments: 360, completedInstallments: 90 });
    c.sub({ name: 'Honda CR-V loan', amount: 980.0, billingCycle: 'monthly', startDate: daysAgo(1280), nextBillingDate: daysAgo(-4), category: 'transport', isActive: true, isPaused: false, reminderDays: 3, isInstallment: true, totalInstallments: 108, completedInstallments: 40 });
    // Insurance / takaful
    c.sub({ name: 'Takaful keluarga', amount: 350.0, billingCycle: 'monthly', startDate: daysAgo(1900), nextBillingDate: daysAgo(-14), category: 'health', isActive: true, isPaused: false, reminderDays: 4, isInstallment: false });
    c.sub({ name: 'Insurans pendidikan anak', amount: 200.0, billingCycle: 'monthly', startDate: daysAgo(1500), nextBillingDate: daysAgo(-17), category: 'health', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
    // Phone + internet + TV
    c.sub({ name: 'Maxis family postpaid', amount: 180.0, billingCycle: 'monthly', startDate: daysAgo(950), nextBillingDate: daysAgo(-9), category: 'bills', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'Unifi 300Mbps', amount: 149.0, billingCycle: 'monthly', startDate: daysAgo(1200), nextBillingDate: daysAgo(-15), category: 'bills', isActive: true, isPaused: false, reminderDays: 3, isInstallment: false });
    c.sub({ name: 'Astro family pack', amount: 130.0, billingCycle: 'monthly', startDate: daysAgo(1600), nextBillingDate: daysAgo(-21), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    // Lifestyle
    c.sub({ name: 'Netflix Premium', amount: 55.0, billingCycle: 'monthly', startDate: daysAgo(760), nextBillingDate: daysAgo(-19), category: 'subscription', isActive: true, isPaused: false, reminderDays: 2, isInstallment: false });
    c.sub({ name: 'iCloud family 2TB', amount: 39.9, billingCycle: 'monthly', startDate: daysAgo(880), nextBillingDate: daysAgo(-24), category: 'subscription', isActive: true, isPaused: false, reminderDays: 1, isInstallment: false });
    c.sub({ name: 'Spotify Family', amount: 25.9, billingCycle: 'monthly', startDate: daysAgo(920), nextBillingDate: daysAgo(-12), category: 'subscription', isActive: true, isPaused: false, reminderDays: 1, isInstallment: false });

    // ─── 4. Budgets — household monthly targets ──────────────────────
    c.budget({ category: 'food', allocatedAmount: 1500, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'family', allocatedAmount: 800, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'transport', allocatedAmount: 500, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });
    c.budget({ category: 'shopping', allocatedAmount: 400, period: 'monthly', startDate: startOfMonth(), endDate: endOfMonth() });

    // ─── 5. Goals — what an established family saves for ─────────────
    c.goal(
      { name: 'Pendidikan anak (SSPN)', targetAmount: 100000, category: 'other', icon: 'book-open', color: '#4F5104' },
      [
        { amount: 20000, note: 'opening SSPN dua-dua anak' },
        { amount: 8000, note: 'bonus tahunan masuk SSPN' },
        { amount: 5000, note: 'simpan konsisten bulanan' },
      ],
    );
    c.goal(
      { name: 'Umrah sekeluarga', targetAmount: 40000, category: 'travel', icon: 'map-pin', color: '#6BA3BE' },
      [
        { amount: 12000, note: 'simpanan awal umrah' },
        { amount: 6000, note: 'bonus + duit raya kumpul' },
        { amount: 3000, note: 'top-up bulanan' },
      ],
    );
    c.goal(
      { name: 'Renovate rumah', targetAmount: 30000, category: 'other', icon: 'home', color: '#B2780A' },
      [
        { amount: 10000, note: 'simpanan renovate dapur + bilik anak' },
        { amount: 4000, note: 'top-up lepas bonus' },
      ],
    );
    c.goal(
      { name: 'Tabung kecemasan (6 bulan)', targetAmount: 45000, category: 'savings', icon: 'shield', color: '#A688B8' },
      [
        { amount: 20000, note: 'starter dari simpanan lama' },
        { amount: 10000, note: 'transfer dari GXBank' },
        { amount: 5000, note: 'consistent monthly top-up' },
      ],
    );

    // ─── 6. Personal debts — family kecik-kecik ───────────────────────
    c.debt(
      { contact: { id: 'adik-001', name: 'Adik Aiman', phone: '0123456789', isFromPhone: false }, type: 'they_owe', totalAmount: 2000, description: 'Pinjam adik untuk deposit sewa rumah baru', mode: 'personal', category: 'family' },
      [{ amount: 800, date: daysAgo(10), note: 'bayar balik sebahagian, transfer DuitNow' }],
    );
    c.debt(
      { contact: { id: 'abang-001', name: 'Abang Zul', phone: '0167778888', isFromPhone: false }, type: 'i_owe', totalAmount: 800, description: 'Patungan kenduri adik-beradik — abang bayar dulu', mode: 'personal', category: 'family' },
      [{ amount: 300, date: daysAgo(5), note: 'bayar sikit dulu' }],
    );

    // ─── 7. Splits — group trips + kenduri ────────────────────────────
    c.split({
      description: 'Trip keluarga Langkawi — resort + ferry',
      totalAmount: 2400,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 800, isPaid: true },
        { contact: { id: 'adik-001', name: 'Adik Aiman', isFromPhone: false }, amount: 800, isPaid: false },
        { contact: { id: 'abang-001', name: 'Abang Zul', isFromPhone: false }, amount: 800, isPaid: true },
      ],
      items: [],
      mode: 'personal',
      category: 'travel',
    });
    c.split({
      description: 'Kenduri patungan adik-beradik — kenduri arwah tok',
      totalAmount: 1200,
      splitMethod: 'equal',
      participants: [
        { contact: { id: 'self-001', name: 'You', isFromPhone: false }, amount: 300, isPaid: true },
        { contact: { id: 'adik-001', name: 'Adik Aiman', isFromPhone: false }, amount: 300, isPaid: true },
        { contact: { id: 'abang-001', name: 'Abang Zul', isFromPhone: false }, amount: 300, isPaid: false },
        { contact: { id: 'kakak-001', name: 'Kakak Zana', isFromPhone: false }, amount: 300, isPaid: false },
      ],
      items: [],
      mode: 'personal',
      category: 'family',
    });

    // ─── 8. Savings + Investments ──────────────────────────────────
    c.savings(
      { name: 'ASB', type: 'asb', initialInvestment: 30000, currentValue: 45000, annualRate: 4.25, description: 'Amanah Saham Bumiputera — RM 500/bulan' },
      [
        { value: 30000, note: 'pembukaan dari simpanan lama', source: 'manual' },
        { value: 36000, note: 'top-up bonus tahunan', source: 'manual' },
        { value: 41000, note: 'dividen tahun lepas masuk', source: 'manual' },
        { value: 45000, note: 'monthly contribute build up', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'SSPN anak sulung', type: 'esa', initialInvestment: 8000, currentValue: 12000, annualRate: 3.5, description: 'Simpanan pendidikan anak pertama' },
      [
        { value: 8000, note: 'opening bila anak lahir', source: 'manual' },
        { value: 10000, note: 'top up bonus', source: 'manual' },
        { value: 12000, note: 'monthly consistent contribute', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'SSPN anak kedua', type: 'esa', initialInvestment: 5000, currentValue: 8000, annualRate: 3.5, description: 'Simpanan pendidikan anak kedua' },
      [
        { value: 5000, note: 'opening bila anak kedua lahir', source: 'manual' },
        { value: 6500, note: 'top up angpau', source: 'manual' },
        { value: 8000, note: 'monthly consistent contribute', source: 'manual' },
      ],
    );
    c.savings(
      { name: 'Tabung Haji', type: 'tabung_haji', initialInvestment: 14000, currentValue: 20000, annualRate: 3.1, description: 'Simpanan haji + umrah sekeluarga' },
      [
        { value: 14000, note: 'opening lama', source: 'manual' },
        { value: 17000, note: 'top up raya + bonus', source: 'manual' },
        { value: 20000, note: 'dividen + monthly top-up', source: 'manual' },
      ],
    );

    // ─── 9. Notes — quick household scribbles ─────────────────────
    c.note('personal', 'family budget bulanan:\n- mortgage rm1850\n- car loan CR-V rm980\n- takaful rm350\n- insurans anak rm200\n- maxis + unifi + astro rm459\n- tadika anak sulung rm480\n- upah bibik rm800\n\ntotal fixed ~rm5100. baki untuk makan + minyak + savings.');
    c.note('personal', 'senarai barang sekolah anak sulung:\n- baju sekolah 3 helai\n- kasut sekolah\n- beg sekolah baru\n- botol air + bekal\n- buku latihan + pensel warna\n\nbeli awal sebelum sekolah bertambah ramai.');

    // ─── 10. Receipts — recent scans ───────────────────────────────
    c.receipt({
      title: 'Jaya Grocer — grocery bulanan',
      vendor: 'Jaya Grocer',
      total: 312.4, subtotal: 294.7, tax: 17.7,
      date: daysAgo(2),
      category: 'food', myTaxCategory: 'general',
      verified: true, wallet: 'visa',
      year: new Date().getFullYear(),
      items: [
        { name: 'Beras Jasmine 10kg', amount: 42.9 },
        { name: 'Ayam segar 2kg', amount: 32.4 },
        { name: 'Susu formula anak', amount: 89.0 },
        { name: 'Telur Grade A 30', amount: 14.5 },
        { name: 'Sayur + buah campur', amount: 48.0 },
        { name: 'Daging + ikan', amount: 55.4 },
        { name: 'Barang dapur + snek anak', amount: 30.2 },
      ],
    });
    c.receipt({
      title: 'Guardian — ubat anak',
      vendor: 'Guardian Malaysia',
      total: 58.0, subtotal: 54.7, tax: 3.3,
      date: daysAgo(14),
      category: 'health', myTaxCategory: 'medical',
      verified: true, wallet: 'visa',
      year: new Date().getFullYear(),
      items: [
        { name: 'Vitamin anak', amount: 25.9 },
        { name: 'Ubat panas + batuk anak', amount: 18.1 },
        { name: 'Plaster + antiseptik', amount: 14.0 },
      ],
    });
    c.receipt({
      title: 'Petronas RON95',
      vendor: 'Petronas Setel',
      total: 90.0,
      date: daysAgo(16),
      category: 'transport', myTaxCategory: 'fuel',
      verified: true, wallet: 'visa',
      year: new Date().getFullYear(),
      items: [{ name: 'RON95 — 43.90L @ RM2.05', amount: 90.0 }],
    });
  },
};
