# Potraces Beta Program — Master Runbook

> Scope: a small **paid closed beta** — 3 testers, 1 week, RM50 each (RM150 total).
> Goal: prove the APK installs across real Malaysian Android phones and surface the top
> bugs before a wider release. Calm tone throughout. These are **local planning artifacts** —
> nothing here is deployed, pushed, or run automatically.

Related files in this folder:
- `beta-tester-agreement.md` — bilingual EN/BM agreement + payment record template (sign before sending the APK).
- `bug-report-template.md` — the copy-paste bug template + the field spec for the in-app feedback row.
- `messages.md` — kickoff, Day-3 check-in, and wrap messages (EN + BM), ready to paste into WhatsApp.
- `feedback-form-spec.md` — the structured feedback path we are building (in-app Settings row), with setup steps.
- `beta_feedback.sql` — Supabase table DDL with public-insert-only RLS (apply before kickoff if you keep the structured path).

---

## TL;DR

1. **Channel decision (settled):** WhatsApp group is the **primary** feedback channel. We also add ONE
   structured path — a small **"Send beta feedback" row inside the app's Settings** that writes to a
   Supabase `beta_feedback` table. We are **NOT** building a public `beta.html` web form this round
   (over-engineered for 3 known testers; also removes a Vercel-routing + public-bucket risk).
2. **Hard blocker — `jejakbaki.my` SSL:** 5 source files hard-code `https://jejakbaki.my`
   (privacy link, account privacy, referral base, seller order-page base, PDF footer). Do **not** build
   or hand out the APK until you have re-confirmed the cert is valid **at build time** (browser/curl).
3. **Build once, batch the native bits:** version-info line + Sentry + the in-app feedback row +
   the first-launch data-loss screen all need a rebuild — put them in the **same** `eas build`.
4. **Consent before software:** screen → sign the agreement (captures name + phone + PDPA consent +
   data-loss acknowledgement) → **then** send the APK link. Never the other way round.
5. **OTA for JS-only fixes mid-week; rebuild only for native changes.** Do not bump app `version`
   during an OTA week or you orphan installs from the channel.
6. **Pay RM50 within 48h of Day-7 wrap** via DuitNow / bank transfer / TNG eWallet. Then run the
   **PDPA close-out**: an assigned owner deletes the rows + name/phone by a set date (≤90 days post-beta).

---

## Order of operations (today → payout)

This is the canonical sequence. Do not reorder steps 1–11 — each gates the next.

1. **Resolve the feedback channel (DONE):** WhatsApp primary + in-app Settings "Send beta feedback" row.
   Skip `beta.html`. (Recorded here so all tester-facing copy points to the same place.)
2. **Re-confirm `jejakbaki.my` SSL is live & valid.** Open `https://jejakbaki.my/privacy.html` and
   `https://jejakbaki.my` in a browser, or run `curl -I https://jejakbaki.my/privacy.html` — expect HTTP 200.
   If invalid, **STOP** and fix DNS/Vercel first. The 5 hard-coded links below break otherwise:
   - `src/screens/shared/Settings.tsx:1801` (privacy link)
   - `src/screens/shared/AccountScreen.tsx:33` (`PRIVACY_URL`)
   - `src/services/referrals.ts:3` (`BASE_URL`)
   - `src/screens/seller/Dashboard.tsx:482` (`ORDER_PAGE_BASE`)
   - `src/services/pdfExport.ts:196` (PDF footer)
   - **SAN watch-out:** the cert covers `jejakbaki.my` only — **no `www.`**. Never introduce a `www.` link.
3. **Apply the Supabase migration** (`beta_feedback.sql`) to the project (`iydqeeonaljqapulboaz`) and
   verify the anon-insert RLS works with one test row (see `feedback-form-spec.md` setup steps).
4. **Code the native-touching additions into ONE branch:**
   - (a) Read-only **version-info line in Settings** (`Constants.expoConfig.version` `(versionCode)` ·
     `Updates.updateId?.slice(0,8) ?? 'embedded'` · `Updates.channel`). `expo-constants` + `expo-updates`
     are already installed.
   - (b) **Sentry** via `@sentry/react-native` + its Expo config plugin (one-time native add; free tier
     is ample for 3 users; auto-captures native + JS crashes with the release/build).
   - (c) **In-app "Send beta feedback" row** in Settings → inserts to `beta_feedback` via the existing
     supabase client (5 fields — see `feedback-form-spec.md`).
   - (d) **First-launch data-loss / PDPA acknowledgement screen** for the beta build (bilingual EN+BM,
     one screen, calm — see copy in `messages.md` / the agreement clause 6).
5. **Decide the versionCode strategy.** `app.json` has **no** `android.versionCode` field today, so EAS
   **auto-increments versionCode remotely**. Either leave it auto (recommended — do **not** hand-edit a
   non-existent field) **or** add `"versionCode": 1` under `android` and switch `eas.json` to local
   `versionSource`. Pick one and write it down so the mid-week rebuild instructions stay correct.
6. **Confirm the EAS plumbing** (both unverified until you run them):
   - `eas whoami` → expect `zafranzamani`. If not: `eas login`.
   - `eas channel:view preview` → confirm the **preview channel points at the preview branch**
     (required for `eas update --branch preview` to reach installs).
7. **Reconcile the legal doc with ops** (already done in `beta-tester-agreement.md`): payout **48h**
   (not 7 days), payment methods include **TNG eWallet**, and the completion-bar feedback clause accepts
   **WhatsApp or the in-app row** (not "the web form").
8. **Recruit + screen 3 testers** across **3 distinct Android brands**, all confirmed **Android 8.0+**
   (minSdk 26 floor). Confirm actual brand + OS **before** building — the device plan below is guidance,
   not a verified fact. Keep 1 backup name per slot.
9. **Each tester SIGNS** the EN/BM agreement. This captures name + phone + PDPA consent + the data-loss
   acknowledgement. **This is the consent gate.**
10. **Build once:** `eas build -p android --profile preview` — one APK containing the version line +
    Sentry + in-app feedback row + first-launch data-loss screen. Get the install link via
    `eas build:list --platform android --limit 5`.
11. **Only now** send the install link + bilingual install guide to **signed** testers in the WhatsApp
    group. Pin: the data warning, the bug template, the 7-day plan, and
    "screenshot the Settings version line with every bug."
12. **Run the 7-day cadence.** Triage P0–P3. JS-only P0 → `eas update --branch preview`
    (do **not** bump `version`; tell testers to fully close + reopen). Native fix → batch into **at most
    one** mid-week rebuild and resend the link.
13. **Day 7:** send the wrap form; collect payout numbers.
14. **Within 48h:** pay RM50 × 3; mark paid + date in the tracking sheet.
15. **PDPA close-out:** the assigned owner (default: Zafran) deletes the `beta_feedback` rows + name/phone
    by a **set date** (≤90 days post-beta) and records that date in the tracking sheet.

---

## Distribution & builds

**One-time build (per native change):**
```sh
eas whoami            # confirm logged in as zafranzamani; if not: eas login
eas build -p android --profile preview   # internal-distribution APK on channel 'preview'; returns install URL + QR
```
- Do **not** use `--auto-submit` (no Play Store this round).
- First run prompts to generate an Android keystore — let EAS manage it (answer **Yes**) so OTA signing stays consistent.

**Find the install link to send testers:**
```sh
eas build:list --platform android --limit 5   # the install-page URL + QR
```

**What the tester receives:** a single EAS install-page link (e.g.
`https://expo.dev/accounts/zafranzamani/projects/potraces/builds/<id>`) with a QR.

**Sideload steps for the tester (Android 8+):**
1. Open the link in Chrome on the phone → tap Install / download the `.apk`.
2. If Chrome says "your phone is not allowed to install unknown apps from this source" → Settings →
   toggle **Allow from this source** ON. (Samsung/Xiaomi/Oppo: Settings → Apps → Special access →
   Install unknown apps → Chrome.)
3. Go back → tap the downloaded apk → **Install**.
4. If Play Protect warns "Unsafe app blocked" → **More details → Install anyway**.
5. On first launch the app shows the beta data-loss/PDPA screen, then requests **Contacts, Microphone,
   Camera, Photos, Notifications** prompts — tell testers up front these are expected.

> **Permissions note (corrected):** `app.json` declares only `READ_CONTACTS`, `RECORD_AUDIO`,
> `MODIFY_AUDIO_SETTINGS`. Camera/photos/notifications come from plugins. A **location** prompt can
> appear (pulled in by Stripe Terminal) but testers will **not** trigger card payments this round, so do
> not brief location as an "expected" everyday prompt — if it appears it is harmless to decline.

**Build identification (so bug reports map to a build):** surface build info in-app via the read-only
Settings version line (step 4a). Tell testers to **screenshot that line with every bug report**. Without
it you cannot tell whether a tester is on the base APK or a given OTA.

---

## In-week fixes

**JS / asset-only fix (no native change, `version` unchanged):**
```sh
eas update --branch preview --message "fix: <summary>"
eas update:list --branch preview     # confirm it published; see the update group id
```
- `runtimeVersion.policy = 'appVersion'` ⇒ the update's runtimeVersion is literally `app.json` `version`
  (`1.0.0`). As long as you do **not** bump `version` and do **not** change native code, the OTA reaches
  installed APKs.
- No in-app update-check code exists, so the app fetches on next **cold launch**. WhatsApp the group:
  *"update dah keluar — tutup app fully then buka balik."*

**Full rebuild required (cannot OTA) when any of these change:** a native dependency (anything in
`app.json` `plugins`, or a lib with native code — Stripe Terminal, expo-camera, google-signin), the
`permissions`/`plugins`/`minSdkVersion`/`package`, the splash/icon/`google-services.json`, **or** the
app `version` (which changes runtimeVersion and orphans old installs). Then rerun
`eas build -p android --profile preview` and resend the link. **Batch all native changes into at most one
mid-week rebuild.**

**versionCode reminder:** see step 5 above — `android.versionCode` does **not** exist in `app.json`, so
EAS auto-increments it remotely. Do not instruct yourself to "bump versionCode" unless you have first
added the field and switched to local `versionSource`.

---

## Device coverage

Three Android profiles for max real-world MY coverage at **minSdk 26 (Android 8.0+)**. One device per
profile, each a distinct OEM skin + OS band:

| Profile | Brand | Target | Why |
|---|---|---|---|
| 1 | **Samsung** (most common MY) | mid-range Galaxy A (A14/A34/A54), Android 13–14, One UI | Knox/One UI permission flow; big-screen layout |
| 2 | **Xiaomi / Redmi / POCO** (#2 MY) | Redmi Note, Android 12–13, MIUI/HyperOS | harshest sideload (extra "Install via USB"), aggressive background-kill — best stress test for notifications + OTA-on-launch |
| 3 | **Oppo / Vivo / Realme** (BBK) | recent Realme/Oppo, Android 14, ColorOS/FuntouchOS | background-restriction + permission-dialog differences |

Spanning Android 12→14 across three OEM skins surfaces the install-unknown-apps, Play-Protect-warning,
background-kill, and permission-dialog variations that actually break sideloaded betas. **Avoid below
Android 11** this round (small population; minSdk 26 already excludes <8.0).

> **Unverified:** actual tester devices/OS. Confirm each tester's brand + Android version **before**
> sending so the 3 map to 3 distinct OEM skins (not 3 Samsungs).

---

## Feedback site decision + setup

**Decision: Option A's data store, Option B's delivery.** We keep tester data in-processor (Supabase
Singapore — already disclosed, no new foreign processor) **but** we do **not** build a public web form.
The structured path is the **in-app Settings "Send beta feedback" row**; WhatsApp is the primary channel.

Why this shape:
- For 3 known testers in one WhatsApp group, a custom web form (severity pills, scroll-fade, honeypot,
  client rate-limit, cooldown, success animation, screenshot upload) is over-engineered and adds a
  Vercel-routing + public-bucket risk for no benefit.
- A Google Form / Tally would add a **new foreign processor** for finance-app testers' name + phone +
  screenshots — the wrong direction for a finance app. Keeping it in Supabase adds **zero** new processor.
- The in-app row gives a clean, queryable table tied to build identifiers, with **5 fields, not 17**.

**Setup (before kickoff):**
1. Apply `beta_feedback.sql` to project `iydqeeonaljqapulboaz` (public-insert-only RLS; no anon SELECT).
2. Verify with a test insert via the anon key (see `feedback-form-spec.md`), then delete the test row.
3. Wire the Settings row per `feedback-form-spec.md` (build_id + device auto-captured; severity + what +
   screen entered).
4. **No public screenshot bucket.** Testers paste screenshots into WhatsApp; founder triages there.

---

## Recruitment & screening

Recruit 3 personas × device diversity (the point is "irregular earners"):

- **Tester 1 — "Kakak Kuih"** (food/kuih/home-cook seller). Stress-tests Seller mode + receipt scan +
  DuitNow QR + products/costs/kept language. **Samsung.**
- **Tester 2 — "Budak Gig"** (Grab/Foodpanda rider, freelance designer/photographer, part-time tutor).
  Stress-tests irregular-income dashboard, Notes/AI quick-capture, debts/splits, budget-vs-reality.
  **Xiaomi/Redmi/POCO.**
- **Tester 3 — "Penyimpan Muda"** (young salaried saver building a habit). Stress-tests the personal-mode
  core ladder (wallet → expense → budget → goal → reports) + Backups/Restore. **Oppo/Vivo/Realme/Honor.**

**Guardrails:** 3 distinct phone brands minimum; all Android 8.0+ (confirm before promising RM50);
pick responsive people over perfect personas; avoid anyone who'd treat Potraces as their **only** money
record; keep 1 backup name per slot.

**Screening checklist (confirm BEFORE sending the APK):**
- [ ] Android 8.0+ (Settings → About phone → Android version). **Hard gate.**
- [ ] Knows brand + model; the 3 testers cover 3 **different** brands.
- [ ] ~500MB+ free storage; willing to allow "install from unknown sources".
- [ ] Maps to one of the 3 personas.
- [ ] Willing to enter **realistic** finances (not random junk) but told NOT to make Potraces their only record.
- [ ] Responsive on WhatsApp (~a day) and available the full 7 days.
- [ ] Will grant runtime permissions and report any scary/broken prompt.
- [ ] Understands it's pre-release, agrees to the EN+BM data warning, and **consents** to us holding
      name + phone (for RM50) + device info + feedback per the PDPA notice.
- [ ] Has a working DuitNow / bank account / TNG eWallet for the payout.
- [ ] Backup picked for this slot.

> **PDPA ordering:** capture the agreement signature (= consent + name + phone) **at or before** the
> moment you record name + phone. Don't collect first and consent later.

---

## 7-day plan + guided tasks

Founder runs this; ~5 min/day per tester, light touch. Day 0 same day for all 3.

- **Day 0 (Kickoff):** send install link/QR + kickoff message (EN+BM) + consent confirmation. Each tester
  confirms install OK, Android version, brand/model, "I consent". Guided Task 1 + Task 2. Log install +
  device into the sheet.
- **Day 1 (light nudge):** "How'd adding your first wallet feel?" Guided Task 3 (receipt scan).
- **Day 2 (light nudge):** Guided Task 4 (Notes / AI quick-add). "Did the AI get your note right?"
- **Day 3 (Check-in — the key touch):** short 1:1 (voice note/call) per tester. Re-engage quiet ones
  (use a backup if someone ghosted). Triage every bug so far P0–P3. If a JS-only P0 exists, prep an OTA.
- **Day 4–5 (depth):** Guided Task 5 (budget OR savings goal); Guided Task 6 (debt/split with a friend's name).
- **Day 6 (safety sweep):** everyone runs Settings → Backup & Restore → Backup. "Anything you haven't opened? Poke it."
- **Day 7 (Wrap + payout):** wrap message + short feedback form; collect payout number; pay within 48h.

**Guided tasks:**
1. **Add your first wallet** (e.g. "Cash"/"Maybank") with a starting balance. — onboarding → wallet creation.
2. **Log 1 income + 1 expense**, pick categories. — core add-transaction, balance reconciliation, "came in / went out".
3. **Scan a receipt** (kedai/grocery/supplier); check the amount + items. — camera/photos perms, OCR → Gemini, receipt→transaction.
4. **Notes / AI quick-add** — type a casual Manglish note (e.g. "beli nasi lemak 5 ringgit pakai cash"). — Notes-first capture, AI path, Manglish parsing.
5. **Set a Budget OR a Savings Goal.** — budget vs actual, goals ladder, planning screens.
6. **Try a Debt or Split** with a friend's name (from contacts if offered). — READ_CONTACTS perm, debt/split flow.
7. **Run a Backup** (Settings → Backup & Restore). — live local backup + reinforces the data-safety message; do BEFORE relying on data.

> **Data note for Tasks 3 & 4:** these route entered data to Anthropic/Gemini (US). Steer testers to
> **realistic-but-not-real** amounts (e.g. a real receipt's items are fine; don't enter actual bank
> balances or NRIC). This resolves the "use it like it's really yours" vs "don't enter anything you can't
> afford to lose" tension — **realistic, not literally your real finances.**

---

## Comms

**Channel:** one **WhatsApp group** (3 testers + founder). It's the MY default; screenshots are one tap;
voice notes suit shy testers; everything stays in one searchable thread. Keep individual DMs open for
payout numbers + anything private.

**Group setup:** name it light (e.g. "Potraces Beta Squad"). **Pin:** install link, the data-warning
one-liner, the bug template (from `bug-report-template.md`), and the 7-day plan.

**Nudge cadence (light — over-nudging kills goodwill):**
- Day 0: kickoff + consent (heavy, necessary).
- Days 1, 2, 4, 6: ONE short friendly line tied to that day's task.
- Day 3: switch to 1:1 for the real mid-week pulse (group chat hides quiet testers).
- Day 5: light group nudge only if someone's behind.
- Day 7: wrap + form + payout.
- Throughout: acknowledge **every** bug report within a few hours; move long debug to 1:1 so the group stays clean.

Messages to paste: see `messages.md`.

---

## Tracking

One Google Sheet / Excel, two tabs, founder-only.

**Tab 1 — Testers** (one row each):
`Tester | Persona | Brand | Model | Android ver | Installed OK? | Consent given? (Y+date) | Tasks done (1–7) | # reports | Engagement (hot/warm/cold) | Payout number | Paid? (Y+date) | Data deleted? (Y+date)`

**Tab 2 — Bugs** (one row per report):
`ID | Date | Tester | Screen/Flow | What happened | Severity (P0–P3) | Repro steps | Screenshot link | OTA-fixable? | Status (open/fixing/fixed/wontfix) | Fixed in (update id / next build)`

**Severity key:**
- **P0** = crash on open / data loss / can't install / blocks core flow → fix now.
- **P1** = a core flow broken but app usable → fix this week.
- **P2** = annoying, has a workaround.
- **P3** = cosmetic / copy / nice-to-have.

**Roll-up cells:** total reports, count by severity, # OTA-pushed, # testers paid / RM remaining of RM150,
**PDPA deletion due-date**.

---

## Payment & completion bar

**RM50 per tester, RM150 total.** Paid via **DuitNow / bank transfer / TNG eWallet** within **48 hours**
of meeting the bar (aligned across the agreement and all messages).

**Completion bar — a tester earns the full RM50 only if ALL THREE are done within the 1-week beta:**
- (a) installed + used the app on **≥ 3 separate days**;
- (b) logged **≥ 10** real-or-realistic entries (wallets/transactions/debts);
- (c) submitted **≥ 1 written feedback report** — **via WhatsApp or the in-app feedback row** —
  containing **≥ 3 specific observations** (bug/confusion/suggestion), each naming the **screen** and
  what they **expected**.

Partial completion = no payment by default; the founder **may** still pay at discretion if a tester was
blocked by an app-side bug.

> **Verification note:** cloud sync is OFF and there is no telemetry, so "3 days / 10 entries" is
> **honor-system** for these 3 known people (acceptable at this scale). Optionally ask testers to attach
> a screenshot or two of their entries as light proof. The completion-bar feedback clause deliberately
> accepts WhatsApp **or** the in-app row so a tester who reports in WhatsApp does not fail clause (c).

The full payment-record template is at the bottom of `beta-tester-agreement.md`.

---

## Close-out

Day 7 → +48h:
1. Collect all 3 wrap forms.
2. Finalize the ranked bug list in the sheet (severity + OTA-fixable + status).
3. Pay RM50 × 3 via DuitNow/TNG within 48h; mark Paid + date.
4. **PDPA deletion (assigned):** **Owner = Zafran.** **Due date = beta end + 90 days (set the exact
   calendar date in the sheet now).** On that date — or earlier on request — delete the `beta_feedback`
   rows + name/phone, and record the deletion date in the sheet. Offer each tester earlier deletion.
5. Send thank-yous. Write a one-paragraph "what we learned + top 3 fixes for next build" note for
   yourself (local only, not deployed).

**Success = done if:** all 3 installed on 3 different brands (8.0+) and opened the app; each completed
≥ 5 of 7 guided tasks; ≥ 1 written report per tester; **zero unresolved P0s** at close; a ranked P0→P3
list + the "would you use it 1–10" signal exist; all 3 paid; PDPA close-out scheduled with an owner + date.
