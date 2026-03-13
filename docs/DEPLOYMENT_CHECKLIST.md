# Potraces — Production Deployment Checklist

**Last Updated:** 13 March 2026

---

## Environment Variables

```bash
# AI — Gemini 2.5 Flash (receipt scanning + spending mirror + money chat)
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Supabase (seller mode sync + order link)
EXPO_PUBLIC_SUPABASE_URL=https://iydqeeonaljqapulboaz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Billing note:** Free tier = 250 RPD shared across all AI features. For 50+ users, enable Paid Tier 1 in Google AI Studio (RM 20 spend cap recommended).

---

## EAS Build

```bash
# Project: owner zafranzamani, projectId 48e7d14d-4320-467b-a02a-72d41a4d33d9
eas build --platform android --profile preview   # APK for testing
eas build --platform ios --profile preview        # TestFlight
eas build --platform android --profile production # Play Store
```

OTA updates configured via `updates.url` in app.json.

---

## Test All Critical Flows

### Personal Mode
- [ ] Dashboard loads with transactions + spending mirror
- [ ] Add expense / income (with wallet deduction)
- [ ] Create budget, verify budget impact alerts
- [ ] Scan receipt → split wizard (16-item mamak receipt)
- [ ] Draft split: save partial assignments, resume later
- [ ] Debt tracking: create, pay, edit (audit trail)
- [ ] AI Money Chat: "berapa habis makan bulan ni?"
- [ ] Wallet transfers

### Seller Mode
- [ ] Auth: phone + password sign up/in, Telegram OTP
- [ ] Dashboard: urgency alerts, TO MAKE checklist
- [ ] New Order: manual + WhatsApp import
- [ ] Products: add, edit, active/inactive toggle
- [ ] Customers: derived from orders, phone contact import
- [ ] Season: start, track costs, end, transfer to personal
- [ ] Order web page: `https://potraces.vercel.app/?slug={slug}`
- [ ] Supabase sync: pull-before-push, realtime order link orders

### Shared
- [ ] Mode switch (personal ↔ seller)
- [ ] Settings: categories, units, currency
- [ ] Debt/Split screen: receipt scan, item assignment, draft save

---

## Security Checklist

- [ ] `.env` excluded from git (`.gitignore` has `.env*`)
- [ ] Firebase keys gitignored (`*firebase-adminsdk*`)
- [ ] No hardcoded API keys in source
- [ ] Supabase RLS policies active (seller_orders_owner + seller_orders_link_read)
- [ ] Input validation on financial amounts

---

## Known Limitations

1. **Export**: CSV/XLSX export not yet implemented — data is local + Supabase
2. **Push Notifications**: Registered but no server-side triggers yet
3. **Offline-first**: Personal mode is fully offline. Seller mode needs network for sync
4. **Receipt Scanner**: Gemini free tier shared across all AI — may hit 429 under heavy use
5. **Recurring Splits**: One-time only — no monthly recurring split mechanism

---

## Pre-Submission

- [ ] All critical flows tested on real device
- [ ] Performance profiled on low-end Android
- [ ] Console.warn/log cleaned (search: `console.log`)
- [ ] App icons and splash screen finalized
- [ ] Privacy policy URL configured in app.json
- [ ] EAS build succeeds for both platforms
