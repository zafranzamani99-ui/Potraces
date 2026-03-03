# Potraces

A money app that doesn't make you feel bad about money.

Potraces is built for Malaysians who earn in different ways — salary, freelance, delivery rides, roadside stalls, home-based selling, or all of the above. It tracks what comes in and what goes out, and talks to you like a friend, not a financial advisor.

No "profit". No "loss". No "you should save more". Just honest numbers and calm observations.

---

## Current progress

### Done

- [x] Personal mode — dashboard, transactions, budgets, wallets, savings, subscriptions, debt tracking
- [x] Business mode — 6 income types with dynamic navigation per type
- [x] Seller mode — WhatsApp order parsing, order pipeline, products, seasons, season summary, customers with contact import
- [x] Stall mode — session-based POS, product grid, cart, QR/cash split, inventory, regular customers
- [x] Goals — savings targets with milestones, contributions, confetti on progress
- [x] Financial Pulse — wellness score, spending velocity, weekly patterns, no-spend streaks
- [x] Money Chat — plain-language Q&A about your spending, powered by Claude Haiku
- [x] Receipt scanner — Google Cloud Vision OCR
- [x] AI-powered transaction entry — text, voice, or photo parsed into structured transactions
- [x] CALM design system — anxiety-reducing palette, light typography, no red anywhere
- [x] 25 reusable components — cards, buttons, toasts, skeleton loaders, confetti, unit manager, etc.
- [x] Custom categories — add, rename, reorder, override default categories
- [x] Premium paywall — free tier with limits, RM10/month for unlimited
- [x] Transfer bridge — move money between business and personal with one tap
- [x] Debt & splits — track who owes who, split by equal/custom/item
- [x] Custom units — seller/stall product units (tin, balang, kotak, etc.)
- [x] Collapsible sections — reusable component with subtitle hints when collapsed
- [x] Context-aware settings — categories shown in personal mode, product units in seller/stall mode

### Not yet done

- [ ] Cloud sync for multi-device
- [ ] Export season summaries as shareable images
- [ ] Ingredient cost templates (so you don't re-enter tepung every time)
- [ ] Repeat order from past customers
- [ ] Dark mode
- [ ] Bahasa Malaysia full UI translation
- [ ] Google Docs sync (premium feature, UI exists but not connected)

---

## What this app does

### Personal Mode

Your daily money — salary, spending, subscriptions, savings.

- **Calm dashboard** — your balance in large, quiet type. A week timeline. Insight strip with transaction count, spending velocity, and top category. Quick actions modal. Collapsible details section for bills, budgets, and recent transactions.
- **Financial Pulse** — wellness score (0–100) based on budget adherence, savings rate, consistency, and goal progress. Spending velocity compared to last month. Weekly spending patterns. No-spend streak. Upcoming bills. All non-judgmental.
- **Goals** — set savings targets with deadlines, icons, and colors. Track contributions. Milestones at 25/50/75/100% with confetti when you cross them. Max 10 active goals.
- **Smart transaction entry** — type "nasi lemak 8.50", take a photo of a receipt, or speak it. AI parses it into a transaction. You confirm and save.
- **Money Chat** — ask questions about your spending in plain language. "Where does most of my money go?" "Am I spending more this month?" Powered by Claude Haiku.
- **Commitments** — subscriptions and installments tracked with gentle renewal reminders. No overdue warnings in red.
- **Budget planning** — set limits by category. When you're close, it says "getting close", not "danger".
- **Wallets** — separate balances for cash, bank, e-wallet. Move money between them.
- **Savings tracker** — TNG+, ASB, robo-advisors, crypto. Log snapshots of value over time.
- **Debt & splits** — track who owes who. Split bills by equal, custom, or by item.
- **Receipt scanner** — Google Cloud Vision OCR extracts items and total from receipt photos.
- **Reports** — spending by category, trends over time. No judgment.

### Business Mode

Your earnings — however they come in. The app adapts to how you actually work.

When you first enter business mode, you pick your income type. The entire interface changes to match:

| Income type | Who it's for | What changes |
|---|---|---|
| **Seller** | Home-based food sellers, kuih makers | Orders, products, seasons, WhatsApp parsing |
| **Stall** | Roadside sellers, pasar malam vendors | Session-based POS, product grid, QR/cash, regulars |
| **Freelance** | Designers, writers, tutors | Client tracking, payment history, averages |
| **Part-time** | Workers with a main job + side income | Main vs side split, stream tracking |
| **Rider** | Grab, Foodpanda, Lalamove riders | Gross vs costs (petrol, maintenance), net kept |
| **Mixed** | Multiple income streams | Color-coded streams, combined total |

**The bottom navigation changes per income type.** A seller sees Orders / New Order / Products / Seasons. A stall seller sees History / Sell / Regulars. A rider sees Costs / Log Income / Reports. Each setup gets exactly the tabs it needs.

#### Seller Mode (WhatsApp order-based)

Built for the mak cik who takes Raya orders on WhatsApp and makes kuih from her kitchen.

- **WhatsApp order parsing** — paste a message like "nak order semperit kuning 2 tin dan jem tart 1 tin" and it becomes a structured order. Local Malay-aware parser tries first, AI fallback if needed.
- **Order pipeline** — pending > confirmed > ready > delivered > paid. Track every order's status.
- **Products** — your catalog of things you make. Price per unit, cost per unit, "kept per unit" calculated automatically. Log ingredient costs directly.
- **Seasons** — Raya, CNY, Deepavali, or any peak period. Start a season, track all orders and costs within it, end it when it's done.
- **Season summary** — shows what you kept in large type, how many orders you fulfilled, how many customers trusted your food. Speaks to the work you put in. Detailed cost breakdown, product performance, and daily trend chart.
- **Customers** — derived from order history. Search, sort, filter by outstanding/repeat. Import from phone contacts. Edit name, phone, address, notes. Tap to call or WhatsApp.
- **Unpaid tracking** — how many orders are still unpaid and how much is pending. No shame, just numbers.

#### Stall Mode (session-based POS)

Built for the abang who sets up a stall at pasar malam and sells nasi lemak by the roadside.

- **Session workflow** — start a session > sell > close. Each session is a self-contained record of what happened.
- **POS sell screen** — product grid with quantities, collapsible cart, QR or cash toggle, discount support.
- **Inventory tracking** — set starting quantity per product when you open, auto-decrements on each sale.
- **Session summary** — total revenue, cash vs QR split, product breakdown, duration, revenue per hour. AI observation about your session.
- **Session history** — browse past sessions with revenue, date, and condition (good/slow/rainy/hot).
- **Regular customers** — track frequent buyers by name, usual order, visit count, and last visit.
- **Transfer to personal** — mark session earnings as transferred to your personal wallet.

#### Shared business features

- **Log income** — text or voice input, AI parsed. After saving, a gentle prompt to transfer some to personal (auto-dismisses).
- **Money Chat** — works in business mode too. "How was this month compared to last?" "Can I afford a new phone?" AI understands irregular income.
- **AI insights** — one passive observation about your month. "Slower than last month. That happens." "Weekends were your strongest days." Never advice, never "you should".
- **Transfer bridge** — move money from business to personal wallet with one tap.

---

## Design philosophy

**Calm, not anxious.** The app uses the CALM palette — warm off-white background (`#F9F9F7`), olive accent (`#4F5104`), calm green for income (`#2E7D5B`). No red for expenses. No danger colors. Amounts are shown in large, light type (48px, weight 200) — meant to be read, not feared.

**Honest, not preachy.** The AI never says "you should", "you must", or "discipline". It observes. "Most of your money went to food." "Quieter than last time. That happens between seasons." If your month was slow, it normalizes it instead of alarming you.

**Malaysian context.** RM currency. Malay language support in WhatsApp parsing and voice input (ms-MY primary, en-MY alternate). Categories that make sense here — nasi lemak, not avocado toast.

**Language rules (non-negotiable):**
- Never use: profit, loss, revenue, ROI, inventory
- Always use: kept, came in, went out, costs, products

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript |
| State | Zustand with immer + AsyncStorage persistence |
| Navigation | React Navigation 7 (Stack + Bottom Tabs) |
| AI | Claude Haiku via Anthropic REST API |
| OCR | Google Cloud Vision |
| Speech | Google Cloud Speech-to-Text |
| Voice recording | expo-audio |
| Animations | react-native-reanimated |
| Charts | react-native-chart-kit |
| Haptics | expo-haptics |
| Date handling | date-fns |
| Icons | Feather (via @expo/vector-icons) |

---

## Project structure

```
src/
├── components/
│   ├── common/              # AnimatedNumber, Button, Card, CategoryManager,
│   │                        # CategoryPicker, CollapsibleSection, Confetti,
│   │                        # ContactPicker, EmptyState, ErrorBoundary,
│   │                        # ErrorState, FAB, GlassCard, GradientButton,
│   │                        # HeroCard, ModeToggle, PaywallModal, ProgressBar,
│   │                        # SkeletonLoader, StatCard, Toast, TransactionItem,
│   │                        # UnitManager, WalletPicker, WeekBar
│   └── navigation/          # CustomTabBar
├── constants/
│   ├── index.ts             # CALM palette, TYPE scale, SPACING, categories
│   ├── gradients.ts         # 20+ gradient configs
│   └── premium.ts           # Free vs premium tier limits
├── hooks/
│   └── useFinancialInsights.ts  # Wellness score, velocity, streaks
├── navigation/
│   ├── RootNavigator.tsx    # Stack navigator (all routes)
│   ├── PersonalNavigator.tsx # Personal bottom tabs
│   └── BusinessNavigator.tsx # Dynamic bottom tabs per income type
├── screens/
│   ├── personal/            # Dashboard, ExpenseEntry, MoneyChat,
│   │                        # BudgetPlanning, SubscriptionList, Reports,
│   │                        # TransactionsList, WalletManagement,
│   │                        # SavingsTracker, AccountOverview,
│   │                        # FinancialPulse, Goals
│   ├── business/            # Dashboard, Setup, LogIncome, ClientList,
│   │                        # RiderCosts, IncomeStreams, Reports,
│   │                        # CRM, Inventory, POS, SupplierList
│   ├── stall/               # Dashboard, SellScreen, SessionSetup,
│   │                        # CloseSession, SessionSummary, SessionHistory,
│   │                        # StallProducts, RegularCustomers
│   ├── seller/              # Dashboard, NewOrder, OrderList, Products,
│   │                        # SeasonSummary, PastSeasons, Customers
│   └── shared/              # Settings, DebtTracking, ReceiptScanner
├── services/
│   ├── aiService.ts         # Claude Haiku: parse text, receipts,
│   │                        # WhatsApp orders, money Q&A
│   ├── ocrService.ts        # Google Vision OCR
│   └── speechService.ts     # Google Speech-to-Text
├── store/
│   ├── appStore.ts          # Mode toggle (personal/business)
│   ├── personalStore.ts     # Transactions, subscriptions, budgets,
│   │                        # wallets, savings, goals
│   ├── businessStore.ts     # Income type, business transactions,
│   │                        # clients, rider costs, streams, transfers
│   ├── sellerStore.ts       # Products, orders, seasons, ingredient costs
│   ├── stallStore.ts        # Sessions, sales, stall products, regulars
│   ├── categoryStore.ts     # Custom categories, overrides, ordering
│   └── settingsStore.ts     # User preferences, premium status
├── utils/
│   ├── enrichTransaction.ts    # Time/day/size/frequency/emotional context
│   ├── explainMonth.ts         # Personal month insights
│   ├── explainBusinessMonth.ts # Business month insights
│   ├── explainSellerMonth.ts   # Seller month insights
│   ├── explainStallSession.ts  # Stall session AI observations
│   ├── explainStallHistory.ts  # Stall lifetime AI observations
│   ├── parseWhatsAppOrder.ts   # Local Malay-aware WhatsApp parser
│   ├── calculateBuffer.ts      # "X months covered" from savings
│   └── transferBridge.ts       # Business > personal transfer helper
└── types/
    └── index.ts             # All TypeScript definitions
```

---

## Setup

```bash
# Clone
git clone https://github.com/zafranzamani99-ui/Potraces.git
cd Potraces

# Install
npm install

# Environment variables (create .env)
EXPO_PUBLIC_ANTHROPIC_API_KEY=your_claude_api_key
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=your_vision_api_key
EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY=your_speech_api_key

# Run
npm start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

The app works without API keys — AI features (text parsing, receipt scanning, voice input, Money Chat) will gracefully return empty and let you enter things manually.

---

## Who this is for

Malaysians who:
- Earn irregularly and are tired of apps that assume a steady paycheck
- Sell kuih from home and track orders on WhatsApp
- Set up a stall at pasar malam and want to know what they kept after each session
- Ride for Grab and want to know what they actually keep after petrol
- Freelance and juggle multiple clients with different payment timelines
- Just want to see their money without feeling bad about it

---

Built with care for people whose relationship with money is complicated. Because most people's is.
