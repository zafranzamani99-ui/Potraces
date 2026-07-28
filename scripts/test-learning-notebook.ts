/**
 * Pure-logic tests for the Echo notebook (learningPure). Run: npm run test:learning
 *
 * Covers the five notebook upgrades:
 *  1. merchant keyword normalization (chain branches share a rule)
 *  2. word-boundary matching + min keyword length (no "may" inside "maybe")
 *  3. trust threshold (count ≥ 2) — visible as Dah kenal vs Tengah belajar
 *  4. self-healing (overriding your own rule demotes, then forgets it)
 *  5. conflict head start (a changed habit wins in days, not months)
 *  plus: manual add (instantly trusted), person-alias latest-wins, v0→v1 migration.
 */
import {
  normalizeKeyword,
  matchesKeyword,
  matchesFirstWord,
  applyLearnCategory,
  applyLearnWallet,
  applyLearnPersonAlias,
  suggestFrom,
  migrateLearningV0toV1,
  TRUST_COUNT,
  applyAddMemory,
  renderMemoryHints,
  extractMemories,
  MEMORY_TEXT_MAX,
  MEMORY_PROMPT_LINES,
  type EchoMemory,
} from '../src/store/learningPure';

const failures: string[] = [];
let passed = 0;
const check = (n: string, c: boolean) => { c ? passed++ : failures.push(n); };

// ── 1. Normalization ──────────────────────────────────────────────
check('normalize strips punctuation + case', normalizeKeyword('MR D.I.Y.', true) === 'mr diy');
check('vendor shortened to first 2 words', normalizeKeyword('99 Speedmart Bukit Bintang', true) === '99 speedmart');
check('short vendor kept whole', normalizeKeyword('Grab', true) === 'grab');

// ── 2. Word-boundary matching ─────────────────────────────────────
check('whole phrase matches', matchesKeyword('belanja di 99 speedmart gombak semalam', '99 speedmart'));
check('substring does NOT match (may inside maybe)', !matchesKeyword('maybe next week', 'may'));
check('too-short keyword never matches', !matchesKeyword('mr diy run', 'mr'));
check('first-word fallback matches distinctive name', matchesFirstWord('shell subang jaya', 'shell jalan'));
check('first-word fallback skips stopwords', !matchesFirstWord('restoran baru sedap', 'restoran ali'));

// ── 3. Trust threshold ────────────────────────────────────────────
let pats = applyLearnCategory([], 'MR D.I.Y.', 'household');
check('first correction is count 1 (tengah belajar)', pats[0].count === 1);
check('count 1 is NOT suggested', suggestFrom(pats, 'mr diy') === null);
pats = applyLearnCategory(pats, 'MR D.I.Y.', 'household');
check('second correction reaches trust', pats[0].count === TRUST_COUNT);
check('trusted rule is suggested', suggestFrom(pats, 'mr diy')?.category === 'household');
check('branch generalizes via full-keyword match', suggestFrom(pats, 'MR DIY Gombak branch')?.category === 'household');

// ── 4 + 5. Conflict: head start, demote, self-heal ────────────────
let w = applyLearnWallet([], 'astro', 'Maybank');
w = applyLearnWallet(w, 'astro', 'Maybank');
w = applyLearnWallet(w, 'astro', 'Maybank');
check('old wallet rule strong (count 3)', w[0].count === 3);
w = applyLearnWallet(w, 'astro', 'TnG'); // user switched habit
check('conflict: new wallet gets head start', w.find((x) => x.wallet === 'TnG')?.count === 3);
check('conflict: old wallet demoted by 2', w.find((x) => x.wallet === 'Maybank')?.count === 1);
check('suggestion flips to new habit', suggestFrom(w, 'astro bil')?.wallet === 'TnG');
w = applyLearnWallet(w, 'astro', 'TnG'); // confirms the switch
check('second override forgets the old rule', !w.some((x) => x.wallet === 'Maybank'));

// ── Manual add (Notebook screen custom rule) ──────────────────────
const manual = applyLearnCategory([], 'shell', 'transport', TRUST_COUNT);
check('manual add is instantly trusted', manual[0].count === TRUST_COUNT);
check('manual add suggests immediately', suggestFrom(manual, 'shell kajang')?.category === 'transport');

// ── Person aliases: latest preferred name wins ────────────────────
let aliases = applyLearnPersonAlias([], 'kak long', 'Siti');
aliases = applyLearnPersonAlias(aliases, 'kak long', 'Aisyah');
check('alias re-teach replaces preferred', aliases.find((a) => a.raw === 'kak long')?.preferred === 'Aisyah');
check('alias identical to raw is rejected', applyLearnPersonAlias([], 'siti', 'Siti').length === 0);

// ── Migration v0 → v1 ─────────────────────────────────────────────
const migrated = migrateLearningV0toV1({
  categoryPatterns: [
    { keyword: 'MR D.I.Y.', category: 'household', count: 2 },
    { keyword: 'mr diy', category: 'household', count: 1 }, // dupe after normalize → merge
    { keyword: '99 Speedmart Bukit Bintang', category: 'groceries', count: 4 },
    { keyword: 'ab', category: 'other', count: 9 }, // too short → dropped
  ],
  walletPreferences: [{ keyword: 'Astro, Unifi', wallet: 'Maybank', count: 3 }],
});
check('migrate merges normalized dupes', migrated.categoryPatterns?.find((p) => p.keyword === 'mr diy')?.count === 3);
check('migrate shortens vendor', migrated.categoryPatterns?.some((p) => p.keyword === '99 speedmart' && p.count === 4) === true);
check('migrate drops too-short keywords', !migrated.categoryPatterns?.some((p) => p.keyword === 'ab'));
check('migrate normalizes wallets', migrated.walletPreferences?.[0]?.keyword === 'astro unifi');
check('migrated rules still suggest', suggestFrom(migrated.categoryPatterns || [], 'beli barang mr diy semalam')?.category === 'household');

// ── Provenance ("sebab you ajar") — the winning rule carries keyword + count ──
const prov = applyLearnCategory([], 'mamak', 'food', 4);
const provHit = suggestFrom(prov, 'mamak tom yam campur');
check('suggestion carries keyword + count', provHit?.keyword === 'mamak' && provHit?.count === 4);

// ── Echo's memory of you (applyAddMemory / renderMemoryHints) ──
let mem = applyAddMemory([], { id: 'a', kind: 'goal', text: 'saving for house', source: 'you', now: 1 }, 3);
check('memory added', mem.length === 1 && mem[0].text === 'saving for house');
mem = applyAddMemory(mem, { id: 'b', kind: 'goal', text: 'Saving  for house', source: 'echo', now: 2 }, 3);
check('memory dedups within kind (bumps updatedAt, no dup)', mem.length === 1 && mem[0].updatedAt === 2);
mem = applyAddMemory(mem, { id: 'c', kind: 'bill', text: 'pays ptptn', source: 'you', now: 3 }, 3);
check('same text, different kind = new memory', mem.length === 2);

const clamped = applyAddMemory([], { id: 'd', kind: 'fact', text: 'x'.repeat(MEMORY_TEXT_MAX + 50), source: 'you', now: 1 }, 3);
check('memory text clamps to MEMORY_TEXT_MAX', clamped[0].text.length === MEMORY_TEXT_MAX);

let capped: EchoMemory[] = [];
capped = applyAddMemory(capped, { id: '1', kind: 'goal', text: 'one', source: 'you', now: 1 }, 2);
capped = applyAddMemory(capped, { id: '2', kind: 'goal', text: 'two', source: 'you', now: 2 }, 2);
capped = applyAddMemory(capped, { id: '3', kind: 'goal', text: 'three', source: 'you', now: 3 }, 2);
check('cap evicts the oldest UNPINNED', capped.length === 2 && !capped.some((m) => m.id === '1'));

let pinnedList: EchoMemory[] = [{ id: 'p', kind: 'goal', text: 'pinned', source: 'you', createdAt: 1, updatedAt: 1, pinned: true }];
pinnedList = applyAddMemory(pinnedList, { id: 'q', kind: 'goal', text: 'newer', source: 'you', now: 5 }, 1);
check('pinned memory survives an over-cap add', pinnedList.some((m) => m.id === 'p'));

const many: EchoMemory[] = [];
for (let i = 0; i < MEMORY_PROMPT_LINES + 5; i++) many.push({ id: `m${i}`, kind: 'fact', text: `fact ${i}`, source: 'you', createdAt: i, updatedAt: i });
many[0].pinned = true; // oldest, but pinned → must still appear
const hints = renderMemoryHints(many);
check('memory hints cap at MEMORY_PROMPT_LINES', hints.split('\n').filter((l) => l.startsWith('- [')).length === MEMORY_PROMPT_LINES);
check('pinned memory appears in hints despite being oldest', hints.includes('fact 0'));

// ── extractMemories: [MEMORY] parsing must tolerate a MISSING closing tag ──
// (the exact bug — the model emitted [MEMORY]{...} with no [/MEMORY], so the tag
//  leaked into the bubble AND nothing was captured.)
const noClose = extractMemories('Got it — noted.\n\n[MEMORY]\n{"kind":"fact","text":"freelancer, supports parents"}');
check('memory captured without a closing tag', noClose.memories.length === 1 && noClose.memories[0].text === 'freelancer, supports parents');
check('tag stripped from the shown text', !noClose.cleanText.includes('[MEMORY]') && noClose.cleanText.startsWith('Got it'));
const withClose = extractMemories('ok [MEMORY]{"kind":"goal","text":"save for house"}[/MEMORY]');
check('memory captured WITH a closing tag', withClose.memories.length === 1 && withClose.memories[0].kind === 'goal' && withClose.cleanText === 'ok');
check('malformed memory json is dropped (no crash)', extractMemories('hi [MEMORY]{not json').memories.length === 0);
check('invalid kind is rejected', extractMemories('[MEMORY]{"kind":"nonsense","text":"x"}').memories.length === 0);
check('at most 2 memories per reply', extractMemories('[MEMORY]{"kind":"fact","text":"a"} [MEMORY]{"kind":"fact","text":"b"} [MEMORY]{"kind":"fact","text":"c"}').memories.length === 2);
check('no memory tag → text untouched', extractMemories('just a normal reply').cleanText === 'just a normal reply');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`learning-notebook OK (${passed} checks)`);
