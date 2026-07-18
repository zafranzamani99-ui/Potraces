/**
 * test-rich-text — the rich-notes formatting model (src/utils/richText.ts).
 *
 * The editor keeps plain text as the source of truth and formatting as
 * offset-based metadata; the risky parts are (1) the onChangeText diff, (2)
 * remapping marks/blocks through an edit, (3) toggling an attr over a selection,
 * (4) the render model reconstructing the EXACT text. All covered here.
 *
 * Run: npx tsx scripts/test-rich-text.ts
 */
import {
  diffRange, remapFormatting, toggleAttr, addAttr, isRangeFullyAttr, activeAttrs,
  buildRenderModel, setBlock, lineRange, findExtractionLine, reconcileConfirmedStrikes,
  struckLineIndices, textWithoutStruckLines,
  deserializeFormatting, type NoteFormatting, type Mark,
} from '../src/utils/richText';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const renderText = (text: string, f: NoteFormatting) =>
  buildRenderModel(text, f).map((l) => l.runs.map((r) => r.text).join('')).join('\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1) diffRange recovers the edited span');
{
  const d1 = diffRange('hello world', 'hello brave world');
  check('insertion span', d1.start === 6 && d1.oldEnd === 6 && d1.newEnd === 12, JSON.stringify(d1));
  const d2 = diffRange('hello world', 'hello');
  check('deletion span', d2.start === 5 && d2.oldEnd === 11 && d2.newEnd === 5, JSON.stringify(d2));
  const d3 = diffRange('abc', 'aXc');
  check('replace one char', d3.start === 1 && d3.oldEnd === 2 && d3.newEnd === 2, JSON.stringify(d3));
  const d4 = diffRange('abc', 'abc');
  check('no change → empty span at end', d4.start === 3 && d4.oldEnd === 3 && d4.newEnd === 3, JSON.stringify(d4));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2) render model reconstructs text EXACTLY (cursor-safety invariant)');
{
  for (const t of ['', 'hello', 'a\nb\nc', 'line1\n\nline3', 'trailing\n', '\nleading']) {
    const f: NoteFormatting = { marks: [{ start: 0, end: Math.min(2, t.length), attr: 'b' }], blocks: [] };
    check(`exact for ${JSON.stringify(t)}`, renderText(t, f) === t, JSON.stringify(renderText(t, f)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3) toggle bold on a selection, then off');
{
  const text = 'ayam nasi';
  let f: NoteFormatting = { marks: [], blocks: [] };
  f.marks = toggleAttr(f.marks, 0, 4, 'b'); // bold "ayam"
  check('ayam is bold', isRangeFullyAttr(f.marks, 0, 4, 'b'));
  check('nasi is not bold', !isRangeFullyAttr(f.marks, 5, 9, 'b'));
  const model = buildRenderModel(text, f);
  const run0 = model[0].runs[0];
  check('first run = "ayam" bold', run0.text === 'ayam' && run0.attrs.includes('b'), JSON.stringify(run0));
  f.marks = toggleAttr(f.marks, 0, 4, 'b'); // toggle off
  check('bold removed', f.marks.length === 0, JSON.stringify(f.marks));
}

console.log('\n3b) partial toggle turns the whole selection on (not off)');
{
  let marks: Mark[] = toggleAttr([], 0, 2, 'b'); // "ay" bold
  marks = toggleAttr(marks, 0, 4, 'b');          // select "ayam" → should become fully bold
  check('whole "ayam" bold', isRangeFullyAttr(marks, 0, 4, 'b'), JSON.stringify(marks));
}

console.log('\n3c) overlapping different attrs coexist');
{
  let marks: Mark[] = toggleAttr([], 0, 4, 'b');
  marks = toggleAttr(marks, 2, 6, 'i');
  const at3 = activeAttrs(marks, 3, 3); // caret after index 2 → char 2 has b+i
  check('char 2 is bold+italic', at3.b && at3.i, JSON.stringify(at3));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4) marks follow the text through edits (remap)');
{
  const oldText = 'ayam nasi lemak';
  let f: NoteFormatting = { marks: toggleAttr([], 10, 15, 'b'), blocks: [] }; // bold "lemak"
  // insert "goreng " before "lemak": at offset 10
  const newText = 'ayam nasi goreng lemak';
  const d = diffRange(oldText, newText);
  f = remapFormatting(f, d, newText);
  check('bold moved to new "lemak" position', isRangeFullyAttr(f.marks, 17, 22, 'b'), JSON.stringify(f.marks));
  check('render still exact', renderText(newText, f) === newText);
}

console.log('\n4b) typing INSIDE a bold word extends the bold');
{
  const oldText = 'ayam';
  let f: NoteFormatting = { marks: toggleAttr([], 0, 4, 'b'), blocks: [] };
  const newText = 'ayaXm'; // insert X at index 3 (inside)
  f = remapFormatting(f, diffRange(oldText, newText), newText);
  check('all 5 chars bold', isRangeFullyAttr(f.marks, 0, 5, 'b'), JSON.stringify(f.marks));
}

console.log('\n4c) deleting a bold word drops its mark');
{
  const oldText = 'ayam nasi';
  let f: NoteFormatting = { marks: toggleAttr([], 0, 4, 'b'), blocks: [] };
  const newText = ' nasi'; // deleted "ayam"
  f = remapFormatting(f, diffRange(oldText, newText), newText);
  check('bold mark gone', f.marks.length === 0, JSON.stringify(f.marks));
  check('render exact', renderText(newText, f) === newText);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5) block styles (title/heading/body) per line + default title on line 0');
{
  const text = 'Groceries\nmilk\neggs';
  let f: NoteFormatting = { marks: [], blocks: [] };
  const model0 = buildRenderModel(text, f);
  check('line 0 defaults to title', model0[0].block === 'title', model0[0].block);
  check('line 1 defaults to body', model0[1].block === 'body', model0[1].block);
  // make line 1 a heading (its start offset = 10)
  f.blocks = setBlock(text, f.blocks, 10, 'heading');
  const model1 = buildRenderModel(text, f);
  check('line 1 now heading', model1[1].block === 'heading', model1[1].block);
  // blocks survive an edit on an earlier line
  const oldText = text, newText = 'Groceries list\nmilk\neggs';
  f = remapFormatting(f, diffRange(oldText, newText), newText);
  const model2 = buildRenderModel(newText, f);
  check('heading followed the shifted line', model2[1].block === 'heading', JSON.stringify(f.blocks));
}

console.log('\n5b) line 0 can be overridden to Body (default Title is not forced)');
{
  const text = 'not a title\nmore';
  const f: NoteFormatting = { marks: [], blocks: setBlock(text, [], 0, 'body') };
  check('explicit body on line 0 kept', f.blocks.length === 1 && f.blocks[0].style === 'body', JSON.stringify(f.blocks));
  check('line 0 renders as body', buildRenderModel(text, f)[0].block === 'body');
  // redundant body on line 1 is pruned (default is already body)
  const f2: NoteFormatting = { marks: [], blocks: setBlock(text, [], 12, 'body') };
  check('redundant body on line 1 pruned', f2.blocks.length === 0, JSON.stringify(f2.blocks));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6) auto-strike: match an extraction to its line, strike the whole line');
{
  const text = 'Makan harini\nkari 18\nayam -17\nnasi lemak RM8';
  const struck = new Set<number>();
  const li = findExtractionLine(text, { amount: 17, description: 'ayam' }, (i) => struck.has(i));
  check('ayam RM17 → line 2', li === 2, `got ${li}`);
  const { start, end } = lineRange(text, li!);
  let marks = addAttr([], start, end, 's');
  check('whole "ayam -17" struck', isRangeFullyAttr(marks, start, end, 's'), JSON.stringify(marks));
  struck.add(li!);
  // a second confirm for amount 8 skips the struck line and finds nasi lemak (line 3)
  const li2 = findExtractionLine(text, { amount: 8, description: 'nasi lemak' }, (i) => struck.has(i));
  check('nasi lemak RM8 → line 3', li2 === 3, `got ${li2}`);
  check('title line is never matched', li !== 0 && li2 !== 0);
}

console.log('\n6b) computed-amount debt line strikes via name/description (the Ali bug)');
{
  const text = 'hutang\nali (16-9)+ 6(dinner)\naku hutang\nahmad -17';
  // amount 13 is NOT written in the line — only "ali" / "dinner" are.
  const li = findExtractionLine(text, { amount: 13, description: 'dinner', person: 'ali' }, () => false);
  check('ali line matched by keyword (was skipped before)', li === 1, `got ${li}`);
  const f = reconcileConfirmedStrikes(text, { marks: [], blocks: [] }, [
    { amount: 13, description: 'dinner', person: 'ali' },
    { amount: 17, description: 'debt', person: 'ahmad' },
  ]);
  const aliR = lineRange(text, 1), ahmadR = lineRange(text, 3);
  check('ali line struck', isRangeFullyAttr(f.marks, aliR.start, aliR.end, 's'), JSON.stringify(f.marks));
  check('ahmad line struck too', isRangeFullyAttr(f.marks, ahmadR.start, ahmadR.end, 's'));
  // idempotent: running again yields the same struck lines
  const f2 = reconcileConfirmedStrikes(text, f, [
    { amount: 13, description: 'dinner', person: 'ali' },
    { amount: 17, description: 'debt', person: 'ahmad' },
  ]);
  check('reconcile is idempotent', JSON.stringify(f2.marks) === JSON.stringify(f.marks));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n8) boundary gravity — text typed at the START of a bold word is NOT absorbed');
{
  const oldText = 'ayam';
  let f: NoteFormatting = { marks: toggleAttr([], 0, 4, 'b'), blocks: [] }; // "ayam" bold
  const newText = 'Xayam'; // insert X at index 0 (the mark's start)
  f = remapFormatting(f, diffRange(oldText, newText), newText);
  check('X is NOT bold', !isRangeFullyAttr(f.marks, 0, 1, 'b'), JSON.stringify(f.marks));
  check('"ayam" is still bold', isRangeFullyAttr(f.marks, 1, 5, 'b'));
  check('render exact', renderText(newText, f) === newText);
}

console.log('\n8b) Enter at a styled line start pushes the style onto the content, not the blank line');
{
  const oldText = 'Heading\nbody';
  let f: NoteFormatting = { marks: [], blocks: setBlock(oldText, [], 0, 'heading') }; // line 0 = heading
  const newText = '\nHeading\nbody'; // press Enter at the very start (insert \n at 0)
  f = remapFormatting(f, diffRange(oldText, newText), newText);
  const model = buildRenderModel(newText, f);
  check('new blank line 0 is default (not heading)', model[0].block !== 'heading', model[0].block);
  check('"Heading" moved to line 1 and kept heading', model[1].block === 'heading', JSON.stringify(f.blocks));
}

console.log('\n9) emoji (surrogate pair) — marks + render stay intact, no split');
{
  const text = 'pay 🍜 lunch'; // 🍜 is a surrogate pair (2 UTF-16 units)
  const emojiStart = text.indexOf('🍜');
  const f: NoteFormatting = { marks: toggleAttr([], 0, emojiStart + 2, 'b'), blocks: [] }; // bold through the emoji
  check('render reconstructs text exactly (emoji intact)', renderText(text, f) === text, JSON.stringify(renderText(text, f)));
  const runs = buildRenderModel(text, f)[0].runs;
  check('no run splits the emoji', runs.every((r) => !/[\uD800-\uDBFF]$/.test(r.text) && !/^[\uDC00-\uDFFF]/.test(r.text)), JSON.stringify(runs.map((r) => r.text)));
  // typing after the emoji shouldn't corrupt offsets
  const nt = 'pay 🍜🍕 lunch';
  const f2 = remapFormatting(f, diffRange(text, nt), nt);
  check('render exact after inserting a 2nd emoji', renderText(nt, f2) === nt);
}

console.log('\n9b) decimal + comma amounts strike-match (7.5 / 1,250)');
{
  const text = 'lunch 7.5\nrent 1,250';
  const li = findExtractionLine(text, { amount: 7.5, description: 'lunch' }, () => false);
  check('7.5 line matched (was missed by toFixed(2))', li === 0, `got ${li}`);
  const li2 = findExtractionLine(text, { amount: 1250, description: 'rent' }, () => false);
  check('comma-grouped 1,250 matched', li2 === 1, `got ${li2}`);
}

console.log('\n10) re-extract skips struck (already-saved) lines');
{
  // 5 lines; strike lines 1 and 3 (the "saved" ones).
  const text = 'title\nkari 18\nmilk\nayam 17\nnew stuff';
  let marks: Mark[] = [];
  const l1 = lineRange(text, 1), l3 = lineRange(text, 3);
  marks = addAttr(marks, l1.start, l1.end, 's');
  marks = addAttr(marks, l3.start, l3.end, 's');
  const struck = struckLineIndices(text, marks);
  check('struck lines = {1,3}', struck.has(1) && struck.has(3) && struck.size === 2, [...struck].join(','));
  const stripped = textWithoutStruckLines(text, marks);
  check('struck lines blanked, others kept', stripped === 'title\n\nmilk\n\nnew stuff', JSON.stringify(stripped));
  check('no strikes → text unchanged', textWithoutStruckLines(text, []) === text);
}

console.log('\n7) deserialize tolerates junk / drops invalid');
{
  const f = deserializeFormatting({ marks: [{ start: 0, end: 3, attr: 'b' }, { start: 5, end: 2, attr: 'b' }, { start: 0, end: 1, attr: 'zzz' }], blocks: [{ at: 0, style: 'title' }, { at: 3, style: 'bogus' }] });
  check('kept 1 valid mark', f.marks.length === 1 && f.marks[0].attr === 'b', JSON.stringify(f.marks));
  check('kept 1 valid block', f.blocks.length === 1 && f.blocks[0].style === 'title', JSON.stringify(f.blocks));
}

console.log(`\n${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
