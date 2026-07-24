# Session notes — 24–25 July 2026

Everything we worked through this session, in plain English. Each topic shows **what we discussed**, **what was decided**, and **what's still open**.

Nothing was committed to git and nothing was deployed this session. App code was only changed for the Collectz fixes (still uncommitted, in the working folder). The learning-notebook change was NOT built yet — it's waiting on your go-ahead.

---

## 1. Collectz — found the holes and fixed them
**Discussed:** we hunted for everything broken or risky in Collectz.
**Done:** found **28 real problems** and fixed all of them, plus 4 extra ones an audit caught afterward. Fixes covered the app, the server (edge functions + 2 new migrations), the web join page, and the Malay/English text. Everything was double-checked by a review pass. The big ones: teams/capacity had no server side, editing a session wiped saved payment amounts, deleting proof always failed silently, cancelled sessions dead-ended people who already paid.
**Reports:** [audit/COLLECTZ_READINESS.md](audit/COLLECTZ_READINESS.md) (verdict: READY) and [audit/COLLECTZ_DEPLOYMENT.md](audit/COLLECTZ_DEPLOYMENT.md).
**Open / waiting on you:**
- Ship it when ready: `supabase db push` (2 migrations) → deploy 3 edge functions → git push (site) → app OTA update. Order matters; steps are in the deployment file.
- Two product calls: (a) confirming a payment locks the *current* share even if the price changed after they paid; (b) leave/unclaim is built but switched off (`LEAVE_ENABLED=false`) because the server half isn't there yet.

## 2. OCR — should we build our own?
**Discussed:** you saw open-source OCR (DeepSeek-OCR, PaddleOCR-VL) and asked if we should switch to "our own OCR."
**Decided: no, not now.** Reasons:
- Your OCR is **already server-side** — Gemini runs through your own ai-proxy, the key never touches the phone.
- "Own OCR" means renting and running a GPU computer 24/7 = **more** maintenance, not less. Free to download ≠ free to run.
- OCR only *reads* the words. You'd still need AI to *understand* which number is the total. So it wouldn't remove your real work.
**Open:** revisit only if the Gemini bill ever gets big (thousands of users). Optional someday: collect ~50 real receipts with the correct answer, so you can test a cheaper reader before switching.

## 3. Scalability & does the AI get smarter
**Discussed:** how long the current setup lasts, and whether the AI improves.
**Answers (all good news):**
- Current setup scales a **long** way. Your own audit says ~1,000 users is fine. The limit is cost + rate-limits, both fixed by paying for a higher plan — not by rewriting code. It won't "break," the bill just grows.
- The AI gets smarter **for free** when Google ships a new model — you change one line. You already did this (moved off Gemini 2.5 to 3.1/3.5). Your Echo model is **current**, updated recently.
- A new/unfamiliar receipt format does **not** mean rewriting a parser. Gemini handles formats it's never seen. You're not on that treadmill.

## 4. The learning notebook — how Echo "remembers" you
**Discussed:** you thought Echo learns your behaviour over time.
**Clarified:** the AI brain (Gemini) does **not** learn from your users. But your app has a **notebook** (`learningStore`) that quietly remembers each person's habits (grab→Transport, "adik"→a person, which wallet pays a bill) and feeds them to Echo. It fills up **automatically** as people use the app — no maintenance from you. That IS the "gets better the more you use it" thing you wanted.
**Design pass done — the best upgrade:** the receipt scanner is the ONE place you correct the AI the most, and it currently **remembers nothing**. Wiring it in is a one-line fix. Plus a small chat-edit fix.
**Skipped (on purpose):** receipt→wallet (the notebook can't update a saved wallet), tax-relief learning (needs a whole new part), and a couple of others that do nothing real.
**Open / waiting on you:** approval to build step 1 (receipts remember the category). I already told you exactly what I'd change — one file, basically one line, nothing else touched.

## 5. Flagship strategy — how Potraces wins
**Full plan:** [MAKIN_KENAL.md](MAKIN_KENAL.md). Short version:
- We checked the real competitors. Your "special" features are all already copied: **Belanje** = personal + business, **Finny** = AI receipt capture with no bank link, **RinggitWise** = Malay AI. So "we're Malaysian" or "we have business mode" is no longer special.
- The **one thing they can't copy** = the notebook that learns each user, because it's memory built up over months, not a feature. A competitor's new user starts from zero.
- **The flagship idea:** make that memory *visible* — a screen showing *"Echo dah belajar 47 benda pasal you."* Hook: *makin lama, makin kenal you.*
- **The danger:** it's invisible on day 1. So (a) make a new user feel it in week one (watch a row appear after their first scan), and (b) use Collectz to bring new people in — none of the competitors have that.
- **Don't do:** a second AI, a notification/nudge engine, or copy Belanje's cold words (profit/revenue/margin). Keep it warm ("you kept RM1,820 this month").

## 6. Echo memory, cost & safety
**Full notes:** [ECHO_MEMORY_COST_SAFETY.md](ECHO_MEMORY_COST_SAFETY.md) — still an open discussion, nothing decided.
**Three open decisions:**
1. Trim the rulebook to cut cost (it's ~5k tokens sent every message — biggest easy saving).
2. Build an on-device crisis safety check (a calm help card with Befrienders KL / Talian Kasih; ~30 lines, stays private).
3. "Echo remembers you" — which really splits in two: the **cheap/safe** half is the notebook above (no server, no consent needed), the **expensive** half is training on your actual chat words (needs chats sent to a server + PDPA consent).
**Note:** I haven't fact-checked the exact numbers in that file against the code yet — offered to, if you want them solid before deciding.

---

## What's waiting on you (the short list)
1. **Collectz:** say "ship it" when you want the deploy steps run (db push + deploy functions), then the two product calls.
2. **Learning notebook:** approve step 1 (receipts remember the category) — smallest change that makes the whole strategy real.
3. **Echo:** three open decisions above (trim rulebook / crisis safety / "remembers you").

I built nothing beyond the Collectz fixes and these notes/docs. Everything else is a decision waiting for you.
