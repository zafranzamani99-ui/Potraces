# Store Data Disclosure — copy-paste sheet for the consoles

**Date:** 2026-06-17 · **Purpose:** exact answers for the **Apple App Privacy (Nutrition Label)** and
**Google Play Data Safety** forms, derived from Potraces' real data flows. Under-declaring is a
rejection; this is what to tick so the labels match the code.

## Ground rules (apply to every row)
- **No tracking / no advertising.** ATT + AD_ID were removed. In Apple's form answer **"Data is NOT used to track you"** for everything. In Play, the Advertising-ID question = **No**.
- **Encrypted in transit:** Yes (everything goes over HTTPS/TLS).
- **Account & data deletion available:** Yes — in-app (Account → Delete account) **and** web URL `https://jejakbaki.my/delete-account.html`. Enter that URL in Play's "Data deletion" field.
- **Google Gemini is a service-provider/processor**, not a data sale. It receives content to transcribe/read and is instructed not to retain it for training. In Play this is "processed by a service provider," not "shared." Apple has no separate "processor" toggle — you still declare the data type as *collected*.
- **Personal cloud sync is OFF by default + opt-in.** Personal data only leaves the device if the user turns on Cloud Backup. Seller data syncs whenever the user is in business mode. Declare the data types regardless (the capability exists), but this is the honest nuance if asked.
- **Sentry is installed but never initialized** → no diagnostics/crash data leaves the device today. **Do not** declare Diagnostics. (If you wire Sentry later, add "Crash logs / Diagnostics" and re-submit.)
- **Stripe Tap to Pay ships OFF** (flag disabled) → no payment-card data collected in v1. Don't declare it until you enable it.

---

## Apple — App Privacy (Nutrition Label)

For each: **Collected = Yes**, **Linked to the user = Yes** (everything is tied to the account when signed in), **Used for tracking = No**.

| Apple data type | Collected | Purpose | Where it goes |
|---|---|---|---|
| **Other Financial Info** (transaction amounts, balances, debts, budgets, savings) | Yes | App Functionality | Supabase (if backup on); Google Gemini (when asking Echo / scanning) |
| **Contacts** (name + phone of a picked contact for a split / seller customer) | Yes | App Functionality | Supabase (if backup on / business mode) |
| **Photos or Videos** (receipt images for scanning) | Yes | App Functionality | Google Gemini (to read the receipt) |
| **Audio Data** (voice recordings for Echo) | Yes | App Functionality | Google Gemini (to transcribe) |
| **Other User Content** (notes, free text typed to Echo) | Yes | App Functionality | Google Gemini; Supabase (if backup on) |
| **Name** (from Google/Apple sign-in) | Yes | App Functionality, Account | Supabase / sign-in provider |
| **Email Address** (from Google/Apple sign-in) | Yes | App Functionality, Account | Supabase / sign-in provider |
| **Phone Number** (phone sign-in; seller customer) | Yes | App Functionality, Account | Supabase |
| **User ID** (Supabase user id; push token) | Yes | App Functionality | Supabase |

> Everything above: **Not used for tracking. Not used for third-party advertising.**

---

## Google Play — Data Safety

Global answers: **Encrypted in transit = Yes** · **Users can request deletion = Yes** (give the web URL) · **Advertising ID collected = No**.
For each row: **Collected = Yes**. **"Shared" = No** for all (Gemini/Supabase are service providers acting on your behalf, not third parties you sell/share to).

| Play category → data type | Collected | Purpose |
|---|---|---|
| **Personal info → Name** | Yes | App functionality, Account management |
| **Personal info → Email address** | Yes | App functionality, Account management |
| **Personal info → Phone number** | Yes | App functionality, Account management |
| **Personal info → User IDs** | Yes | App functionality |
| **Financial info → Other financial info** (amounts, balances, debts) | Yes | App functionality |
| **Photos and videos → Photos** (receipts) | Yes | App functionality |
| **Audio → Voice or sound recordings** (Echo voice) | Yes | App functionality |
| **Contacts → Contacts** (picked contact for split / customer) | Yes | App functionality |
| **App activity → Other user-generated content** (notes, Echo text) | Yes | App functionality |

> Do NOT declare: Location, Health/fitness, Web browsing, Calendar, Advertising data, Diagnostics/crash logs (Sentry is dormant), Payment info (Tap to Pay is off in v1).

---

## What still needs your hands (cannot be done in code)
1. **Publish the site** — `site/privacy.html` + `site/delete-account.html` to jejakbaki.my; verify both URLs load.
2. **Enter the two forms above** in App Store Connect (App Privacy) and Play Console (Data Safety); paste the deletion URL.
3. **EAS rebuild** — native config changed (2 plugins removed, privacy manifest added).
4. **Before actually submitting:** resolve the deferred blockers **B1 (premium → IAP)** and **B3 (Tap to Pay entitlement)**.
