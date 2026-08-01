# Flagship Plan — Hybrid On-Device OCR Receipt Scanner

Status: PROPOSED (awaiting go-ahead on Phase 0)
Owner: receipt scanning (DebtTracking wizard, ReceiptScanner, seller cost scan)
Companion doc: [ocr-text-to-gemini-structuring.md](./ocr-text-to-gemini-structuring.md) (prompt + config + heuristics)

## The problem we are solving

Today every scan sends the **whole image** to Gemini vision. On the hard case — long, dense,
multi-column receipts — this is the worst setup:
- **Accuracy drops** (research-confirmed: Gemini vision degrades on dense tables / small fonts —
  partial reads, merged/omitted labels).
- **Latency grows with image size**, so long receipts are slow.
- There is **no single image size that wins both** speed and accuracy.

This is the flagship feature, so we fix it the way the best apps (Veryfi, 99.9%) do: **don't send the
image to a general model**. Read the text on-device at full resolution, then send only TEXT to the model.

## Target architecture (hybrid)

```
photo ─▶ on-device OCR (Apple Vision / ML Kit, full-res, local, ~0.1–0.5s)
            │  text + bounding boxes, length-independent, free, offline
            ▼
        ocrLooksPoor()? ──yes──▶ FALL BACK to current image→Gemini path (unchanged)
            │ no
            ▼
        serialize boxes ─▶ Gemini TEXT call (JSON mode, can STREAM) ─▶ parseReceiptJson
            │
            ▼
        sanity check (Σitems ≈ subtotal?) ──fail──▶ optional one image-path retry
            ▼
        ExtractedReceipt  (same shape as today)
```

Why this fixes the flagship pain:
- **Long receipt** → OCR is length-independent and local; the text payload to Gemini is tiny → fast.
- **Dense/small text** → full-res local OCR reads it; Gemini only *structures* clean text (its strength).
- **Streaming we already built still applies** to the text step (progressive items).
- **No regression risk** — hybrid is additive, feature-flagged, and falls back to today's exact path.

## Settled decisions (from research)

| Decision | Choice | Why |
|---|---|---|
| OCR lib | `@infinitered/react-native-mlkit-text-recognition` | Apple Vision + ML Kit, maintained 2026, Expo-native, **bounding boxes** |
| Fallback lib | `@react-native-ml-kit/text-recognition` | most popular, also boxes; ML Kit on iOS (heavier) |
| Box granularity | **line-level** (not element) | iOS Apple Vision returns empty `elements[]`; lines work on both |
| Coordinates | normalize per-platform | Apple = normalized bottom-left (flip y); ML Kit = pixels top-left |
| Serialization | sorted `y x | TEXT` grid, group same-y rows | helps two-line/column reconstruction |
| Text call config | JSON mode + `thinkingBudget: 512` + `temp 0` | reconstruction is real reasoning (unlike the image call) |
| Poor-OCR fallback | `<4 lines` OR `<2 money matches` OR no total-anchor keyword | cheap, deterministic |
| Sanity check | `abs(Σitems − subtotal) > 5%` → flag/retry | catches dropped items / misreads |

## Phased plan (each phase gated; never breaks the live scanner)

### Phase 0 — PROVE OCR QUALITY (the gate). ~1–2h my side + your device test
Cheap experiment to validate the whole bet before building on it.
- Add `@infinitered/react-native-mlkit-text-recognition`.
- Add a **dev-only debug harness** (hidden button / temp screen): pick or shoot a receipt → run OCR →
  dump raw blocks (text + frames) to screen + console. No pipeline, no Gemini.
- **You** run an EAS dev build and scan 4–6 real receipts: 2 simple, 2 long/dense (the ones that upset
  you), 1 faint, 1 handwritten-ish.
- **GATE:** Does OCR capture *all* the text accurately, including the dense small items?
  - ✅ Good → proceed to Phase 1.
  - ❌ Misses dense text → the hybrid won't help as-is; we pivot (tiling, or Google Document AI) BEFORE
    sinking effort. This is the whole point of Phase 0.

### Phase 1 — Structuring service (device-independent, behind fallback). ~half day
- `src/services/receiptOcr.ts`: wrap the lib, **normalize boxes** (iOS/Android), serialize to the compact grid.
- New text prompt + `structureReceiptText(serialized)` Gemini call (JSON mode, thinkingBudget 512, temp 0,
  lite fallback allowed). Reuse `parseReceiptJson` and the streaming client `streamGeminiText`.
- `scanReceiptHybrid(uri, handlers)` orchestrator: OCR → `ocrLooksPoor()` ? image-path fallback :
  structure (streamed) → parse → sanity check. Returns the **same `ExtractedReceipt`** shape.
- Unit-test serialization + `ocrLooksPoor()` + parse against text fixtures (no device needed). `tsc` clean.

### Phase 2 — Wire behind a feature flag. ~2–3h
- Settings flag `useHybridScan` (dev/off by default).
- Route `processReceiptImage` (DebtTracking) — and optionally ReceiptScanner + seller — through
  `scanReceiptHybrid` when on; else today's path. Instant kill-switch.

### Phase 3 — Validate, tune, roll out. iterative
- Battery test (simple / long / faint / multi-column): compare hybrid vs image path on **speed AND
  accuracy** (item count, amounts, total). Tune prompt / thinking budget / fallback heuristic.
- Flip the flag on by default once hybrid beats the image path on your real receipts.

## Safety guarantees
- Additive: today's `scanReceipt` / `scanReceiptStream` stay intact and remain the fallback.
- Feature-flagged: one toggle disables the whole hybrid instantly.
- Fallback at two points: poor OCR coverage, and failed sanity check → image path.
- Nothing ships on-by-default until Phase 3 proves it wins on real receipts.

## Risks & mitigations
- **ML Kit doesn't run on iOS Simulator** → all OCR testing on a hardware device.
- **Coordinate-system differences** iOS vs Android → normalize + verify y-origin on each.
- **New native dependency → EAS rebuild** (you already ship native modules, so the pipeline exists).
- **iOS dev build may be blocked** (Apple Developer enrollment, per project notes) → validate on **Android
  first**; iOS once unblocked.
- **OCR weaker than Gemini vision on some receipts** → that's exactly what the `ocrLooksPoor()` + sanity
  fallback catch; worst case it behaves like today.

## What I need from you
1. Go-ahead to install `@infinitered/react-native-mlkit-text-recognition` and build the Phase 0 harness.
2. An EAS **dev build** + 4–6 real receipts tested through the harness (incl. the dense ones).
3. Your read on the raw OCR quality → that's the gate for Phase 1.
```
```
