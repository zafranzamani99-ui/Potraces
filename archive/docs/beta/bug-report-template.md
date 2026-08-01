# Potraces Beta — Bug Report Template & Field Spec

This file has two parts:
1. **Copy-paste template** testers use in the WhatsApp group (pin the short version).
2. **Field spec** for the in-app "Send beta feedback" Settings row (the one structured path we build).

The completion bar accepts a report sent **either** way (WhatsApp **or** in-app). Every bug should arrive
with a screenshot of the **Settings version line** so we know which build it came from.

---

## 1. Copy-paste template (WhatsApp)

**Short version (pin this in the group):**
```
[Screen] :
What I tapped :
What I expected :
What happened :
+ screenshot (and a shot of the Settings version line)
```

**Full version (EN):**
```
Screen / area: (e.g. Wallet, Transactions, Receipt Scan, Notes/AI, Budget, Goals, Debts/Splits, Settings, Seller)
Severity: blocker (can't use) / major (broken, has a workaround) / minor (small) / idea
What I tapped (steps): 1) ... 2) ... 3) ...
What I expected:
What actually happened:
Happens: every time / sometimes / once
My phone: (brand + model)
Android version:
Build (from Settings version line): 
Screenshot: (attach)
```

**Full version (BM):**
```
Skrin / bahagian: (cth Wallet, Transactions, Scan Resit, Notes/AI, Budget, Goals, Hutang/Split, Settings, Seller)
Tahap: blocker (tak boleh guna) / major (rosak tapi ada jalan) / minor (remeh) / idea (cadangan)
Aku tekan apa (langkah): 1) ... 2) ... 3) ...
Apa yang aku jangka:
Apa yang sebenarnya jadi:
Jadi bila: setiap kali / kadang-kadang / sekali je
Phone aku: (brand + model)
Versi Android:
Build (dari baris version dalam Settings):
Screenshot: (lampirkan)
```

---

## 2. Field spec — in-app "Send beta feedback" row

Kept deliberately small: **5 fields** (not 17). Three are auto-captured so the tester only fills two.
Inserts to the Supabase `beta_feedback` table via the existing supabase client (see `beta_feedback.sql`).

| Field | Type | Required | Source | Notes |
|---|---|---|---|---|
| `severity` | enum | yes | tester picks | `blocker` / `major` / `minor` / `idea`. Bilingual labels (no red — `blocker` uses bronze/gold emphasis). |
| `message` | text | yes | tester types | "What happened" — what they tapped, expected, and saw. Placeholder bilingual: *"Apa jadi? Tekan apa, jangka apa, jadi apa / What happened?"* |
| `screen` | text | no | tester types | Which screen/area (free text or a quick pill list of feature names). |
| `build_id` | text | yes | **auto** | From `Constants.expoConfig.version` + versionCode + `Updates.updateId`/`channel`. Locked/read-only. |
| `device` | text | no | **auto** | `expo-device` → `Device.modelName` + OS version. Editable hint, not load-bearing. |

**Bilingual severity labels (no alarm red anywhere):**

| value | EN | BM helper |
|---|---|---|
| `blocker` | Blocker — can't use | tak boleh guna |
| `major` | Major — broken, has a workaround | rosak tapi ada jalan |
| `minor` | Minor | remeh |
| `idea` | Idea / suggestion | cadangan |

**Consent:** the in-app row sits behind the first-launch PDPA acknowledgement, so a separate per-submit
consent checkbox is not needed inside the app. (If you ever expose this outside the beta, add one.)

**Deliberately NOT built (scope cut for 3 testers):** a public web form, a screenshot-upload bucket,
`expected`/`actual` split fields, an `area` enum, `reproducible` enum, `app_version` param, a persistent
`device_id`, honeypot, and client rate-limit/cooldown. Testers paste screenshots into WhatsApp; the
founder triages there. The Supabase table keeps the extra columns nullable for future use, but the in-app
row only sends these five.

---

## 3. Founder triage mapping

Each report (WhatsApp or in-app) becomes one row in the tracking sheet "Bugs" tab with a severity:

- **P0** = `blocker` that crashes on open / loses data / blocks a core flow → fix now (OTA if JS-only).
- **P1** = `major` core flow broken but usable → fix this week / next build.
- **P2** = `minor` with a workaround → batch for next build.
- **P3** = cosmetic / copy / `idea` → log, fix opportunistically.
