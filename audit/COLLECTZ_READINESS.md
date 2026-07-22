# Collectz — Final Ship-Readiness Audit

Date: 2026-07-23 · Auditor: independent final-pass agent (trusted nothing, re-read all code)
Scope: 28 findings fixed by parallel agents across supabase/functions (collectz-join / notify / remind), 3 new migrations, src/screens/personal/collectz/*, src/services/collectzService.ts, src/i18n/en.ts+ms.ts, site/collectz.html.

## VERDICT: READY-WITH-RISKS

The code in the working tree closes 25 of 28 holes at root cause, end to end. Three
halves fell between packages (R1–R3 below), plus one hard operational gate (R0).
Nothing remaining moves money wrongly; the survivors are comms/dead-end gaps.

---

## R0 — OPERATIONAL GATE (must do before ship, not a code bug)

**Everything is working-tree only. Production still runs the stale code.**
All three edge functions, all 3 new migrations (20260723010000/020000/030000), every
app/site file — uncommitted (`git status` shows all modified/untracked). An earlier
live probe of production collectz-join returned `{"error":"unknown action"}` for
`set_team`. Ship requires, in order:

1. `supabase db push` (or apply the 3 migrations) — collectz_view_attempts,
   last_notified_at, removed_notified_at, guard-trigger + notify-trigger replacements,
   proofs owner-delete policy all live here.
2. `supabase functions deploy collectz-join collectz-notify collectz-remind`.
3. Commit + build the app. The app's team/capacity/full-view UI, i18n, and web page are
   contract-matched to the NEW function — an old function with a new app reproduces the
   original "unknown action" blockers.

Order matters: migrations before functions (functions reference collectz_view_attempts
and removed_notified_at; a deployed function without the tables 500s on the rate-limit
count / removed cooldown paths).

---

## Remaining risks, ranked

### R1 · MEDIUM — Cancelled sessions still return a bare 410: the dropped cross-layer half
`supabase/functions/collectz-join/index.ts:160` — `if (session.status === 'cancelled') return json({ error: 'cancelled' }, 410)`
fires BEFORE the view payload is built, for every caller including a paid, linked participant.

- **Web** is ready and waiting: `site/collectz.html:656-659` explicitly handles a body
  carrying `session` on a non-OK response ("newer collectz-join returns the view payload
  so we can show the cancelled banner + organizer contact chips; older deploys 410 with
  just the error"). The server package never shipped that "newer" behavior, so the web
  permanently takes the fallback (plain bilingual "cancelled — no payment needed"). Fine,
  but the banner + contact chips branch is dead code.
- **App**: `CollectzJoin.tsx:138-145` now surfaces the specific reason ("This session was
  cancelled.") instead of the old generic wall — real improvement — but a paid participant
  still loses roster / their own status / uploaded-proof visibility / organizer QR and
  contact chips exactly when chasing a refund. The in-app `cancelledBanner` (line 626-629)
  is reachable only for settled, never cancelled.
- **Fix shape** (post-ship patch, ~10 lines server-side): for `action:'view'`, return the
  normal payload with `session.status='cancelled'` (HTTP 200) and keep the 410 only for
  claim/add_self/set_team. Caution: the app's `invokeJoin` (collectzService.ts:530-556)
  throws on ANY body containing `error`, so return the payload WITHOUT an `error` field
  (web keys off `body.session` / `session.status`, app keys off `session.status` — both
  then work with zero client changes).

### R2 · MEDIUM — Edit-screen roster removals are still completely silent
`CollectzCreate.tsx:617` (`for (const id of removedIds) await removeParticipant(id)`) and
`removeRow` (:417-424) — no `kind:'removed'` push, no "this person already paid" warning.
Only CollectzDetail's remove path (:492-515) got the notify-before-delete + paid-warning
treatment. The original finding-22 scenario — organizer trims the roster in EDIT to fit
capacity — goes through exactly the unfixed path: a claimed/paid participant vanishes with
no push (the subsequent 'edited' fanout queries participants AFTER deletion, so the removed
user is already excluded). The 20260723030000 migration comment even documents
"the documented call order is notify-BEFORE-delete" — Create doesn't follow it.
Fix shape: mirror Detail's block before the `removeParticipant` loop (needs each removed
row's `user_id`, available in the prefilled roster rows).

### R3 · LOW-MEDIUM — New push types are unroutable in the app
`App.tsx:616-641` routes `collectz_pending/confirmed/rejected/reminder/edited/cancelled/settled`
— but not the two types this fix round INTRODUCED:
- `collectz_promoted` (DB trigger, 20260723020000:139) — body says "Check your share",
  tap does nothing.
- `collectz_removed` (collectz-notify:160) — tap does nothing.
Pushes still display, so information reaches the user; only the tap-through is dead.
Two extra `||` clauses (promoted → CollectzJoin; removed → arguably CollectzHome since the
join view no longer contains them).

### R4 · LOW-MEDIUM — deleteSession still orphans collectz-images (finding 13, second half)
`collectzService.ts:773-782` removes proof objects, then deletes the row — never touches
`{id}/club.jpg` / `{id}/qr.jpg` in the PUBLIC collectz-images bucket. The owner-delete
policy exists (20260722010000 `collectz_images_owner_delete`), so a two-line
`storage.from(IMAGES_BUCKET).remove([...])` before the row delete would work; after the
row is gone `collectz_is_session_owner` returns false and the objects are permanently
undeletable. Impact: organizer's payment QR stays publicly fetchable forever at
`{uuid}/qr.jpg` (unguessable path, so exposure is low — but it's exactly what the fixed
proofs half was fixed for). The proofs half IS fixed and verified: policy + all three app
paths (removeParticipant / resetParticipantToUnpaid / deleteSession) now actually delete,
making the `removePaidBody` "proof will be deleted" copy true.

### R5 · LOW-MEDIUM — Confirm after a price edit still locks the NEW amount (declared OUT_OF_SCOPE, never picked up)
`confirmParticipant` (collectzService.ts:457-480) locks the CURRENT computed share at
confirm time. A participant who paid RM10 before a RM10→RM15 edit gets RM15 locked when
the organizer taps Confirm on the old proof. Substantially softened this round: money
edits now push ("Share per person (RM) → 15.00") and appear in the changeSummary, so both
sides are told — but the review sheet doesn't flag proofs that predate the change.
Product decision needed (store paid-amount at proof time vs. flag stale proofs). Not a
regression; the books never move silently anymore.

### R6 · LOW — Polish: raw error codes and an ungated Remind button
- Remind button (`CollectzDetail.tsx:803-806`) renders for settled/cancelled sessions.
  Server now correctly 409s (`collectz-remind:66`), so no spam goes out — but the toast
  shows the literal string "session_closed" (`remindUnpaid` re-throws raw codes,
  collectzService.ts:758). Gate the button on `isOpen` or map the code.
- `joinErrorMessage` (collectzService.ts:512-527) has no `rate_limited` case — an IP that
  trips the miss-brake sees a toast literally reading "rate_limited". Edge case (only
  shared-IP victims of an active enumeration attack), cosmetic.
- Cooldown message for remind is still the fixed "Already reminded in the last 24 hours."
  — `retry_after_seconds` (which the server now returns) is discarded. Fine to ship.

### R7 · LOW — 'edited' notify has no reach feedback; no pending chip on Home
- Settle/cancel/delete surface "notified n of m" via `notifyWithReach`
  (CollectzDetail.tsx:288-303) ✓, and remind toasts its count ✓ — but the edit-save notify
  (`CollectzCreate.tsx:635`) is still `.catch(() => {})` fire-and-forget.
- CollectzHome has no "2 proofs waiting" chip on organizing cards (finding 25, second
  half). Mitigated: the DB trigger pushes the organizer on every proof submission.

### R8 · LOW — Known, deliberate gaps (documented, not bugs)
- **Leave/unclaim shipped dark**: full client flow exists (`CollectzJoin.tsx:449-491`,
  leaveTitle/Body/Cta i18n in both languages) behind `LEAVE_ENABLED=false` because
  collectz-join has no `leave` action (its own comment at :59-62 says flip when the server
  ships it). The fat-finger half of the original finding is closed properly: claiming now
  requires a confirm dialog (:295-299).
- **RM0 custom share impossible**: `parseAmountLoose` requires `> 0` (:31). Scoped out;
  needs a product call (the "birthday guy pays nothing" case). Note the same helper also
  imposes a RM1,000,000 cap and 2dp rounding on all Collectz amounts — deliberate.
- **socials/group_url stay on the public view projection** — deliberate (migration
  20260723010000 comment: "the organizer opted in"); the enumeration brake (miss-only
  per-IP 429, collectz-join:49-52,132-141) is what protects them at scale.
- Stale comment + redundant query: `CollectzJoin.tsx:163` still says the view omits
  `reject_note` and re-queries the row — the server now includes it in `my_participant`
  (:236). Harmless double-fetch; delete on the next touch.

---

## What was verified GOOD (end-to-end integration)

**Server → app → web field contract** (findings 0/7/14/18/19/17/26/1/11):
- `view` projection now carries `max_participants, team_count, team_size, team_names,
  socials, group_url, currency, team_idx, reject_note (rejected-only), claimed` — consumed
  by the app (CollectzJoin isFull :199, teams UI :201-222/841+, contact chips) AND the web
  (rm() currency :478-483, contact chips :578-591, reject note :620-627). No field is
  produced-but-unread or read-but-unproduced — except the cancelled payload (R1).
- `set_team` / `set_team_name` implemented with team_size enforcement (team_full),
  reserve exclusion (team_reserve), and rename open to any roster member — matching the
  client contract (`joinTeam`/`renameTeam`) and the app's team blocks + rename modal in
  both Join and Detail.
- `add_self` enforces `session_full` (:319-321) exactly as migration 20260722040000
  promised; claim of a pre-added name correctly stays allowed.
- Brute-force brake: misses-only per-IP log (20 / 15 min) + 24h opportunistic prune +
  service-role-only table. Legit traffic (valid codes) never logs a miss. Web page and
  Home's joined-progress loop are unaffected.
- XSS: maps_url now scheme-guarded `^https?://` (:563) like socials (:585) and the
  WhatsApp-only group_url guard (:579); esc() everywhere; no `javascript:` can reach an
  href. Verified in-file; the web reviewer's independent 5-case harness also passed.

**Money invariants** (findings 6/12, 8/15, 16):
- Edit-save preserves confirm-time share locks: `CollectzCreate.tsx:626` omits
  `share_amount` from the patch for flat/equal+confirmed rows; `updateParticipant`'s
  Partial type leaves the column untouched; computeShares honors the surviving lock.
- `duplicateSession` (collectzService.ts:861-915): carries capacity/teams/contact/
  calc_notes/team_idx, resets statuses, drops locks (custom-only share carry :910),
  copies BOTH club image and QR into the new session's folder (:891-903) — no shared
  paths, degradation to no-QR on copy failure.
- `parseAmount` → shared `parseAmountLoose` (all 8 call sites): "1,500" is thousands, not
  RM1.50; negatives refused.

**Lifecycle guards** (findings 10/11):
- DB guard trigger blocks proof submission (`→ pending`) into a non-open session
  (20260723020000:92-97) — server-level, stale-client-proof.
- collectz-remind 409s non-open sessions (:66) and stamps the 24h cooldown only when
  `sent > 0` (:152-157), with `retry_after_seconds` in the 429 body.

**Notification paths** (findings 3/22/23/25/27/28 + 21):
- Promotion: trigger now fires on `slot` change, reserve→active pushes "You're playing!"
  with reject-note-carrying rejected body (20260723020000:107-209). Detail's promote is a
  bare slot flip and is now covered by the trigger — correct layering.
- Removal (Detail path): notify-BEFORE-delete with roster-membership check server-side
  (push-to-any-user primitive closed) + per-(session,target) 60s cooldown.
- Money edits: changeSummary diffs scheme/default_share/total_amount/capacity (+ teams
  shape) and fires the 'edited' fanout when ticked.
- Reach feedback: settle/cancel/delete toast "notified n of m" (participant-counted, not
  token-counted); cancel additionally offers the WhatsApp group blast with an unlinked
  count (finding 24) — reusing the announcement-builder pattern.
- collectz-notify: 60s fanout cooldown, 500-char message cap, DeviceNotRegistered token
  pruning, stamp-only-when-sent.

**Type check**: `npx tsc --noEmit` → 20 errors, ALL in the known pre-existing cascade
(sttToken.ts, supabase.ts, performance.ts + the same `{}`-typing family in aiProxy /
aiService / appConfig / fxRates / geminiClient / geminiLiveStream / sonioxStream /
ShareExtension.tsx). Zero errors in any collectz screen/service, i18n, or other touched
file. (Baseline was quoted as 55; the current whole-repo count is 20 lines in the same
known files — nothing NEW.)

**i18n**: en/ms collectz blocks both 266 keys (typed parity enforced by
`Translations = typeof en`, and tsc is clean on both files). Web page EN/BM dicts in sync
(incl. `rejectReason` 'Reason'/'Sebab'). No banned words (profit/loss/revenue/ROI/
inventory) in either language's collectz block; BM spot-checks read casual and
non-scolding ("Pastikan ini memang anda…", "boleh join balik guna link yang sama
bila-bila", "Tanya penganjur untuk pastikan bayaran anda dikira").

**Neu/Onyx**: every `overflow:'hidden'` in the five collectz screens sits on a
shadow-free view (clubWell faint fills, progressTrack, iconTile, datePickerCard with an
explicit no-neu comment, CollectzJoin's listCard/listClip split citing TransactionItem) —
seam rule holds. Team chips/pills use `neu.raised` over faintDark per Onyx rule 3; the
web WhatsApp chip is flat `#25D366` (mandated exempt-flat). No red/alarm colors added;
rejected rows use `C.overdue`.

---

## Suggested post-gate order (if fixing before ship)
1. R0 (deploy — non-negotiable).
2. R2 (edit-path removal notify — copy Detail's 8-line block; biggest human hurt).
3. R3 (two `||` clauses in App.tsx).
4. R1 (server cancelled payload — small, but touch collectz-join once more and redeploy).
5. R4/R6 (two-liners, batch with anything).
R5/R7/R8 are backlog/product-decision items.

---

## Addendum — residual round CLOSED (2026-07-23, run wf_608c44bd-909)

R1–R4 and both polish items are now **FIXED** and adversarially re-verified (5/5 pass, zero regressions, tsc clean in all touched files):

- **R1** `collectz-join` now returns cancelled sessions with the full view payload (guard moved to mutations only) — the web cancelled branch and the app cancelled banner + contact chips are live. Old-deploy 410 fallback retained on the site.
- **R2** CollectzCreate edit-path removals fire the `removed` notify BEFORE row deletion, mirroring CollectzDetail's mechanism (no-uid rows skipped; per-target cooldown prevents double-push).
- **R3** Push router handles `collectz_promoted` → CollectzJoin{sessionId} and `collectz_removed` → CollectzHome (RootNavigator:402); payloads match the trigger + notify fn.
- **R4** `deleteSession` removes `{id}/club.jpg` + `{id}/qr.jpg` from collectz-images (after proofs, before row delete, never-throws).
- **Polish** `joinSessionClosed` / `joinRateLimited` i18n mappings added (EN+BM parity); Remind hidden when session not open.

**Still open (by design or awaiting product call):**
- R5 — `confirmParticipant` locks the CURRENT computed share when a proof predates a price edit (softened: money edits now notify). Product decision needed.
- R8 — leave/unclaim shipped dark behind `LEAVE_ENABLED=false` (server has no `leave` action yet); RM0 custom share impossible (`parseAmountLoose > 0`).
- Low polish — no reach feedback on `edited` notify, no pending-proof chip on Home, older `joinErrorMessage` codes still hardcoded EN (pre-existing).
- Recorded tradeoffs — `reject_note` on the public anon projection for rejected rows (needed for web display); `removed` push kind cooldown-exempt but roster-validated.
