# Potraces — Quick Start

## Prerequisites

- Node.js 18+ (`node --version`)
- npm (`npm --version`)

## Setup

```bash
git clone https://github.com/zafranzamani99-ui/Potraces.git
cd Potraces
npm install
```

Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

## Run

```bash
npx expo start
```

- **Physical device**: Install Expo Go, scan QR code
- **iOS Simulator**: Press `i`
- **Android Emulator**: Press `a`

## First Steps

### Personal Mode (default)

1. **Add a transaction** — tap the + tab, enter amount + category
2. **Create a budget** — Budget tab → Create Budget
3. **Scan a receipt** — Debt tab → Scan Receipt (needs Gemini API key)
4. **Split a bill** — after scanning, assign items to people

### Seller Mode

1. **Switch mode** — Settings → toggle to Seller
2. **Sign up** — phone + password via Supabase auth
3. **Add products** — Manage tab → Products → +
4. **Create an order** — New Order tab → pick customer + items
5. **Start a season** — Manage → Seasons → Start new season

## Common Fixes

```bash
# Metro bundler stuck
npx expo start --clear

# Module not found
rm -rf node_modules && npm install

# Expo cache issues
npx expo start -c
```

## Project Structure

```
src/
  screens/
    personal/    — Dashboard, ExpenseEntry, Transactions, Reports
    seller/      — Dashboard, NewOrder, OrderList, Products, Customers
    shared/      — Settings, DebtTracking
  store/         — Zustand stores (personalStore, sellerStore, debtStore, etc.)
  services/      — Gemini client, receipt scanner, Supabase sync
  components/    — Reusable UI (Button, TransactionItem, WalletPicker)
  constants/     — CALM palette, SPACING, TYPOGRAPHY, BIZ colors
  types/         — TypeScript interfaces
docs/            — Checklists, audits, planning docs
supabase/        — Migrations, Edge Functions
```
