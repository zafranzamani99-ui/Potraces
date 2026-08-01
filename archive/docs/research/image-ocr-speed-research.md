# Image OCR Speed Research — May 2026

Goal: get product list / receipt image parsing from ~10s down to under 3s.

## Current Implementation Baseline

| File | What it does | Model | Image prep | Timeout |
|---|---|---|---|---|
| `receiptScanner.ts` | Receipt parsing → structured JSON | Gemini 2.5 Flash | Resize 1600px, JPEG 0.9, base64 | 30s |
| `aiService.ts` → `parseProductImage` | Product list from photo → JSON | Gemini 2.5 Flash | None (raw base64) | 15s default |
| `ocrService.ts` | Google Cloud Vision OCR | Cloud Vision API | None (raw base64) | default |

Both Gemini calls use `thinkingBudget: 0` already. `parseProductImage` does NO image preprocessing.

---

## 1. Gemini 2.5 Flash Image Optimization

### thinkingBudget: 0
Already applied. Confirmed effective — disabling thinking gives ~0.33s time-to-first-token and is the right call for structured extraction (no reasoning needed).

### Model variants (fastest to slowest)
| Model | Speed | OCR quality | Notes |
|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | 382 tokens/s, 2.5x faster TTFT than Flash | Good for simple OCR | No thinking at all, cheapest, 40-60ms faster per reply |
| **Gemini 2.5 Flash** (current) | 232 tokens/s, 3.76s avg per image OCR | Best balance | What we use now |
| Gemini 3.0/3.1 Flash-Lite | Even faster (if available on free tier) | TBD | Newer model family |

**Recommendation**: Try Flash-Lite for product list parsing (simpler structured output). Keep Flash for receipts (complex Malaysian thermal receipt layout needs higher accuracy).

### Image size → token count → latency
- 512x512 image = ~1,610 input tokens
- Larger images = proportionally more tokens = more processing time
- **Reducing image resolution is the single biggest lever for speed**

### responseMimeType: 'application/json'
Already used in `parseProductList` but NOT in `parseProductImage`. Adding it forces Gemini to output valid JSON directly, skipping the "strip fences" step and potentially reducing output tokens.

---

## 2. Image Preprocessing Before Sending

### Current state
- `receiptScanner.ts`: resizes to 1600px width, JPEG 0.9 compression
- `parseProductImage`: sends RAW full-resolution base64 (BIG win available here)

### Optimal settings for OCR
| Parameter | Recommended | Why |
|---|---|---|
| **Resolution** | 1024px longest edge | 300 DPI equivalent for phone photos. Below 150 DPI accuracy drops. 1024px is the sweet spot — halves token count vs 2048px |
| **Format** | JPEG | Smaller payload than PNG. WebP even smaller but JPEG universally safe |
| **Quality** | 0.8 | Below 0.8 OCR accuracy degrades. 0.9→0.8 saves ~15-20% file size with no quality loss |
| **Color** | Keep color | Grayscale doesn't help Gemini (it's not traditional OCR) |

### Impact estimate
A typical phone photo is 4000x3000 (12MP, ~3-5MB as JPEG).
- Raw base64: ~4-7MB payload, ~6,000+ input tokens
- Resized to 1024px + JPEG 0.8: ~100-200KB payload, ~1,600 input tokens
- **Savings: ~75% fewer input tokens = proportionally faster processing**

### Implementation (expo-image-manipulator)
```typescript
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

async function prepareImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true }
  );
  return result.base64!;
}
```
Manipulation itself takes <200ms on-device. Net time saved: 2-5 seconds.

---

## 3. Alternative Fast APIs

### Latency comparison for structured extraction from images

| API | Typical latency | Accuracy | Cost | Notes |
|---|---|---|---|---|
| **Google Cloud Vision OCR** | 0.5-2s (text only) | 98.7% clean, 92.3% handwritten | $1.50/1K images | Returns raw text, not structured — needs second step |
| **Gemini 2.5 Flash-Lite** | 1-3s (end-to-end) | Good for simple docs | Free tier / very cheap | Direct structured JSON output |
| **Gemini 2.5 Flash** | 3-6s (end-to-end) | Best for complex receipts | Free tier / cheap | What we use now |
| **GPT-4o-mini** | 2-4s | Good | $0.15/1M input tokens | Competitive but separate API key needed |
| **Claude Haiku 4.5** | 2-4s (0.52s TTFT) | Good | $0.80/1M input tokens | Already have API key but more expensive |
| **ML Kit on-device** | 50-200ms | Good for printed text, weak for handwriting | Free | No network needed, but no structured parsing |

### Verdict
For **product list images** (printed text, simple structure): Flash-Lite is fastest end-to-end.
For **receipts** (complex Malaysian thermal layout): Flash with preprocessing is the best balance.
Cloud Vision is only faster if you don't need structured output.

---

## 4. Two-Step Approach (OCR then LLM)

### Research finding: WORSE than end-to-end multimodal

A 2025 benchmark (arxiv.org/html/2509.04469v1) found:
- **Native image processing: 87-93% accuracy**
- **Text-first (OCR→LLM): 47-64% accuracy**
- The text extraction step loses layout/formatting context that VLMs use

### When two-step IS faster
- Google Cloud Vision OCR (~1s) + Gemini Flash text-only (~1s) = ~2s total
- BUT accuracy drops significantly on receipts with complex layouts
- Works OK for clean printed product lists

### Recommendation
**Skip two-step for receipts.** Consider it only for very clean, printed product lists where the layout is simple (one product per line).

### Hybrid approach (best of both worlds)
Use ML Kit on-device for instant text preview, then send image to Gemini for accurate structured output:
```
1. User takes photo
2. ML Kit extracts text in ~100ms → show raw text preview immediately
3. Gemini processes image in background → replace with structured results
4. User sees something instantly, accurate data arrives in 2-4s
```

---

## 5. Streaming / Partial Results

### Gemini supports streaming with image input
Use `streamGenerateContent` endpoint instead of `generateContent`:
```
POST /v1beta/models/gemini-2.5-flash:streamGenerateContent?key=KEY
```

### How it helps
- TTFT (time to first token): ~0.3s for Flash-Lite, ~0.5s for Flash
- User sees "Found vendor: 7-Eleven..." while items are still being parsed
- Streamed JSON chunks can be concatenated progressively

### Limitation
- `responseMimeType: 'application/json'` + streaming = chunks are partial JSON strings
- Can't parse until complete — but can show character count / progress indicator
- Better UX: show items as complete JSON array elements arrive

### Implementation approach
```typescript
const response = await fetch(streamUrl, { method: 'POST', body: ... });
const reader = response.body.getReader();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += new TextDecoder().decode(value);
  // Try to extract complete items from partial JSON
  // Update UI with each found item
}
```

### Recommendation
Streaming is worth implementing for **receipt scanning** (long response, many items). Not needed for product lists (short response).

---

## 6. Parallel Processing (Split Image)

### Verdict: NOT recommended

- Splitting a receipt image into regions risks cutting items across boundaries
- Each API call has its own TTFT overhead (~0.5s) — 3 parallel calls still take 0.5s minimum
- Merging results from multiple calls introduces deduplication complexity
- Gemini already processes the full image efficiently in one pass

### When it makes sense
Only for batch processing (multiple separate images at once), not splitting one image.

---

## 7. Base64 vs URL Upload

### Findings
| Method | Pros | Cons |
|---|---|---|
| **Inline base64** (current) | Single request, no upload step | Payload size ~33% larger than binary, increases request latency |
| **File URI (pre-upload)** | Smaller request payload | Extra round-trip to upload first |
| **GCS/HTTPS URL** | Best for reused files | Requires file hosting infrastructure |

### For our use case
- Images are one-time use (scan once, discard)
- Base64 is correct approach — avoids the upload round-trip
- The key optimization is **reducing image size before encoding**, not changing encoding method
- After resize to 1024px + JPEG 0.8, base64 payload is ~150-250KB — trivial

---

## Recommended Action Plan (priority order)

### Quick wins (can ship today, expected: 10s → 4-5s)

1. **Add image preprocessing to `parseProductImage`** — it currently sends raw full-res images
   - Resize to 1024px width, JPEG quality 0.8
   - Expected saving: 3-5 seconds

2. **Add `responseMimeType: 'application/json'` to `parseProductImage`**
   - Already used in `parseProductList`, missing from image version
   - Reduces output tokens, ensures valid JSON

3. **Reduce `receiptScanner.ts` resize from 1600px to 1024px**
   - 1024px is sufficient for OCR (300 DPI equivalent)
   - Reduces input tokens by ~40%

### Medium effort (expected: 4-5s → 2-3s)

4. **Try Gemini 2.5 Flash-Lite for product list parsing**
   - 2.5x faster TTFT, 64% higher token throughput
   - Product lists are simpler than receipts — Flash-Lite accuracy is sufficient
   - Keep Flash for receipt scanning

5. **Use streaming for receipt scanner**
   - Show vendor name and items progressively
   - Perceived latency drops dramatically even if total time is same

### Advanced (expected: 2-3s → 1-2s perceived)

6. **ML Kit on-device preview → Gemini structured parse**
   - Instant text preview in ~100ms
   - Gemini processes in background for structured result
   - Requires `@react-native-ml-kit/text-recognition` package

7. **Reduce prompt size**
   - Current receipt prompt is ~1,800 chars (~450 tokens)
   - Product parse prompt is shorter — already efficient
   - Trimming examples/hints could save ~100ms

---

## Expected Final Performance

| Scenario | Current | After quick wins | After all optimizations |
|---|---|---|---|
| Product list image | ~10s | ~4s | ~2s (Flash-Lite + preprocessing) |
| Receipt scan | ~8s | ~5s | ~3s real, ~1s perceived (streaming) |
| Receipt with ML Kit preview | N/A | N/A | ~0.1s preview, ~3s structured |

## Key Insight

The single biggest win is **image preprocessing for `parseProductImage`** — it's currently sending raw 12MP photos (4-7MB base64) when 1024px JPEG 0.8 (~200KB) is more than sufficient. This alone should cut 3-5 seconds.
