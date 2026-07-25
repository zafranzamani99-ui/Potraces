/**
 * Minimal, pure-JS PDF text extraction for DIGITALLY-GENERATED invoices/receipts
 * (Stripe-style HTML→PDF output: FlateDecode streams, Type0 fonts with /ToUnicode
 * CMaps, glyph-by-glyph `<hex> Tj` text ops). This is deliberately NOT a general
 * PDF engine: no xref parsing, no object streams, no image OCR. A scanned-image
 * PDF yields no text runs and the caller gets [] (handled as "couldn't read").
 *
 * Hermes-safe: no Buffer, no atob, no TextDecoder — latin-1 via String.fromCharCode.
 * Runs in the app (Share-to-Log) and in plain node for tests.
 *
 * fflate note: in fflate, `unzlibSync` inflates zlib-WRAPPED data (what PDF
 * FlateDecode actually is — 0x78 0x9C …); `inflateSync` expects RAW deflate.
 * We try wrapped first, then raw.
 */
import { inflateSync, unzlibSync } from 'fflate';

/** base64 → bytes without Buffer/atob (Hermes-safe). */
export function base64ToBytes(b64: string): Uint8Array {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.max(0, Math.floor((len * 3) / 4) - pad));
  let o = 0;
  for (let i = 0; i + 4 <= len; i += 4) {
    // '=' (and any stray char) indexes -1 — clamp to 0 so the bitwise OR stays clean
    const c1 = B64.indexOf(clean[i]);
    const c2 = B64.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? 0 : B64.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? 0 : B64.indexOf(clean[i + 3]);
    const n = (Math.max(0, c1) << 18) | (Math.max(0, c2) << 12) | (Math.max(0, c3) << 6) | Math.max(0, c4);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ─── Raw PDF structure ───────────────────────────────────────
interface PdfObj {
  num: number;
  bodyStart: number;
  bodyEnd: number;
}

/** One text run at a device-space position (endX is exact once a Td follows it). */
interface Run {
  x: number;
  y: number;
  t: string;
  size: number; // effective font size in device space (drives gap/tolerance heuristics)
  endX: number;
  idx: number; // emission order — stable tie-break
}

/** PDF 2D matrix [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const ID: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** A × B — apply B first, then A (column-vector convention). */
function mul(A: Mat, B: Mat): Mat {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    e: A.a * B.e + A.c * B.f + A.e,
    f: A.b * B.e + A.d * B.f + A.f,
  };
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[]);
  }
  return s;
}

/** `N G obj … endobj` blocks. Char offsets == byte offsets (latin-1). */
function parseObjects(src: string): PdfObj[] {
  const out: PdfObj[] = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const bodyStart = m.index + m[0].length;
    let bodyEnd = src.indexOf('endobj', bodyStart);
    if (bodyEnd < 0) bodyEnd = src.length;
    out.push({ num: +m[1], bodyStart, bodyEnd });
  }
  return out;
}

/** Extract (+ inflate) a stream's data. null when unflatable. */
function streamBytes(bytes: Uint8Array, src: string, o: PdfObj): Uint8Array | null {
  const body = src.slice(o.bodyStart, o.bodyEnd);
  const sm = /\bstream(\r\n|\n|\r)/.exec(body); // \b keeps 'endstream' out
  if (!sm) return null;
  const dict = body.slice(0, sm.index);
  const start = o.bodyStart + sm.index + sm[0].length;
  let end = -1;
  const lm = /\/Length\s+(\d+)\b/.exec(dict);
  if (lm) {
    end = start + parseInt(lm[1], 10);
  } else {
    end = src.indexOf('endstream', start);
    if (end < 0) return null;
    while (end > start && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) end--;
  }
  if (end > bytes.length) end = bytes.length;
  if (end <= start) return null;
  const raw = bytes.subarray(start, end);
  if (/\/FlateDecode\b/.test(dict)) {
    try {
      return unzlibSync(raw); // PDF FlateDecode = zlib-wrapped deflate
    } catch {
      try {
        return inflateSync(raw); // some producers write raw deflate
      } catch {
        return null;
      }
    }
  }
  return raw; // unfiltered stream — usable as-is (ASCIIHex/85 not handled)
}

// ─── ToUnicode CMaps ─────────────────────────────────────────
/** UTF-16BE hex → JS string (a leading FEFF BOM is skipped). */
function u16(hex: string): string {
  const h = hex.replace(/\s+/g, '');
  let s = '';
  for (let i = 0; i + 4 <= h.length; i += 4) {
    if (i === 0 && h.slice(0, 4).toUpperCase() === 'FEFF') continue;
    s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  }
  return s;
}

/** Parse `beginbfchar` / `beginbfrange` blocks of a ToUnicode CMap stream. */
function parseCMap(text: string): Map<number, string> | null {
  if (text.indexOf('beginbfchar') < 0 && text.indexOf('beginbfrange') < 0) return null;
  const map = new Map<number, string>();
  let bm: RegExpExecArray | null;
  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((bm = bfcharRe.exec(text))) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p: RegExpExecArray | null;
    while ((p = pairRe.exec(bm[1]))) map.set(parseInt(p[1], 16), u16(p[2]));
  }
  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((bm = bfrangeRe.exec(text))) {
    const body = bm[1];
    // Array form: <lo> <hi> [<d0> <d1> …]
    const arrRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g;
    let p: RegExpExecArray | null;
    while ((p = arrRe.exec(body))) {
      const lo = parseInt(p[1], 16);
      const dstRe = /<([0-9A-Fa-f]+)>/g;
      let d: RegExpExecArray | null;
      let i = 0;
      while ((d = dstRe.exec(p[3]))) map.set(lo + i++, u16(d[1]));
    }
    // Sequential form: <lo> <hi> <dstStart>
    const noArr = body.replace(arrRe, '');
    const seqRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    while ((p = seqRe.exec(noArr))) {
      const lo = parseInt(p[1], 16);
      const hi = Math.min(parseInt(p[2], 16), lo + 4096); // sanity cap
      const dst = parseInt(p[3], 16);
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
  }
  return map;
}

// ─── Content-stream tokenizer ────────────────────────────────
type Tok =
  | { k: 'n'; v: number } // number
  | { k: 's'; v: string } // (literal string), escapes resolved, latin-1
  | { k: 'h'; v: string } // <hex string>
  | { k: 'f'; v: string } // /name
  | { k: 'a'; v: Tok[] } // [array]
  | { k: 'd'; v: Tok[] } // <<dict>>
  | { k: 'o'; v: string }; // operator / keyword

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  const n = s.length;
  let i = 0;
  const isWs = (c: string) => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\0';
  const isDelim = (c: string) =>
    isWs(c) || c === '(' || c === ')' || c === '<' || c === '>' || c === '[' || c === ']' || c === '/' || c === '%';
  while (i < n) {
    const c = s[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === '%') {
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (c === '(') {
      // literal string: standard escapes, nested balanced parens
      let depth = 1;
      let out = '';
      let j = i + 1;
      while (j < n && depth > 0) {
        const ch = s[j];
        if (ch === '\\') {
          const nx = s[j + 1];
          if (nx === 'n') (out += '\n'), (j += 2);
          else if (nx === 'r') (out += '\r'), (j += 2);
          else if (nx === 't') (out += '\t'), (j += 2);
          else if (nx === 'b') (out += '\b'), (j += 2);
          else if (nx === 'f') (out += '\f'), (j += 2);
          else if (nx === '(' || nx === ')' || nx === '\\') (out += nx), (j += 2);
          else if (nx >= '0' && nx <= '7') {
            let oct = '';
            let k = j + 1;
            while (k < n && oct.length < 3 && s[k] >= '0' && s[k] <= '7') oct += s[k++];
            out += String.fromCharCode(parseInt(oct, 8) & 255);
            j = k;
          } else if (nx === '\n' || nx === '\r') {
            j += 2;
            if (nx === '\r' && s[j] === '\n') j++; // line continuation
          } else {
            out += nx ?? '';
            j += 2;
          }
        } else if (ch === '(') {
          depth++;
          out += ch;
          j++;
        } else if (ch === ')') {
          depth--;
          if (depth > 0) out += ch;
          j++;
        } else {
          out += ch;
          j++;
        }
      }
      toks.push({ k: 's', v: out });
      i = j;
      continue;
    }
    if (c === '<') {
      if (s[i + 1] === '<') {
        toks.push({ k: 'o', v: '<<' });
        i += 2;
        continue;
      }
      let hex = '';
      let j = i + 1;
      while (j < n && s[j] !== '>') {
        if (!isWs(s[j])) hex += s[j];
        j++;
      }
      toks.push({ k: 'h', v: hex });
      i = j + 1;
      continue;
    }
    if (c === '>' && s[i + 1] === '>') {
      toks.push({ k: 'o', v: '>>' });
      i += 2;
      continue;
    }
    if (c === '[') {
      toks.push({ k: 'o', v: '[' });
      i++;
      continue;
    }
    if (c === ']') {
      toks.push({ k: 'o', v: ']' });
      i++;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      while (j < n && !isDelim(s[j])) j++;
      toks.push({ k: 'f', v: s.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (c === '+' || c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      let j = i;
      while (j < n && !isDelim(s[j])) j++;
      const v = parseFloat(s.slice(i, j));
      if (!isNaN(v)) {
        toks.push({ k: 'n', v });
        i = j;
        continue;
      }
    }
    // operator / keyword (includes W*, ', ")
    let j = i;
    while (j < n && !isDelim(s[j])) j++;
    toks.push({ k: 'o', v: s.slice(i, j) });
    i = j;
  }
  return toks;
}

// ─── Content-stream interpreter ──────────────────────────────
function decodeHexText(hex: string, cmap: Map<number, string> | null): string {
  let h = hex;
  if (h.length % 2) h += '0';
  let out = '';
  if (cmap) {
    // Type0 / Identity-H: 2-byte glyph codes through the font's ToUnicode CMap
    for (let i = 0; i + 4 <= h.length; i += 4) {
      const t = cmap.get(parseInt(h.slice(i, i + 4), 16));
      if (t) out += t;
    }
  } else {
    for (let i = 0; i + 2 <= h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  }
  return out;
}

function decodeLitText(s: string, cmap: Map<number, string> | null): string {
  if (!cmap) return s; // single-byte latin-1
  let out = '';
  for (let i = 0; i + 2 <= s.length; i += 2) {
    const t = cmap.get((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    if (t) out += t;
  }
  return out;
}

function walkContent(text: string, fontCmaps: Map<string, Map<number, string>>, runs: Run[]): void {
  const toks = tokenize(text);
  let ctm: Mat = ID;
  const gstack: Mat[] = [];
  let tm: Mat = ID; // text (line) matrix
  let penX = 0; // advance within TJ arrays / consecutive Tj (text-space units)
  let fontSize = 0;
  let fontName = '';
  let leading = 0;
  let lastRun = -1;
  let actual: string | null = null; // /ActualText override inside a BDC…EMC span
  let ops: Tok[] = [];

  const num = (t: Tok | undefined) => (t && t.k === 'n' ? t.v : 0);
  const matFrom = (ts: Tok[]): Mat => ({
    a: num(ts[ts.length - 6]),
    b: num(ts[ts.length - 5]),
    c: num(ts[ts.length - 4]),
    d: num(ts[ts.length - 3]),
    e: num(ts[ts.length - 2]),
    f: num(ts[ts.length - 1]),
  });

  const emit = (s: string) => {
    s = s.replace(/\0/g, '').replace(/\u00A0/g, ' ');
    if (!s) return;
    const M = mul(ctm, tm); // text space → device space
    const sx = Math.sqrt(M.a * M.a + M.b * M.b) || 1;
    const x = M.e + M.a * penX;
    const y = M.f + M.b * penX;
    runs.push({
      x,
      y,
      t: s,
      size: fontSize * sx,
      endX: x + s.length * fontSize * 0.5 * sx, // estimate; a following Td makes it exact
      idx: runs.length,
    });
    lastRun = runs.length - 1;
    penX += s.length * fontSize * 0.5;
  };

  const show = (t: Tok | undefined) => {
    if (!t || actual != null) return; // suppressed inside an /ActualText span
    const cmap = fontCmaps.get(fontName) ?? null;
    if (t.k === 'h') emit(decodeHexText(t.v, cmap));
    else if (t.k === 's') emit(decodeLitText(t.v, cmap));
  };

  const tStar = () => {
    tm = mul({ a: 1, b: 0, c: 0, d: 1, e: 0, f: -leading }, tm);
    penX = 0;
    lastRun = -1;
  };

  for (let ti = 0; ti < toks.length; ti++) {
    const tk = toks[ti];
    if (tk.k !== 'o') {
      ops.push(tk);
      continue;
    }
    const w = tk.v;
    if (w === '<<' || w === '[') {
      // collect a balanced dict/array as ONE operand
      const close = w === '<<' ? '>>' : ']';
      let depth = 1;
      const inner: Tok[] = [];
      while (ti + 1 < toks.length && depth > 0) {
        const nx = toks[++ti];
        if (nx.k === 'o' && (nx.v === '<<' || nx.v === '[')) depth++;
        else if (nx.k === 'o' && (nx.v === '>>' || nx.v === ']')) {
          depth--;
          if (depth === 0) break;
        }
        inner.push(nx);
      }
      ops.push({ k: w === '<<' ? 'd' : 'a', v: inner });
      continue;
    }
    switch (w) {
      case 'q':
        gstack.push({ ...ctm });
        break;
      case 'Q':
        if (gstack.length) ctm = gstack.pop() as Mat;
        lastRun = -1;
        break;
      case 'cm':
        ctm = mul(ctm, matFrom(ops)); // CTM' = CTM × M (M maps into the old local space first)
        break;
      case 'BT':
        tm = ID;
        penX = 0;
        lastRun = -1;
        break;
      case 'ET':
        lastRun = -1;
        break;
      case 'Tf':
        if (ops[ops.length - 2]?.k === 'f') fontName = (ops[ops.length - 2] as { v: string }).v;
        fontSize = num(ops[ops.length - 1]);
        break;
      case 'Tm':
        tm = matFrom(ops);
        penX = 0;
        lastRun = -1;
        break;
      case 'Td':
      case 'TD': {
        const tx = num(ops[ops.length - 2]);
        const ty = num(ops[ops.length - 1]);
        tm = mul({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }, tm);
        penX = 0;
        if (w === 'TD') leading = -ty;
        // A horizontal Td advance IS the exact end of the previous glyph run —
        // this is what lets column breaks be told apart from normal glyph flow.
        if (lastRun >= 0 && Math.abs(ty) < 0.01) {
          const nx = mul(ctm, tm).e;
          if (nx >= runs[lastRun].x) runs[lastRun].endX = nx;
        } else {
          lastRun = -1;
        }
        break;
      }
      case 'TL':
        leading = num(ops[ops.length - 1]);
        break;
      case 'T*':
        tStar();
        break;
      case 'Tj':
        show(ops[ops.length - 1]);
        break;
      case 'TJ': {
        const arr = ops[ops.length - 1];
        if (arr && arr.k === 'a') {
          for (const it of arr.v) {
            if (it.k === 'n') penX -= (it.v * fontSize) / 1000; // thousandths of an em
            else show(it);
          }
        }
        break;
      }
      case "'":
        tStar();
        show(ops[ops.length - 1]);
        break;
      case '"':
        tStar();
        show(ops[ops.length - 1]);
        break;
      case 'BDC': {
        // /Span << /ActualText <FEFF…> >> BDC — the span's glyphs are replaced by
        // ActualText (Stripe uses it for hyphens the CMap maps to U+0000).
        const d = ops.find((t) => t.k === 'd');
        if (d && d.k === 'd') {
          for (let k = 0; k < d.v.length - 1; k++) {
            const t0 = d.v[k];
            const t1 = d.v[k + 1];
            if (t0.k === 'f' && t0.v === 'ActualText' && t1.k === 'h') {
              actual = u16(t1.v);
              break;
            }
          }
        }
        break;
      }
      case 'EMC':
        if (actual != null) {
          const s = actual;
          actual = null;
          emit(s);
        }
        break;
      default:
        break; // all graphics ops (re, f, RG, rg, gs, W*, n, Do, …) — ignored
    }
    ops = [];
  }
}

// ─── Row reconstruction ──────────────────────────────────────
/** Join one group's runs left→right, splitting into segments at big column gaps. */
function segmentGroup(items: Run[]): Run[][] {
  const segs: Run[][] = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const it = items[i];
    // A huge x-gap between same-line runs = a column boundary (address block vs
    // bill-to block, table cells). Glyph-flow gaps are ≈0 thanks to exact Td endX.
    if (it.x - prev.endX > Math.max(18, prev.size * 4)) segs.push([it]);
    else segs[segs.length - 1].push(it);
  }
  return segs;
}

function joinRuns(items: Run[]): string {
  let text = '';
  let prev: Run | null = null;
  for (const it of items) {
    if (!it.t) continue;
    if (prev) {
      if (Math.abs(it.x - prev.x) < 0.5 && it.t === prev.t) continue; // double-drawn "bold"
      // Normal glyph flow has gap ≈ 0 (Td advances are exact); a real gap
      // means a word/column break → insert the space the PDF never drew.
      if (it.x - prev.endX > Math.max(1.2, prev.size * 0.22)) text += ' ';
    }
    text += it.t;
    prev = it;
  }
  return text;
}

function buildRows(runs: Run[]): string[] {
  if (runs.length === 0) return [];
  // Device space is y-up → reading order is y DESCENDING.
  const sorted = runs.slice().sort((a, b) => b.y - a.y || a.idx - b.idx);
  const groups: { y: number; items: Run[] }[] = [];
  for (const r of sorted) {
    const g = groups[groups.length - 1];
    const tol = Math.max(2.5, r.size * 0.3); // rows here are ~13.5pt apart; same-line blocks differ ≤1pt
    if (g && Math.abs(r.y - g.y) <= tol) g.items.push(r);
    else groups.push({ y: r.y, items: [r] });
  }
  const rows: string[] = [];
  for (const g of groups) {
    g.items.sort((a, b) => a.x - b.x || a.idx - b.idx);
    const segs = segmentGroup(g.items);
    if (segs.length > 1 && segs.every((s) => !/\d/.test(joinRuns(s)))) {
      // Multi-column TEXT region (vendor address next to bill-to, table headers):
      // emit each column segment as its own row — mirrors how OCR blocks come back,
      // and keeps "MOONSHOT AI PTE. LTD." from fusing with "Bill to". Segments WITH
      // digits (label+amount table rows, "Visa - 6128 … $199.00 …") stay joined so
      // amounts keep their labels on one row.
      for (const s of segs) {
        const t = joinRuns(s).replace(/ {2,}/g, ' ').trim();
        if (t) rows.push(t);
      }
    } else {
      const t = joinRuns(g.items).replace(/ {2,}/g, ' ').trim();
      if (t) rows.push(t);
    }
    if (rows.length >= 500) break;
  }
  return rows;
}

// ─── Entry point ─────────────────────────────────────────────
/**
 * Extract text rows from a PDF's bytes, top-to-bottom reading order. Returns []
 * for anything unparseable (never throws) — including scanned-image PDFs.
 */
export function extractPdfTextRows(bytes: Uint8Array): string[] {
  try {
    if (!bytes || bytes.length < 16) return [];
    const src = bytesToLatin1(bytes);
    if (src.indexOf('%PDF') < 0 || src.indexOf('%PDF') > 1024) return [];
    const objs = parseObjects(src);
    if (objs.length === 0) return [];

    // 1) Decode every stream (content, ToUnicode CMaps, images — we keep text ones).
    const streamText = new Map<number, string>();
    for (const o of objs) {
      const data = streamBytes(bytes, src, o);
      if (!data) continue;
      const t = bytesToLatin1(data);
      if (t.indexOf('BT') >= 0 || t.indexOf('beginbfchar') >= 0 || t.indexOf('beginbfrange') >= 0) {
        streamText.set(o.num, t);
      }
    }

    // 2) ToUnicode CMaps by object number.
    const cmaps = new Map<number, Map<number, string>>();
    for (const [num, t] of streamText) {
      const cmap = parseCMap(t);
      if (cmap) cmaps.set(num, cmap);
    }

    // 3) Font resource name → CMap: find `/Font << /F4 7 0 R … >>` dicts (inline or
    //    via `/Font N G R`), then each font object's `/ToUnicode` ref.
    const fontCmaps = new Map<string, Map<number, string>>();
    const linkFont = (name: string, fontObjNum: number) => {
      if (fontCmaps.has(name)) return;
      const fo = objs.find((x) => x.num === fontObjNum);
      if (!fo) return;
      const fb = src.slice(fo.bodyStart, fo.bodyEnd);
      const tu = /\/ToUnicode\s+(\d+)\s+(\d+)\s+R/.exec(fb);
      if (!tu) return;
      const cmap = cmaps.get(+tu[1]);
      if (cmap) fontCmaps.set(name, cmap);
    };
    for (const o of objs) {
      const body = src.slice(o.bodyStart, Math.min(o.bodyEnd, o.bodyStart + 6000));
      const fm = /\/Font\s*<<([\s\S]*?)>>/.exec(body);
      if (fm) {
        const refRe = /\/([A-Za-z0-9]+)\s+(\d+)\s+(\d+)\s+R/g;
        let r: RegExpExecArray | null;
        while ((r = refRe.exec(fm[1]))) linkFont(r[1], +r[2]);
      }
      const fi = /\/Font\s+(\d+)\s+(\d+)\s+R/.exec(body); // /Font as indirect ref
      if (fi) {
        const fo = objs.find((x) => x.num === +fi[1]);
        if (fo) {
          const fb = src.slice(fo.bodyStart, Math.min(fo.bodyEnd, fo.bodyStart + 6000));
          const inner = /<<([\s\S]*?)>>/.exec(fb);
          if (inner) {
            const refRe = /\/([A-Za-z0-9]+)\s+(\d+)\s+(\d+)\s+R/g;
            let r: RegExpExecArray | null;
            while ((r = refRe.exec(inner[1]))) linkFont(r[1], +r[2]);
          }
        }
      }
    }

    // 4) Page /Contents refs, in page order (single ref or array).
    const contentNums: number[] = [];
    for (const o of objs) {
      const body = src.slice(o.bodyStart, Math.min(o.bodyEnd, o.bodyStart + 4000));
      if (!/\/Type\s*\/Page(?![A-Za-z])/.test(body)) continue; // excludes /Pages
      const arr = /\/Contents\s*\[([\s\S]*?)\]/.exec(body);
      if (arr) {
        const refRe = /(\d+)\s+(\d+)\s+R/g;
        let r: RegExpExecArray | null;
        while ((r = refRe.exec(arr[1]))) contentNums.push(+r[1]);
      } else {
        const c = /\/Contents\s+(\d+)\s+(\d+)\s+R/.exec(body);
        if (c) contentNums.push(+c[1]);
      }
    }
    if (contentNums.length === 0) {
      // Fallback: every decoded stream with text ops that isn't a CMap.
      for (const [num, t] of streamText) {
        if (t.indexOf('BT') >= 0 && t.indexOf('begincmap') < 0) contentNums.push(num);
      }
    }

    // 5) Walk the content streams, then rebuild reading-order rows.
    const runs: Run[] = [];
    for (const cn of contentNums) {
      const t = streamText.get(cn);
      if (t) walkContent(t, fontCmaps, runs);
    }
    return buildRows(runs);
  } catch {
    return [];
  }
}
