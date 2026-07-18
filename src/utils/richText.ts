/**
 * richText — the model behind the iOS-Notes-style rich editor.
 *
 * KEY IDEA: the note's plain text stays the single source of truth (it's what
 * `page.content` holds, what Echo extraction reads, and what the list preview /
 * title use). Formatting is kept SEPARATELY as offset-based metadata — so there
 * are NO markdown markers in the text, and the editor renders true WYSIWYG by
 * re-styling the exact same characters as `<Text>` children inside the TextInput.
 *
 * Because we never change the characters (only their styling), the TextInput's
 * underlying text is identical across a re-style and the cursor stays put.
 *
 * Pure + dependency-free so it can be unit-tested with tsx (see
 * scripts/test-rich-text.ts).
 */

export type InlineAttr = 'b' | 'i' | 'u' | 's'; // bold / italic / underline / strikethrough
export const INLINE_ATTRS: InlineAttr[] = ['b', 'i', 'u', 's'];

export type BlockStyle = 'title' | 'heading' | 'body';

/** Inline format over a half-open character range [start, end). One attr per mark;
 *  bold+italic over the same span is two marks. */
export interface Mark {
  start: number;
  end: number;
  attr: InlineAttr;
}

/** Per-paragraph style, anchored to the line's start offset (remapped on edit). */
export interface BlockAnchor {
  at: number;
  style: BlockStyle;
}

export interface NoteFormatting {
  marks: Mark[];
  blocks: BlockAnchor[];
}

export const EMPTY_FORMATTING: NoteFormatting = { marks: [], blocks: [] };

// ── text change diff ──────────────────────────────────────────────────────
// RN's onChangeText hands us the whole new string, not the edit. Recover the
// replaced span [start, oldEnd) → [start, newEnd) via common prefix + suffix.
export interface EditDiff { start: number; oldEnd: number; newEnd: number; }

export function diffRange(oldText: string, newText: string): EditDiff {
  const oldLen = oldText.length;
  const newLen = newText.length;
  let start = 0;
  const maxStart = Math.min(oldLen, newLen);
  while (start < maxStart && oldText[start] === newText[start]) start++;
  let oldEnd = oldLen;
  let newEnd = newLen;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, oldEnd, newEnd };
}

// Map a mark's END (or any left-gravity point) from OLD → NEW coordinates. A point
// sitting exactly at an insertion boundary stays put — so text typed right AFTER a
// bold word doesn't get pulled into it.
function remapEnd(p: number, d: EditDiff): number {
  if (p <= d.start) return p;
  if (p >= d.oldEnd) return p + (d.newEnd - d.oldEnd);
  return d.start; // pointed at a deleted char → collapse to the edit start
}
// Map a mark's START (or a block anchor) — right-gravity: a point exactly at a pure
// insertion's start moves PAST the inserted text, so typing at the START of a bold
// word (or a styled line) is NOT absorbed into it.
function remapStart(p: number, d: EditDiff): number {
  if (p === d.start && d.oldEnd === d.start && d.newEnd > d.start) return d.newEnd;
  return remapEnd(p, d);
}

// ── line helpers ──────────────────────────────────────────────────────────
export function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

export function lineStartOf(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const nl = text.lastIndexOf('\n', clamped - 1);
  return nl < 0 ? 0 : nl + 1;
}

/** [start, end) of the line at lineIndex (end excludes the trailing '\n'). */
export function lineRange(text: string, lineIndex: number): { start: number; end: number } {
  const lines = text.split('\n');
  let start = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i++) start += lines[i].length + 1;
  const end = start + (lines[lineIndex]?.length ?? 0);
  return { start, end };
}

// ── normalize ─────────────────────────────────────────────────────────────
function mergeMarks(marks: Mark[]): Mark[] {
  const out: Mark[] = [];
  for (const attr of INLINE_ATTRS) {
    const same = marks.filter((m) => m.attr === attr && m.end > m.start).sort((a, b) => a.start - b.start);
    let cur: Mark | null = null;
    for (const m of same) {
      if (cur && m.start <= cur.end) {
        cur.end = Math.max(cur.end, m.end); // overlap / adjacent → merge
      } else {
        cur = { start: m.start, end: m.end, attr };
        out.push(cur);
      }
    }
  }
  return out;
}

/** The style a line falls back to when it has no explicit anchor: line 0 reads as
 *  the note's Title, everything below as Body. */
export function defaultBlockStyle(lineStart: number): BlockStyle {
  return lineStart === 0 ? 'title' : 'body';
}

/** Snap anchors to their line start (last wins per line) and drop anchors that
 *  just restate the default — so an explicit Body on line 0, or a Heading
 *  anywhere, is kept, but a redundant Body on line 3 is not. */
export function normalizeBlocks(text: string, blocks: BlockAnchor[]): BlockAnchor[] {
  const byLineStart = new Map<number, BlockStyle>();
  for (const b of blocks) byLineStart.set(lineStartOf(text, b.at), b.style);
  const out: BlockAnchor[] = [];
  for (const [at, style] of byLineStart) {
    if (style === defaultBlockStyle(at)) continue; // redundant with the fallback
    out.push({ at, style });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function normalize(text: string, f: NoteFormatting): NoteFormatting {
  return { marks: mergeMarks(f.marks), blocks: normalizeBlocks(text, f.blocks) };
}

/** Shift all formatting through a text edit, then re-normalize against the new text. */
export function remapFormatting(f: NoteFormatting, d: EditDiff, newText: string): NoteFormatting {
  const marks = f.marks
    .map((m) => ({ start: remapStart(m.start, d), end: remapEnd(m.end, d), attr: m.attr }))
    .filter((m) => m.end > m.start);
  const blocks = f.blocks.map((b) => ({ at: remapStart(b.at, d), style: b.style }));
  return normalize(newText, { marks, blocks });
}

// ── inline attr toggle over a selection ─────────────────────────────────────
export function isRangeFullyAttr(marks: Mark[], start: number, end: number, attr: InlineAttr): boolean {
  if (end <= start) return false;
  const covered = new Array(end - start).fill(false);
  for (const m of marks) {
    if (m.attr !== attr) continue;
    for (let i = Math.max(start, m.start); i < Math.min(end, m.end); i++) covered[i - start] = true;
  }
  return covered.every(Boolean);
}

/** Toggle an inline attr over [start, end): if the whole range already has it,
 *  remove it there; otherwise add it. */
export function toggleAttr(marks: Mark[], start: number, end: number, attr: InlineAttr): Mark[] {
  if (end <= start) return marks;
  const turnOn = !isRangeFullyAttr(marks, start, end, attr);
  const result: Mark[] = [];
  for (const m of marks) {
    if (m.attr !== attr || m.end <= start || m.start >= end) {
      result.push(m); // untouched
      continue;
    }
    // subtract [start, end) from this attr-mark
    if (m.start < start) result.push({ start: m.start, end: start, attr });
    if (m.end > end) result.push({ start: end, end: m.end, attr });
  }
  if (turnOn) result.push({ start, end, attr });
  return mergeMarks(result);
}

/** Add an attr over [start,end) unconditionally (used by auto-strike on confirm). */
export function addAttr(marks: Mark[], start: number, end: number, attr: InlineAttr): Mark[] {
  if (end <= start) return marks;
  return mergeMarks([...marks, { start, end, attr }]);
}

/** Which attrs are active across the ENTIRE selection (for toolbar highlight).
 *  For a caret (start===end), reports attrs of the char just before the caret. */
export function activeAttrs(marks: Mark[], start: number, end: number): Record<InlineAttr, boolean> {
  const res = { b: false, i: false, u: false, s: false } as Record<InlineAttr, boolean>;
  if (end > start) {
    for (const attr of INLINE_ATTRS) res[attr] = isRangeFullyAttr(marks, start, end, attr);
  } else {
    const p = start - 1;
    if (p >= 0) for (const m of marks) if (m.start <= p && p < m.end) res[m.attr] = true;
  }
  return res;
}

export function setBlock(text: string, blocks: BlockAnchor[], lineStart: number, style: BlockStyle): BlockAnchor[] {
  return normalizeBlocks(text, [...blocks, { at: lineStart, style }]);
}

// ── render model ───────────────────────────────────────────────────────────
export interface RenderRun { text: string; attrs: InlineAttr[]; }
export interface RenderLine { block: BlockStyle; runs: RenderRun[]; }

function attrsAt(pos: number, marks: Mark[]): InlineAttr[] {
  const a: InlineAttr[] = [];
  for (const attr of INLINE_ATTRS) {
    if (marks.some((m) => m.attr === attr && m.start <= pos && pos < m.end)) a.push(attr);
  }
  return a;
}

function sameAttrs(a: InlineAttr[], b: InlineAttr[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Turn (text, formatting) into per-line styled runs for rendering as TextInput
 * children. `lines.map(l => l.runs.map(r => r.text).join('')).join('\n')` === text,
 * exactly — which is what keeps the cursor stable.
 *
 * Line 0 defaults to a Title block (mirrors the note's "first line is the title"
 * convention); other lines default to Body. Explicit block anchors override.
 */
export function buildRenderModel(text: string, f: NoteFormatting): RenderLine[] {
  const blocksBySnap = normalizeBlocks(text, f.blocks);
  const blockAt = (lineStart: number): BlockStyle | undefined =>
    blocksBySnap.find((b) => b.at === lineStart)?.style;

  const lines = text.split('\n');
  const out: RenderLine[] = [];
  let offset = 0;
  lines.forEach((lineText) => {
    const lineStart = offset;
    const explicit = blockAt(lineStart);
    const block: BlockStyle = explicit ?? defaultBlockStyle(lineStart);

    const runs: RenderRun[] = [];
    if (lineText.length === 0) {
      runs.push({ text: '', attrs: [] });
    } else {
      // Walk by CODE POINTS so a run boundary can never split an emoji (a UTF-16
      // surrogate pair) — slicing between the halves would render a broken glyph.
      const bounds: number[] = [];
      for (let i = 0; i < lineText.length;) {
        bounds.push(i);
        const c = lineText.charCodeAt(i);
        i += (c >= 0xd800 && c <= 0xdbff && i + 1 < lineText.length) ? 2 : 1;
      }
      bounds.push(lineText.length);
      let runStart = 0;
      let runAttrs = attrsAt(lineStart, f.marks);
      for (let k = 1; k < bounds.length; k++) {
        const pos = bounds[k];
        const atEnd = pos === lineText.length;
        const a = atEnd ? runAttrs : attrsAt(lineStart + pos, f.marks);
        if (atEnd || !sameAttrs(a, runAttrs)) {
          runs.push({ text: lineText.slice(runStart, pos), attrs: runAttrs });
          runStart = pos;
          runAttrs = a;
        }
      }
    }
    out.push({ block, runs });
    offset += lineText.length + 1; // + '\n'
  });
  return out;
}

// ── persistence (stored alongside page.content) ─────────────────────────────
export function serializeFormatting(f: NoteFormatting): NoteFormatting {
  return { marks: f.marks, blocks: f.blocks };
}

export function deserializeFormatting(raw: any): NoteFormatting {
  if (!raw || typeof raw !== 'object') return { marks: [], blocks: [] };
  const marks: Mark[] = Array.isArray(raw.marks)
    ? raw.marks
        .filter((m: any) => m && typeof m.start === 'number' && typeof m.end === 'number' && INLINE_ATTRS.includes(m.attr) && m.end > m.start)
        .map((m: any) => ({ start: m.start, end: m.end, attr: m.attr }))
    : [];
  const blocks: BlockAnchor[] = Array.isArray(raw.blocks)
    ? raw.blocks
        .filter((b: any) => b && typeof b.at === 'number' && (b.style === 'title' || b.style === 'heading' || b.style === 'body'))
        .map((b: any) => ({ at: b.at, style: b.style }))
    : [];
  return { marks, blocks };
}

export function isEmptyFormatting(f: NoteFormatting): boolean {
  return f.marks.length === 0 && f.blocks.length === 0;
}

// ── extraction → line matching (for auto-strike on Echo confirm) ─────────────
/**
 * Best-effort: find the line that produced a confirmed extraction so it can be
 * struck through. Ranked match against un-taken lines:
 *   1. amount literal + a name/description keyword  (strongest)
 *   2. amount literal only
 *   3. keyword only — for lines whose amount is COMPUTED, e.g. "ali (16-9)+6"
 *      evaluates to 13 but "13" is nowhere in the text; the name/description is
 *      the only anchor.
 */
export function findExtractionLine(
  text: string,
  opts: { amount?: number; description?: string; person?: string },
  isLineTaken: (lineIndex: number) => boolean
): number | null {
  const lines = text.split('\n');
  const amount = opts.amount && opts.amount > 0 ? opts.amount : null;
  const kw = [opts.description, opts.person]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 3);

  // Match the amount however it's written: "7.5", "7.50", "13", "13.00" — build an
  // alternation of the plain and 2-decimal forms (commas stripped from the line).
  const amountRe = amount != null ? (() => {
    const alts = new Set<string>([String(amount), amount.toFixed(2)]);
    const body = [...alts].map((a) => a.replace('.', '\\.')).join('|');
    return new RegExp(`(?:^|[^\\d.])(?:${body})(?:\\b|[^\\d.]|$)`);
  })() : null;

  let amountOnly = -1;
  let kwOnly = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isLineTaken(i)) continue;
    const lower = lines[i].toLowerCase();
    const hasAmount = amountRe ? amountRe.test(lines[i].replace(/,/g, '')) : true;
    const hasKw = kw.length > 0 && kw.some((w) => lower.includes(w));
    if (hasAmount && hasKw) return i;               // tier 1
    if (hasAmount && amountOnly < 0) amountOnly = i; // tier 2
    if (hasKw && kwOnly < 0) kwOnly = i;             // tier 3 (computed-amount lines)
  }
  if (amountOnly >= 0) return amountOnly;
  return kwOnly >= 0 ? kwOnly : null;
}

/**
 * Re-derive the strikethroughs for every confirmed extraction, idempotently.
 * Each confirmed item claims its best un-taken line and that line gets struck.
 * Running this again produces the same result — so it's safe to call on every
 * confirm AND on note re-open (catches items that couldn't be matched before,
 * e.g. a computed-amount debt line).
 */
/** Line indices whose ENTIRE text is struck through (an 's' mark covers the line). */
export function struckLineIndices(text: string, marks: Mark[]): Set<number> {
  const out = new Set<number>();
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const start = offset;
    const end = offset + lines[i].length;
    if (end > start && isRangeFullyAttr(marks, start, end, 's')) out.add(i);
    offset = end + 1;
  }
  return out;
}

/** The note text with every fully-struck (already-handled/confirmed) line blanked
 *  out, so a RE-extract only scans new/unstruck content instead of re-finding the
 *  items you've already saved. Line positions are preserved (struck → empty) so
 *  nothing else shifts. */
export function textWithoutStruckLines(text: string, marks: Mark[]): string {
  const struck = struckLineIndices(text, marks);
  if (struck.size === 0) return text;
  return text.split('\n').map((l, i) => (struck.has(i) ? '' : l)).join('\n');
}

export function reconcileConfirmedStrikes(
  text: string,
  formatting: NoteFormatting,
  confirmed: { amount?: number; description?: string; person?: string }[]
): NoteFormatting {
  let marks = formatting.marks;
  const taken = new Set<number>();
  for (const c of confirmed) {
    const li = findExtractionLine(text, c, (i) => taken.has(i));
    if (li == null) continue;
    taken.add(li);
    const { start, end } = lineRange(text, li);
    if (end > start) marks = addAttr(marks, start, end, 's');
  }
  return marks === formatting.marks ? formatting : { ...formatting, marks };
}
