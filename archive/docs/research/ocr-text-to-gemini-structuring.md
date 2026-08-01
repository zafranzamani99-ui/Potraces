# OCR text → Gemini structuring (Malaysian thermal receipts)

Research + design for the hybrid receipt scanner: on-device OCR (Apple Vision / ML Kit)
reads raw text at full resolution, then we send **text** (not the image) to
`gemini-2.5-flash` to structure into our `ExtractedReceipt` JSON.

Adapted from the existing image prompt in `src/services/receiptScanner.ts` (`RECEIPT_PROMPT`)
and config in `src/services/geminiClient.ts`.

---

## (a) Recommended end-to-end approach

1. **OCR at full resolution on-device.** Unlike the image call, there is no
   speed↔accuracy size dial — OCR reads the original capture, so dense/long
   receipts no longer lose small text. This is the whole point of the hybrid.

2. **Prefer coordinates when the platform gives them.** Both engines expose
   per-line boxes:
   - **Apple Vision** — `VNRecognizedTextObservation.boundingBox`, normalized
     `0..1`, **origin bottom-left** (so larger y = higher on the receipt).
   - **ML Kit** — `Text.Line.boundingBox` (a `Rect` in **pixels**, origin
     top-left). Normalize by image width/height to `0..1`.
   Both return **unstructured lines** that still need grouping into rows — exactly
   the problem the model solves better with coordinates. (Apple's WWDC25
   `RecognizeDocumentsRequest` groups automatically, but we can't rely on it for
   our min OS / cross-platform path.)

3. **Two input modes — implement both, pick at runtime:**
   - **Coordinates available → serialize a compact spatial layout** (format below).
     The literature ("LayTextLLM — *A Bounding Box is Worth One Token*", arXiv
     2407.01976; LayoutLM family) shows interleaving layout with text materially
     improves columnar/multi-line reconstruction **and reduces hallucination**
     because the model can decode reading order and align the rightmost number
     column to each name.
   - **Plain strings only (fallback)** → join the `string[]` with `\n` and feed
     as-is. Vision/ML Kit already emit lines in roughly top-to-bottom order, so a
     newline join preserves most structure; the prompt's two-line rule handles
     the rest.

4. **Normalize before sending.** Strip card numbers (reuse
   `scrubCardNumbers` from `src/utils/pii.ts`, already applied in
   `ocrService.ts`). Cap text length (~8k chars) defensively.

5. **Detect low coverage → fall back to the existing image call** (`scanReceipt` /
   `scanReceiptStream`). Heuristic in (d).

6. **Reuse the existing parse + validation** (`parseReceiptJson`,
   `VALID_PAYMENT_METHODS`, category sets, `MAX_RECEIPT_AMOUNT`). The output
   contract is unchanged.

### Compact coordinate serialization (recommended)

Serialize **one line per OCR block**, sorted top→bottom then left→right, with a
small integer grid (0–100) for x and y — integers keep tokens tiny and the model
doesn't need sub-pixel precision:

```
y=03 x=00 | Restaurant Laman Aiman
y=08 x=00 | Takeaway
y=14 x=00 | (T)NG SOTONG     x=55 | 1     x=80 | 9.50
y=18 x=02 | + NASI LEBIH     x=55 | 1     x=80 | 0.50
y=22 x=00 | (T)UDANG/SOTONG MERAH  x=55 | 1  x=80 | 8.50
y=30 x=00 | Total Amount     x=80 | 25.50
```

Rules for building it (client-side, before the LLM):
- Convert each box's centre to `x,y` in `0..100`. For **Apple Vision flip y**:
  `y = round((1 - boundingBox.midY) * 100)` so y increases downward (matches
  reading order). ML Kit is already top-left, so `y = round(midY/height*100)`.
- **Group blocks into rows** by y proximity (e.g. within ~2–3 units) and emit them
  on one logical line, ordered by x. This is the cheap heuristic that already
  re-assembles most two-line items; the model fixes the rest.
- The trailing right-aligned token (largest x with a number) is the line total —
  state that explicitly in the prompt.

If you only want the simplest viable coordinate format, even just
`x,y | text` per block (un-grouped, sorted by y then x) is enough for Gemini to
reconstruct columns — grouping is an optimization, not a requirement.

---

## (b) Why coordinates help the two-line / column problem

- The core failure on thermal receipts is **name on row N, qty/unit/total on row
  N+1**, and OCR sometimes emits the price column as a **separate block** out of
  order. Plain text loses the x-alignment that tells the model "this 9.50 belongs
  to the SOTONG row above it."
- With x,y, the model can (1) cluster blocks sharing a y-band into one item row and
  (2) pick the **rightmost numeric token** as `amount` — which is exactly our
  contract ("amount = rightmost line-total, NOT unit price").
- Even without coordinates, instruct the model to treat a bare number-only line as
  the continuation of the **immediately preceding name line**, and to use the
  rightmost number on that combined row.

---

## (c) Recommended `generationConfig` for the TEXT call

```ts
generationConfig: {
  temperature: 0,                 // deterministic structuring; 0 over 0.1 for text
  maxOutputTokens: 16384,         // long dense receipts (keep parity with image call)
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 512 },  // see note
}
```

- **Keep `responseMimeType: 'application/json'`.** It removes markdown fences /
  prose, trims output tokens, and kills a class of parse failures (same reasoning
  as the image call). Keep `stripJsonFences` as defensive fallback.
- **Thinking: turn it ON, but small (`thinkingBudget: 512`), not `0`.**
  Reconstructing messy/out-of-order OCR text is a genuine reasoning task (cluster
  rows, align columns, exclude totals), which is exactly where a *small* thinking
  budget on Gemini 2.5 Flash buys accuracy at modest latency. The image call uses
  `0` because vision already does the layout work internally; here the layout work
  is pushed to the text reasoner. Tradeoff: a 512-token budget adds a few hundred ms
  but reduces dropped/mis-attributed items. If latency-sensitive, A/B `0` vs `512`;
  start at `512`. (Gemini 2.5 thinking budget is an explicit speed↔accuracy dial —
  Google Developers Blog.)
- `temperature: 0` (vs the image call's `0.1`) — structuring deterministic text
  wants the lowest-variance output.
- Use the **non-fallback-irrelevant** path: text is cheap and small, so you MAY
  allow the `gemini-2.5-flash-lite` fallback (pass `noFallback = false` to
  `callGeminiAPI`) — unlike the image call, the text call doesn't waste a heavy
  quota on fallback. Streaming via `streamGeminiText` still works for progressive
  item display.

---

## (d) Exact low-coverage → image fallback heuristic

Run OCR first; compute coverage signals on the raw OCR result **before** calling
Gemini. If ANY trigger fires, skip the text call and use the existing image
`scanReceipt` / `scanReceiptStream`:

```ts
function ocrLooksPoor(lines: string[]): boolean {
  const text = lines.join('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);

  // 1. Too little text — a real receipt has many lines.
  if (nonEmpty.length < 4) return true;

  // 2. No money at all — receipts always have amounts. Matches 9.50 / 9,50 / RM9.50
  const moneyMatches = text.match(/\d+[.,]\d{2}\b/g) ?? [];
  if (moneyMatches.length < 2) return true;

  // 3. Almost no digits overall (OCR returned mostly garbage words).
  const digits = (text.match(/\d/g) ?? []).length;
  if (digits < 4) return true;

  // 4. No total-ish anchor line (any of these keywords + a number nearby).
  const hasTotalAnchor = /(total|jumlah|amount|bayar|tunai|cash|grand)/i.test(text);
  if (!hasTotalAnchor) return true;

  return false; // OCR coverage looks good → safe to send text to Gemini
}
```

Optional refinements if the engine exposes per-block confidence (Vision does, via
`topCandidates(1).first?.confidence`): also trigger fallback when the **mean
line confidence < 0.5** or **> 30% of lines are below 0.3**. Keep the
keyword/number heuristics as the cross-platform floor (ML Kit line confidence is
less reliable).

A second, post-hoc safety net: after the text call, if the model returns
`items.length === 0` **or** `total === 0` on a receipt the heuristic deemed OK,
retry once via the image path before surfacing an error.

---

## (e) DRAFT text-structuring PROMPT (adapt from `RECEIPT_PROMPT`)

The body is nearly identical to the existing image prompt — only the *input
description* and the *line-reconstruction* guidance change. Keep the same JSON
contract, the same category/payment hints, and the same "count every item" rule.

```
You are a receipt parser for Malaysian receipts. You are given the RAW TEXT that an
on-device OCR engine extracted from a thermal receipt photo. The OCR text may be
imperfect: lines can arrive slightly out of order, an item's price may sit on its
own line/block, decimals or spaces may be missing, and similar item names may repeat.
Reconstruct the receipt faithfully and extract ALL purchased items.

INPUT FORMAT:
- If lines are prefixed with coordinates like "y=14 x=00 | TEXT  x=80 | 9.50", treat
  x,y as positions on a 0-100 grid: y increases DOWN the receipt, x increases to the
  RIGHT. Blocks sharing a similar y are the SAME row. Within a row, the rightmost
  numeric token (largest x) is that item's LINE TOTAL.
- If lines are plain text separated by newlines, read top-to-bottom. A line that is
  ONLY a number (or qty + numbers) is the continuation of the item NAME on the line
  immediately ABOVE it — combine them into one item.

CRITICAL — Malaysian thermal receipt layout:
- Items often span TWO lines: product name first, then qty / unit price / line total.
  Example:
    (T)NG SOTONG
    1    9.50
  This is ONE item: "(T)NG SOTONG" with amount 9.50.
- A "+ MODIFIER" line (e.g. "+ NASI LEBIH  1  0.50") that has its own price is its
  OWN item. If a modifier has NO price, fold it into the item above.
- The RIGHTMOST number on an item's row is the line total — ALWAYS use that, NOT the
  unit price.
- Count every single item row. Do NOT skip duplicates or similar-looking names.
- NEVER output a total/subtotal/tax/discount/change/rounding/payment line as an item.

Return JSON only:
{
  "vendor": "store name or null",
  "items": [{ "name": "item name", "amount": 9.50 }],
  "subtotal": 25.50 or null,
  "tax": 0 or null,
  "total": 25.50,
  "date": "date string or null",
  "location": "store address/branch or null",
  "paymentMethod": "one of: cash, debit_card, credit_card, tng, grabpay, boost, shopee_pay, mae, bigpay, duitnow_qr, fpx, other — or null",
  "suggestedExpenseCategory": "one of: food, transport, shopping, entertainment, bills, health, education, family, subscription, other",
  "suggestedTaxCategory": "one of: none, lifestyle, sports, medical, parents_medical, education, childcare, breastfeeding, ev_charging, sspn, insurance_epf, education_insurance, prs, domestic_travel, housing_loan"
}

Rules:
- amounts must be numbers, not strings; strip the RM prefix
- "amount" = the RIGHTMOST number on each item's row (line total after discount), NOT unit price
- "total" = final amount paid (grand total / total incl SST / jumlah / amount due)
- "tax" = SST, GST, service tax, or service charge amount
- if no explicit total line, sum the items + tax
- if a number looks merged or is missing its decimal point, infer the most plausible
  RM value from context (e.g. "950" on a food line near "9.50" totals likely means 9.50)
- vendor = store/restaurant name, usually the first lines of the receipt
- if unclear, guess rather than omit an item
- if truly unreadable, return {"vendor": null, "items": [], "total": 0}

[KEEP the existing "Tax category hints" and "Payment method hints" blocks verbatim
from RECEIPT_PROMPT.]
```

---

## (f) Known failure modes + mitigations

| Failure mode | Mitigation |
|---|---|
| One item split across 3 blocks (name / qty / price out of order) | Coordinate grouping by y-band; prompt rule "blocks sharing a similar y are the same row" |
| Price on a separate line | Plain-text rule: a number-only line continues the name above it |
| Merged numbers / missing decimal (`950` → `9.50`) | Prompt inference rule; validation rejects `amount > MAX_RECEIPT_AMOUNT` |
| Totals/subtotals parsed as items | Explicit "NEVER output total/subtotal/tax… as item"; post-parse filter already excludes via name matching is not enough — rely on the rule + total ≈ sum(items) sanity check |
| Dropped items on long receipts | `maxOutputTokens: 16384`; "count every item" rule; full-res OCR (no shrink); streaming surfaces partial items |
| OCR garbage (blurry photo) | Low-coverage heuristic (d) routes to image call before wasting a text call |
| Model returns 0 items / 0 total despite "good" OCR | Post-hoc single retry via image path |

**Sanity check to add after parse:** if `subtotal`/`total` is present and
`abs(sum(items) - subtotal) > 0.05 * subtotal`, the item list is probably missing
or double-counting rows — flag for the existing review/edit UI rather than silently
accepting.

---

## Sources

- LayTextLLM — *A Bounding Box is Worth One Token* (arXiv 2407.01976) — interleaving
  layout+text improves document understanding and reduces hallucination.
- Gemini 2.5 thinking-model updates — Google Developers Blog (thinking budget as an
  explicit speed↔accuracy↔cost dial).
- Apple `VNRecognizedTextObservation` / `boundingBox` — normalized 0..1, bottom-left
  origin; `.accurate` is word-level, no per-char boxes; WWDC25 `RecognizeDocumentsRequest`.
- Google ML Kit Text Recognition — `Text.Line.boundingBox` Rect in pixels, top-left origin.
- Receipt OCR + LLM accuracy benchmarks (AIMultiple; Medium "Enhancing Image Text
  Extraction with LLM and OCR") — LLM post-processing of OCR text corrects errors using
  context; ~97% extraction accuracy reported on receipts.
