# Potraces Quick Log — Back Tap Shortcut

Log an expense by double-tapping the back of the iPhone — without opening the
app. The Shortcut collects amount/category/payment/note with native prompts,
POSTs to the `quick-log` edge function (authenticated by the user's Quick-Log
key), and the app materializes the entry on next open.

## User setup (what the in-app Quick Log screen walks through)

In Potraces: Settings → Money → **Quick Log (Back Tap)** (iPhone only — no
Back Tap on iPad/Android; requires Cloud Backup, the screen gates on it and
returns the user here after sign-in). Steps as shown in-app:

1. Tap **Generate my key**, then **Copy key**.
2. Tap **Get the Shortcut** (`https://jejakbaki.my/shortcut`) — Safari
   downloads it; tap **↓** → the file → **Add Shortcut**.
3. **Run it once — now**, while the key is still on the clipboard: open the
   **Shortcuts** app, tap the card; the key is pre-filled → Done → log a test
   expense. The key is persisted (as `potraces-key.txt` in iCloud
   Drive/Shortcuts) **only after the server accepts it** — clipboard garbage
   can never wedge itself in.
4. iPhone **Settings** → Accessibility → Touch → **Back Tap** → **Double Tap**
   → choose **Potraces Quick Log**.

Key rotation is grace-period: **Regenerate** in the app does NOT kill the old
key immediately — the first successful use of the NEW key retires the others
(server-side). Explicit **Turn off Quick Log**, turning off Cloud Backup, and
signing out all revoke keys immediately (prevents false "Logged" pushes).

Offline note: if the POST fails there's no retry in v1 — the entry is not
logged (the notification shows the error instead of `"ok":true`).

## Maintainer pipeline (no iPhone needed)

The Shortcut is **generated from source**, signed on a Mac, and hosted on the
public `web` storage bucket — so it can be updated in place at a stable URL
(unlike iCloud share links, which mint a new URL on every re-share).

```bash
python3 scripts/build-quick-log-shortcut.py     # source of truth → unsigned plist
plutil -lint shortcut/PotracesQuickLog-unsigned.shortcut
shortcuts sign --mode anyone \
  -i shortcut/PotracesQuickLog-unsigned.shortcut \
  -o "shortcut/Potraces Quick Log.shortcut"
npx supabase storage cp "shortcut/Potraces Quick Log.shortcut" \
  ss:///web/PotracesQuickLog.shortcut --experimental \
  --content-type application/x-apple-shortcut
```

Public URL (wired into `QuickLogSetup.tsx` as `SHORTCUT_URL`):

```
https://iydqeeonaljqapulboaz.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut?download=Potraces%20Quick%20Log.shortcut
```

Gotchas learned the hard way:
- `shortcuts sign` routes on the input **file extension** — it must be
  `.shortcut` or `.wflow`; a `.plist` extension fails with "isn't in the
  correct format" regardless of contents.
- The `web` bucket has a MIME allowlist (SEC-H4);
  `application/x-apple-shortcut` was added for this file
  (migration `20260708000000_web_bucket_shortcut_mime.sql`).
- Shortcuts attachment ranges are UTF-16 offsets; the builder handles this.
- **Updating in place:** `storage cp` refuses to overwrite (409) and
  `storage rm` is silently broken in supabase CLI 2.109 (`deleted: []`).
  Working update dance:
  `storage mv ss:///web/PotracesQuickLog.shortcut ss:///web/PotracesQuickLog-old.shortcut`
  then `storage cp` the new file. Stale `-old` objects accumulate — clear
  them from the dashboard occasionally.
- Users who already added the Shortcut do NOT auto-update — they must
  re-download and re-add (their saved `potraces-key.txt` survives, so the
  key is not re-asked).

## What the Shortcut does (actions, in order)

1. **Key bootstrap**: Get File `potraces-key.txt`; if missing → Get Clipboard →
   Ask (pre-filled) → variable only. The key file is written ONLY in the
   success branch (validated keys only — clipboard garbage can't wedge in).
2. Collect: **Amount** (number) → **Category** (list w/ emoji labels; server's
   `resolveCategory` strips non-alphanumerics) → **Payment** (list;
   `resolveWallet` alias/type-matches) → **Note** (optional).
3. **Get Contents of URL** — POST JSON to
   `https://iydqeeonaljqapulboaz.supabase.co/functions/v1/quick-log`. Offline:
   this aborts the shortcut with a visible iOS error — honest, no silent loss,
   no duplicate risk.
4. **If `ok` missing** (server rejected): ⚠️ notification + self-heal a revoked
   key (delete the saved key file so the next run re-asks). **Otherwise**
   (success): SILENT — the Potraces push is the confirmation (tap →
   TransactionsList); save the now-validated key.

First run also shows a one-time iOS prompt to allow connecting to
`*.supabase.co` — tap **Always Allow**.

> **Offline retry** is intentionally NOT implemented: a naive write-ahead +
> replay can duplicate a transaction when the POST commits but the response is
> lost. A future version needs a client dedupe key + a server unique index
> before offline entries can be safely retried.

> **Delete-confirmation gotcha:** `is.workflow.actions.file.delete` takes
> `WFDeleteFileConfirmDeletion` (default TRUE → pops a confirm dialog);
> `WFDeleteImmediatelyDelete` is a no-op. Set the former to `False`.

## Roadmap (v2): native App Intent

The zero-key, zero-server route: a Swift `AppIntent` in the main app target
(iOS 16+) that prompts for amount/category/note natively, writes to the
`group.com.potraces.app` App Group, and the app drains it on next open — works
offline and without Cloud Backup. Back Tap still needs a one-action wrapper
shortcut (Back Tap only lists personal shortcuts). Prereqs: add the App Group
to the MAIN app entitlements (currently only the share extension has it);
deliver Swift via a config plugin to survive `expo prebuild --clean`.
