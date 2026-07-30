/**
 * Unit tests for the Echo reply-cards layer (src/services/echoCards):
 *  - parse:  [CARD] extraction — well-formed, code-fenced, unknown-kind drop,
 *            multi-card cap, unclosed-trailing (streaming) left intact.
 *  - build:  each builder's headline number EQUALS the underlying calc
 *            (anti-drift, the anti-hallucination guarantee) + null on empty data.
 *  - select: suppression (action turn / small talk) + model-spec-vs-floor +
 *            the message→default-kind router.
 * Deterministic: fixed `now`, fixtures anchored around it. tsx-only (pure files).
 *
 * Run:  npx tsx scripts/test-echo-cards.ts
 */
import { parseCards, validateCardSpec } from '../src/services/echoCards/parse';
import { buildCard, CardSnapshot } from '../src/services/echoCards/builders';
import { selectCards, defaultCardKindForMessage } from '../src/services/echoCards/select';
import { cashFlow, monthlyEquivalent, monthEndOutlook, getRange } from '../src/utils/insights';
import { liquidBalance, debtPulse } from '../src/utils/pulseMath';
import { computePortfolio } from '../src/screens/personal/savings/savingsMath';

const NOW = new Date(2026, 6, 15, 12, 0, 0); // 15 July 2026
const jul = (d: number) => new Date(2026, 6, d, 12, 0, 0);
const jun = (d: number) => new Date(2026, 5, d, 12, 0, 0);

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}
function close(label: string, actual: number, expected: number, eps = 0.01) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= eps;
  console.log(`  ${ok ? '✓' : '✗'} ${label} (≈ ${expected})`);
  if (!ok) { console.log(`      got: ${actual}`); failures++; }
}

// ─── fixture snapshot (tsx doesn't type-check → minimal objects are fine) ──
const transactions: any[] = [
  { id: 't1', type: 'income', amount: 5000, category: 'income', date: jul(1), description: 'salary' },
  { id: 't2', type: 'expense', amount: 200, category: 'food', date: jul(3), description: 'Grab food' },
  { id: 't3', type: 'expense', amount: 150, category: 'food', date: jul(5), description: 'Grab food' },
  { id: 't4', type: 'expense', amount: 300, category: 'shopping', date: jul(6), description: 'Shopee' },
  { id: 't5', type: 'expense', amount: 100, category: 'transport', date: jul(8), description: 'Grab' },
  { id: 't6', type: 'income', amount: 5000, category: 'income', date: jun(1), description: 'salary' },
  { id: 't7', type: 'expense', amount: 1000, category: 'food', date: jun(3), description: 'groceries' },
];
const wallets: any[] = [
  { id: 'w1', name: 'Cash', type: 'cash', balance: 180, icon: 'dollar-sign', color: '#3f8f5f' },
  { id: 'w2', name: 'Maybank', type: 'bank', balance: 890.5, icon: 'home', color: '#f5c518' },
  { id: 'w3', name: 'SPayLater', type: 'credit', balance: 0, usedCredit: 120, creditLimit: 1000, icon: 'credit-card', color: '#e50914' },
];
const debts: any[] = [
  { id: 'd1', type: 'i_owe', totalAmount: 200, paidAmount: 0, status: 'active', contact: { name: 'Ali' }, description: 'lunch', mode: 'personal' },
  { id: 'd2', type: 'they_owe', totalAmount: 500, paidAmount: 100, status: 'active', contact: { name: 'Siti' }, description: 'loan', mode: 'personal' },
];
const subscriptions: any[] = [
  { id: 's1', name: 'Netflix', amount: 54.9, billingCycle: 'monthly', isActive: true, isInstallment: false, category: 'subscription', nextBillingDate: jul(20), iconName: 'tv' },
  { id: 's2', name: 'Spotify', amount: 15.9, billingCycle: 'monthly', isActive: true, isInstallment: false, category: 'subscription', nextBillingDate: jul(25) },
  { id: 's3', name: 'iCloud', amount: 2.9, billingCycle: 'monthly', isActive: true, isInstallment: false, category: 'subscription', nextBillingDate: jul(28) },
];
const goals: any[] = [
  { id: 'g1', name: 'Emergency Fund', currentAmount: 3200, targetAmount: 5000, icon: 'shield', color: '#5FA37E', contributions: [], milestones: [] },
  { id: 'g2', name: 'Japan Trip', currentAmount: 800, targetAmount: 4000, icon: 'map', color: '#8abcd2', deadline: new Date(2026, 11, 1), contributions: [], milestones: [] },
];
const savings: any[] = [
  { id: 'sv1', name: 'ASB', type: 'asb', currentValue: 12000, initialInvestment: 10000, history: [] },
  { id: 'sv2', name: 'StashAway', type: 'robo', currentValue: 2100, initialInvestment: 2000, history: [] },
];
const budgets: any[] = [
  { id: 'b1', category: 'food', allocatedAmount: 400, spentAmount: 0, period: 'monthly' },
];
const expenseCats: any[] = [
  { id: 'food', name: 'Food', icon: 'coffee', color: '#CE8A78' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: '#8abcd2' },
  { id: 'transport', name: 'Transport', icon: 'truck', color: '#5FA37E' },
  { id: 'income', name: 'Income', icon: 'briefcase', color: '#5FA37E' },
];
const SNAP: CardSnapshot = {
  now: NOW, currency: 'RM', mode: 'personal',
  transactions, wallets, debts, subscriptions, goals, savings, budgets, expenseCats,
};
const EMPTY: CardSnapshot = {
  now: NOW, currency: 'RM', mode: 'personal',
  transactions: [], wallets: [], debts: [], subscriptions: [], goals: [], savings: [], budgets: [], expenseCats: [],
};

// ─── 1. parse ────────────────────────────────────────────
console.log('parseCards / validateCardSpec');
{
  const a = parseCards('here you go [CARD]{"kind":"cash_flow"}[/CARD]');
  check('strips a well-formed block', a.cleanText === 'here you go' && a.specs.length === 1 && a.specs[0].kind === 'cash_flow');

  // The real-world case: the model drops the closing [/CARD] tag (matches
  // CARD_PROMPT's format). Must still strip + parse.
  const noClose = parseCards('Ada satu langganan.\n\n[CARD]{"kind":"subscriptions"}');
  check('tolerant of a missing [/CARD] closing tag', noClose.cleanText === 'Ada satu langganan.' && noClose.specs.length === 1 && noClose.specs[0].kind === 'subscriptions');

  const b = parseCards('[CARD]```json\n{"kind":"net_worth"}\n```[/CARD]');
  check('accepts code-fenced JSON', b.specs.length === 1 && b.specs[0].kind === 'net_worth');

  const c = parseCards('[CARD]{"kind":"not_a_real_kind"}[/CARD]x');
  check('drops an unknown kind', c.specs.length === 0 && c.cleanText === 'x');

  const d = parseCards('[CARD]{"kind":"cash_flow"}[/CARD][CARD]{"kind":"net_worth"}[/CARD]');
  check('caps to one card', d.specs.length === 1);

  const e = parseCards('tail [CARD]{"kind":"cash_flow"'); // unclosed (mid-stream)
  check('leaves an unclosed trailing block for the stream guard', e.cleanText.includes('[CARD]{') && e.specs.length === 0);

  const f = parseCards('[CARD]{"kind":"goal_detail","goalName":"japan"}[/CARD]');
  check('keeps a param', f.specs.length === 1 && f.specs[0].goalName === 'japan');

  check('validateCardSpec rejects a non-kind', validateCardSpec({ kind: 'xyz' }) === null);
  check('validateCardSpec ignores non-string params', validateCardSpec({ kind: 'goal_detail', goalName: 5 })?.goalName === undefined);
}

// ─── 2. build (anti-drift: card number === underlying calc) ──
console.log('builders — headline number equals the calc');
{
  const thisM = getRange('this_month', NOW);
  const cf = cashFlow(transactions, thisM);

  const cashCard = buildCard({ kind: 'cash_flow' }, SNAP)!;
  close('cash_flow hero == cashFlow.kept', cashCard.hero!.amount!, cf.kept);
  close('cash_flow came-in row == cashFlow.cameIn', cashCard.rows![0].amount!, cf.cameIn);
  close('cash_flow went-out row == cashFlow.wentOut', cashCard.rows![1].amount!, cf.wentOut);

  const walletCard = buildCard({ kind: 'wallet_liquid' }, SNAP)!;
  close('wallet_liquid hero == liquidBalance', walletCard.hero!.amount!, liquidBalance(wallets));
  check('wallet_liquid excludes the credit wallet', walletCard.rows!.length === 2);

  const dp = debtPulse(debts, NOW);
  const nw = buildCard({ kind: 'net_worth' }, SNAP)!;
  close('net_worth == liquid − iOwe − BNPL', nw.hero!.amount!, liquidBalance(wallets) - dp.iOweOutstanding - 120);

  const subsCard = buildCard({ kind: 'subscriptions' }, SNAP)!;
  const monthlyTotal = subscriptions.reduce((s, x) => s + monthlyEquivalent(x), 0);
  close('subscriptions hero == sum(monthlyEquivalent)', subsCard.hero!.amount!, monthlyTotal);
  check('subscriptions biggest tile is Netflix', subsCard.tile!.name === 'Netflix');
  close('subscriptions tile amount == Netflix monthly', subsCard.tile!.amount!, 54.9);

  const debtCard = buildCard({ kind: 'debt_overview' }, SNAP)!;
  close('debt_overview hero == theyOwe − iOwe', debtCard.hero!.amount!, dp.theyOweOutstanding - dp.iOweOutstanding);

  const catCard = buildCard({ kind: 'category_breakdown' }, SNAP)!;
  check('category_breakdown top category is Food (350)', catCard.rows![0].name === 'Food');
  close('category_breakdown total == month expenses', catCard.total!.amount!, cf.wentOut);

  const goalsCard = buildCard({ kind: 'goals_overview' }, SNAP)!;
  close('goals_overview hero == total saved', goalsCard.hero!.amount!, 4000);

  const outlook = monthEndOutlook(transactions, subscriptions, NOW);
  const outCard = buildCard({ kind: 'month_outlook' }, SNAP)!;
  close('month_outlook hero == projectedKept', outCard.hero!.amount!, outlook.projectedKept);

  // parametric
  close('goal_detail(japan) hero == saved', buildCard({ kind: 'goal_detail', goalName: 'japan' }, SNAP)!.hero!.amount!, 800);
  close('debt_detail(ali) hero == −outstanding', buildCard({ kind: 'debt_detail', contact: 'ali' }, SNAP)!.hero!.amount!, -200);
  close('category_detail(food) hero == food spend', buildCard({ kind: 'category_detail', category: 'food' }, SNAP)!.hero!.amount!, 350);

  // extended
  close('biggest_expenses top == RM300 Shopee', buildCard({ kind: 'biggest_expenses' }, SNAP)!.rows![0].amount!, 300);
  close('top_merchants top == Grab food 350', buildCard({ kind: 'top_merchants' }, SNAP)!.rows![0].amount!, 350);
  const bills = buildCard({ kind: 'upcoming_bills' }, SNAP)!;
  close('upcoming_bills total == 30-day sum', bills.total!.amount!, monthlyTotal);
  close('savings_portfolio hero == computePortfolio.totalCurrent', buildCard({ kind: 'savings_portfolio' }, SNAP)!.hero!.amount!, computePortfolio(savings, NOW).totalCurrent);
  const bud = buildCard({ kind: 'budget_status' }, SNAP)!;
  check('budget_status food pill ≈ 88%', bud.rows![0].pill!.text === '88%');
}

// ─── 3. null on empty data ───────────────────────────────
console.log('builders — null when there is no data');
for (const kind of ['cash_flow', 'wallet_liquid', 'debt_overview', 'subscriptions', 'goals_overview', 'category_breakdown', 'savings_portfolio', 'budget_status', 'upcoming_bills'] as const) {
  check(`${kind} → null on empty snapshot`, buildCard({ kind }, EMPTY) === null);
}
check('goal_detail with no match → null', buildCard({ kind: 'goal_detail', goalName: 'nonexistent' }, SNAP) === null);

// ─── 4. select — suppression + floor ─────────────────────
console.log('selectCards — suppression + floor');
{
  check('action turn → no card', selectCards([{ kind: 'cash_flow' }], 'log rm12 lunch', true, SNAP).length === 0);
  check('small talk → no card', selectCards([], 'hi there friend', false, SNAP).length === 0);
  check('model spec honored', selectCards([{ kind: 'wallet_liquid' }], 'anything', false, SNAP)[0]?.kind === 'wallet_liquid');
  check('floor fires on a mapped question', selectCards([], "where's my money going this month?", false, SNAP)[0]?.kind === 'category_breakdown');
  check('greeting → no floor card', selectCards([], 'hey', false, SNAP).length === 0);
}

// ─── 5. defaultCardKindForMessage router ─────────────────
console.log('defaultCardKindForMessage');
{
  const cases: [string, string | null][] = [
    ['who owes me money?', 'debt_overview'],
    ['how much do i have left?', 'wallet_liquid'],
    ['my subscriptions please', 'subscriptions'],
    ['am i over budget this month', 'budget_status'],
    ['how are my goals looking', 'goals_overview'],
    ['what are my biggest spends', 'biggest_expenses'],
    ['whats due soon', 'upcoming_bills'],
    ['how are my investments doing', 'savings_portfolio'],
    ['hi', null],
    ['ok thanks', null],
  ];
  for (const [msg, want] of cases) check(`"${msg}" → ${want}`, defaultCardKindForMessage(msg) === want);
}

console.log(failures === 0 ? '\nAll echo-card tests passed.' : `\n${failures} failure(s).`);
process.exit(failures ? 1 : 0);
