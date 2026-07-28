/**
 * test-note-extraction — local note parser (manglishParser.parseStructuredLines).
 *
 * Guards the mixed expense/debt note parsing used by the Notes "Echo" extractor
 * when the AI path is unavailable. Covers the shorthand shapes users actually
 * write (parenthetical amounts, arithmetic, currency prefixes, dash separators)
 * AND the existing debt-list formats, so the rewrite doesn't regress them.
 *
 * Run: npx tsx scripts/test-note-extraction.ts
 */

import { parseStructuredLines, detectSavingsVehicle } from '../src/services/manglishParser';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

type Line = NonNullable<ReturnType<typeof parseStructuredLines>>[number];

function byLabel(rows: Line[], label: string): Line | undefined {
  return rows.find((r) => r.label.toLowerCase() === label.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1) Mixed note: food expense list + a debt (the reported case)');
{
  const note = `Makan harini

kari (18)
ayam -17
nasi lemak RM8
kuih -rm17

hutang
ali (16-9)+ 6(dinner)`;
  const rows = parseStructuredLines(note) || [];
  check('found 5 items', rows.length === 5, `got ${rows.length}: ${JSON.stringify(rows.map((r) => `${r.label}:${r.amount}`))}`);

  const expenses = rows.filter((r) => r.kind === 'expense');
  const debts = rows.filter((r) => r.kind === 'debt');
  check('4 expenses', expenses.length === 4, `got ${expenses.length}`);
  check('1 debt', debts.length === 1, `got ${debts.length}`);

  check('kari = 18 (paren amount)', byLabel(rows, 'kari')?.amount === 18, JSON.stringify(byLabel(rows, 'kari')));
  check('ayam = 17 (dash)', byLabel(rows, 'ayam')?.amount === 17);
  check('nasi lemak = 8 (RM prefix, no dash)', byLabel(rows, 'nasi lemak')?.amount === 8, JSON.stringify(byLabel(rows, 'nasi lemak')));
  check('kuih = 17 (-rm prefix)', byLabel(rows, 'kuih')?.amount === 17, JSON.stringify(byLabel(rows, 'kuih')));

  check('all food expenses categorized food', expenses.every((e) => e.category === 'food'), JSON.stringify(expenses.map((e) => e.category)));
  check('no expense is mislabeled a person', expenses.every((e) => e.person === null));
  check('title "Makan harini" is NOT an item', !rows.some((r) => /makan harini/i.test(r.label)));

  const ali = byLabel(rows, 'ali');
  check('ali is a debt', ali?.kind === 'debt');
  check('ali amount = 13 (16-9+6)', ali?.amount === 13, JSON.stringify(ali));
  check('ali note = dinner', ali?.note === 'dinner', JSON.stringify(ali));
  check('ali person = ali', ali?.person?.toLowerCase() === 'ali');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2) Existing debt list with "mereka hutang" header (they owe me)');
{
  const rows = parseStructuredLines('mereka hutang\n100-faris\n50-ali') || [];
  check('2 debt items', rows.length === 2 && rows.every((r) => r.kind === 'debt'));
  check('faris owes 100, direction they_owe', byLabel(rows, 'faris')?.amount === 100 && byLabel(rows, 'faris')?.direction === 'they_owe');
  check('ali owes 50, direction they_owe', byLabel(rows, 'ali')?.amount === 50 && byLabel(rows, 'ali')?.direction === 'they_owe');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3) Existing "aku hutang" header + parenthetical note');
{
  const rows = parseStructuredLines('aku hutang\n300-mak(duit raya)') || [];
  check('1 debt item', rows.length === 1 && rows[0].kind === 'debt');
  check('person mak, amount 300, i_owe', rows[0].person?.toLowerCase() === 'mak' && rows[0].amount === 300 && rows[0].direction === 'i_owe');
  check('note = duit raya', rows[0].note === 'duit raya', JSON.stringify(rows[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4) Existing person-scoped block (bare single name → debts)');
{
  const rows = parseStructuredLines('mohsin\nair-3\npetrol-7.5\ntol-5.8') || [];
  check('3 debt items to mohsin', rows.length === 3 && rows.every((r) => r.kind === 'debt' && r.person?.toLowerCase() === 'mohsin'), JSON.stringify(rows));
  check('amounts 3 / 7.5 / 5.8', [3, 7.5, 5.8].every((a) => rows.some((r) => r.amount === a)));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5) Two person blocks in a row');
{
  const rows = parseStructuredLines('mohsin\nair-3\nmael\nflavor-23') || [];
  check('air → mohsin', rows.find((r) => /air/.test(r.note || ''))?.person?.toLowerCase() === 'mohsin' || byLabel(rows, 'air')?.person?.toLowerCase() === 'mohsin', JSON.stringify(rows));
  const flavor = rows.find((r) => /flavor/.test(r.label) || /flavor/.test(r.note || ''));
  check('flavor → mael, 23', flavor?.person?.toLowerCase() === 'mael' && flavor?.amount === 23, JSON.stringify(flavor));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6) Plain expense list, no title, no debt context → expenses');
{
  const rows = parseStructuredLines('lunch 12\ngrab -8\nkopi (5)') || [];
  check('3 expenses (no debt)', rows.length === 3 && rows.every((r) => r.kind === 'expense'), JSON.stringify(rows));
  check('grab = 8', byLabel(rows, 'grab')?.amount === 8);
  check('kopi = 5 (paren)', byLabel(rows, 'kopi')?.amount === 5);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7b) Two directional debt titles: "aku hutang" (i owe) + "orang hutang" (they owe me)');
{
  const note = `Aku hutang
Ali- 7

Orang Hutang
Rahman -8`;
  const rows = parseStructuredLines(note) || [];
  check('2 debt items', rows.length === 2 && rows.every((r) => r.kind === 'debt'), JSON.stringify(rows));
  const ali = byLabel(rows, 'Ali') || rows.find((r) => r.person?.toLowerCase() === 'ali');
  const rahman = byLabel(rows, 'Rahman') || rows.find((r) => r.person?.toLowerCase() === 'rahman');
  check('Ali RM7, i_owe (you owe Ali)', ali?.amount === 7 && ali?.direction === 'i_owe' && ali?.person?.toLowerCase() === 'ali', JSON.stringify(ali));
  check('Rahman RM8, they_owe (Rahman owes you)', rahman?.amount === 8 && rahman?.direction === 'they_owe' && rahman?.person?.toLowerCase() === 'rahman', JSON.stringify(rahman));
  check('"Orang Hutang" title is NOT a person', !rows.some((r) => /orang/i.test(r.person || '')), JSON.stringify(rows.map((r) => r.person)));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6c) Category header + bare-amount list ("makan\\n-7\\n-8\\n-8\\n-9")');
{
  const rows = parseStructuredLines('makan\n-7\n-8\n-8\n-9') || [];
  check('4 expenses', rows.length === 4 && rows.every((r) => r.kind === 'expense'), JSON.stringify(rows));
  check('amounts 7/8/8/9', JSON.stringify(rows.map((r) => r.amount)) === JSON.stringify([7, 8, 8, 9]), JSON.stringify(rows.map((r) => r.amount)));
  check('all categorized food', rows.every((r) => r.category === 'food'));
  check('two RM8 kept (not deduped)', rows.filter((r) => r.amount === 8).length === 2);
}

console.log('\n6d) A spend header ENDS a debt section (aku hutang … makan … -7)');
{
  const note = 'aku hutang\nahmad -17\nhalimah -7\n\nmakan\n-7\n-8';
  const rows = parseStructuredLines(note) || [];
  const debts = rows.filter((r) => r.kind === 'debt');
  const exps = rows.filter((r) => r.kind === 'expense');
  check('ahmad + halimah are debts', debts.length === 2 && debts.every((d) => d.direction === 'i_owe'), JSON.stringify(debts.map((d) => d.person)));
  check('the -7/-8 under "makan" are expenses (not debts)', exps.length === 2 && exps.every((e) => e.category === 'food'), JSON.stringify(exps));
}

console.log('\n6e) A bare single name is still a person block (not a category)');
{
  const rows = parseStructuredLines('mohsin\nair-3\npetrol-7.5') || [];
  check('mohsin block → 2 debts to mohsin', rows.length === 2 && rows.every((r) => r.kind === 'debt' && r.person?.toLowerCase() === 'mohsin'), JSON.stringify(rows));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7) Pure math / checkmark lines are skipped');
{
  const rows = parseStructuredLines('110+20-3-7.5 = 76.7\nayam -17 ✅\nnasi 8') || [];
  check('math line skipped, checkmark skipped → only nasi', rows.length === 1 && byLabel(rows, 'nasi')?.amount === 8, JSON.stringify(rows));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n8) NAMED-person debt header scopes the whole block ("nabil hutang aku")');
{
  // The reported bug: "awe- 28.5" under a "<name> hutang aku" header was parsed as
  // person=awe instead of nabil. Every line here belongs to nabil (they owe me).
  const note = 'nabil hutang aku\nawe- 28.5\nnasi pataya lps badminton 14.5\nserambi johor - 8.50';
  const rows = parseStructuredLines(note) || [];
  check('3 debt items', rows.length === 3 && rows.every((r) => r.kind === 'debt'), JSON.stringify(rows.map((r) => `${r.label}:${r.amount}`)));
  check('ALL person = nabil (awe is a description, not a person)', rows.every((r) => r.person?.toLowerCase() === 'nabil'), JSON.stringify(rows.map((r) => r.person)));
  check('all they_owe (nabil owes me)', rows.every((r) => r.direction === 'they_owe'), JSON.stringify(rows.map((r) => r.direction)));
  check('amounts 28.5 / 14.5 / 8.5', rows.map((r) => r.amount).join(',') === '28.5,14.5,8.5', JSON.stringify(rows.map((r) => r.amount)));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n8b) NAMED "aku hutang <name>" → i_owe that person; generics still per-line');
{
  const named = parseStructuredLines('aku hutang nabil\nkopi 5\nnasi 8') || [];
  check('named i_owe → both under nabil', named.length === 2 && named.every((r) => r.person?.toLowerCase() === 'nabil' && r.direction === 'i_owe'), JSON.stringify(named.map((r) => `${r.person}:${r.direction}`)));
  const generic = parseStructuredLines('mereka hutang\n100-faris\n50-ali') || [];
  check('generic header still names a person PER LINE', generic.length === 2 && byLabel(generic, 'faris')?.person?.toLowerCase() === 'faris' && byLabel(generic, 'ali')?.person?.toLowerCase() === 'ali', JSON.stringify(generic.map((r) => r.person)));
}

// ── detectSavingsVehicle: vehicle → savings account, purpose → goal (null) ──
{
  // Named vehicles → their account type
  check('asb → asb', detectSavingsVehicle('topup asb 500') === 'asb');
  check('versa → robo_crypto', detectSavingsVehicle('masuk versa 200') === 'robo_crypto');
  check('wise → robo_crypto', detectSavingsVehicle('save in wise') === 'robo_crypto');
  check('crypto → robo_crypto', detectSavingsVehicle('beli crypto 1000') === 'robo_crypto');
  check('tabung haji → tabung_haji', detectSavingsVehicle('tabung haji 300') === 'tabung_haji');
  check('emas → gold', detectSavingsVehicle('simpan emas') === 'gold');
  // "save FOR a purpose" is NOT a vehicle → null → becomes a GOAL
  check('save for house → null (goal)', detectSavingsVehicle('save 5000 for depo rumah') === null);
  check('nak simpan untuk kahwin → null (goal)', detectSavingsVehicle('nak simpan untuk kahwin') === null);
  check('emergency fund → null (goal)', detectSavingsVehicle('saving for emergency fund') === null);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
