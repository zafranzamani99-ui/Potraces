# Echo — Memory, Cost, Storage & Safety

> **Status: OPEN DISCUSSION — not decided.** Captured 2026-07-24. These are working notes from a session, kept for reference. Technical claims here are from that discussion and have **not** been re-verified line-by-line against the current code (offer stands to fact-check them before any decision is made).

## How Echo handles memory
"Memory" = the context window. Everything Echo knows for a reply is stuffed into one ~11k-token input, re-sent every message. **No separate memory.**

Each message re-sends 3 things:
- **Rulebook** (Echo's personality/rules) — ~5k tokens, identical every time → biggest chunk
- **Live money data** (wallets, debts, goals, spending) — re-read fresh from the app each turn, scoped to the question
- **Recent chat** — last N messages only (Free 15 · Basic 30 · Pro 45 · Premium 90). Older messages are dropped, not summarized (just a placeholder note). Echo genuinely forgets early context in long chats.

Two surfaces, same engine (`moneyChat.ts`):
- **Echo chat** (full screen) → history saved on phone, reopenable
- **Ask Echo** (popup on Reports/Pulse) → throwaway, gone on close

## Cost (from the usage dashboard)
- Model: `gemini-3.1-flash-lite` (~$0.10/M input, ~$0.40/M output)
- ~95% of every message's cost is **INPUT** (the rulebook + money data). Replies are tiny/cheap.
- ~RM0.005 per message. Input climbs slowly as chat history fills the window.

## Cheapest way to cut cost
- ✅ **Trim the rulebook** — one text edit, saves ~2.5k tokens on every message forever. Biggest, laziest win.
- ⚠️ Prompt caching → possible but proxy is pass-through, no caching wired up; needs infra.
- ❌ Compacting conversation → wrong lever; it's the small, slow-growing slice.

## Where conversations are stored
- The actual words: **only on the user's phone.** Never sent to any server.
- Cloud sync & cloud backup: both **exclude chat on purpose.** Only money data goes to the cloud.
- Delete app / lose phone → chat gone forever (money data restores; chat doesn't).
- Server (dashboard) stores only a **receipt**: time, screen, model, token counts, cost, email, device — never the message text.

## Training & personalization
- **No training loop.** Chats never reach a server, so there's no data to train on.
- Echo isn't "yours" — it's Google's Gemini + your written prompt. You can only change the instructions, not the brain.
- Echo does **not** learn your topics, style, or what you keep asking. Every chat starts from a blank Echo (only live money numbers carry in).
- **One small exception:** it learns logging shortcuts from save-chip corrections (grab→transport, "mama"→"Siti", default wallet). Max 100, syncs to cloud. Makes logging faster, not chats smarter.

## Safety gaps (real, open today)
- **No custom moderation.** Relies entirely on Gemini's built-in filter. When it blocks, user just sees "AI returned empty — try rephrasing." Nothing flagged, nothing logged, you never know.
- **No self-harm / violence handling.** No detection, no crisis resources, no backstop. And since nothing's stored, you can't audit what Echo replied.
- **Recommended lazy fix:** on-device crisis-keyword check on the user's message → show a calm help card (e.g. Befrienders KL 03-76272929 · Talian Kasih 15999) + one line in the rulebook to steer to help. No server, stays private, ~30 lines.
- ⚠️ Wanting training data later = sending chats to a server = needs explicit PDPA consent. Don't do it silently.

## Open decisions (not yet done)
1. **Trim the rulebook** to cut cost?
2. **Build the on-device crisis safety check?**
3. **"Echo remembers you" personalization** (needs server + consent) — park or plan?

---

### Related note (added 2026-07-24, connects to the strategy work)
Decision #3 partly overlaps with the flagship in [MAKIN_KENAL.md](MAKIN_KENAL.md). Important distinction:
- Making Echo **feel** like it remembers you can be done through the **learning notebook** (the "one small exception" above — logging shortcuts, already on-device + synced, capped at 100). That path needs **no server and no new PDPA consent**, and the strategy doc's flagship ("Echo's Notebook") is exactly this made visible.
- Training on **chat content** (topics/style) is the different, heavier path — that's the one that needs chats sent to a server + explicit consent.

So "Echo remembers you" splits into a cheap/safe half (the notebook) and an expensive/consent-heavy half (chat training). Worth separating them before deciding #3.
