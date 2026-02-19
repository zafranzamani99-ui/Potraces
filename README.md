# FinFlow - Dual-Mode Finance Management

A React Native mobile application that seamlessly combines **Personal Finance Management** and **Business POS System** in one app. Perfect for individuals managing their personal finances and small business owners (especially street vendors and market sellers) who need a simple, fast point-of-sale system.

## Features

### Personal Mode

- **Dashboard**: Balance overview, upcoming bills, budget status, and recent transactions
- **Expense Tracking**: Quick transaction entry with categories, tags, and notes
- **Subscription Manager**: Track recurring expenses with renewal reminders
- **Budget Planning**: Category-based budgets with progress tracking and overspend alerts
- **Reports**: Visual analytics with charts showing spending trends and category breakdowns

### Business Mode

- **POS Dashboard**: Today's sales total, payment method breakdown, and inventory alerts
- **Point of Sale**: Large-button interface optimized for quick sales with offline support
- **Supplier Management**: Track supplier contacts, purchase history, and payment terms
- **Inventory**: Product management with stock levels and low-stock alerts
- **Business Reports**: Sales analytics, top-selling products, and profit margins

### Shared Features

- **Mode Toggle**: Easy switch between Personal and Business modes
- **Separate Wallets**: Personal and business finances kept distinct
- **Offline Support**: All data stored locally with AsyncStorage
- **Visual Analytics**: Charts and graphs for both personal and business data

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **State Management**: Zustand with persistence
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **Charts**: React Native Chart Kit
- **Storage**: AsyncStorage
- **Icons**: Expo Vector Icons (Feather)
- **Date Handling**: date-fns

## Project Structure

```
FinFlow/
├── src/
│   ├── components/
│   │   └── common/           # Reusable UI components
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── CategoryPicker.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ModeToggle.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── StatCard.tsx
│   │       └── TransactionItem.tsx
│   ├── constants/
│   │   └── index.ts          # Colors, categories, config
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── PersonalNavigator.tsx
│   │   └── BusinessNavigator.tsx
│   ├── screens/
│   │   ├── personal/         # Personal finance screens
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ExpenseEntry.tsx
│   │   │   ├── SubscriptionList.tsx
│   │   │   ├── BudgetPlanning.tsx
│   │   │   └── Reports.tsx
│   │   └── business/         # Business POS screens
│   │       ├── Dashboard.tsx
│   │       ├── POS.tsx
│   │       ├── SupplierList.tsx
│   │       ├── Inventory.tsx
│   │       └── Reports.tsx
│   ├── store/
│   │   ├── appStore.ts       # App mode state
│   │   ├── personalStore.ts  # Personal finance state
│   │   └── businessStore.ts  # Business state
│   └── types/
│       └── index.ts          # TypeScript definitions
├── App.tsx                   # Entry point
├── app.json                  # Expo configuration
├── package.json
├── tsconfig.json
└── babel.config.js
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac only) or Android Studio (for Android emulator)
- Expo Go app on your physical device (optional)

### Setup Instructions

1. **Clone or navigate to the project directory**:
   ```bash
   cd FinFlow
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Run on your device**:
   - **iOS Simulator** (Mac only): Press `i` in the terminal
   - **Android Emulator**: Press `a` in the terminal
   - **Physical Device**: Scan the QR code with Expo Go app

## Usage Guide

### Getting Started

1. **Launch the app** - You'll start in Personal Mode by default
2. **Toggle modes** - Use the mode switcher at the top to switch between Personal and Business

### Personal Mode Workflow

1. **Add Transactions**: Use the "Add Expense" tab to record income or expenses
2. **Track Subscriptions**: Add your recurring subscriptions (Netflix, Spotify, etc.)
3. **Set Budgets**: Create category budgets to control spending
4. **View Reports**: Check your spending patterns and trends

### Business Mode Workflow

1. **Add Products**: Go to Inventory and add your products with prices and stock
2. **Make Sales**: Use the POS tab to quickly process sales
3. **Track Suppliers**: Add supplier information for restocking
4. **Monitor Performance**: Check Reports for sales analytics

## Key Features Explained

### Offline-First Architecture

All data is stored locally using AsyncStorage with Zustand persistence middleware. This means:
- The app works without internet connection
- Data persists between app restarts
- Fast performance with no network delays

### Smart Budget Tracking

Budgets automatically calculate spent amounts based on transactions in the same category and period. Visual progress bars show spending status with color-coded warnings.

### Low Stock Alerts

The inventory system tracks stock levels and alerts you when products are running low or out of stock, helping prevent missed sales.

### Dual-Mode Design

Separate state management for Personal and Business ensures your personal finances never mix with business transactions, maintaining clear financial boundaries.

## Customization

### Changing Colors

Edit `src/constants/index.ts` to customize the color scheme:

```typescript
export const COLORS = {
  primary: '#6366F1',    // Your primary color
  secondary: '#10B981',  // Your secondary color
  // ... other colors
};
```

### Adding Categories

Add new expense or product categories in `src/constants/index.ts`:

```typescript
export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'custom', name: 'Custom Category', icon: 'star', color: '#FF6B6B' },
  // ... existing categories
];
```

### Adjusting Low Stock Threshold

Modify the default threshold in `src/constants/index.ts`:

```typescript
export const APP_CONFIG = {
  lowStockThreshold: 10,  // Change this value
  // ... other config
};
```

## Future Enhancements

### Planned Features

- [ ] Cloud sync (Firebase/Supabase integration)
- [ ] Receipt scanning with OCR
- [ ] Multi-currency support
- [ ] Export reports to PDF/Excel
- [ ] QR code payment integration
- [ ] Multi-user/employee accounts
- [ ] Advanced analytics with AI insights
- [ ] Backup and restore functionality
- [ ] Dark mode support
- [ ] Biometric authentication

### Payment Gateway Integration

For production use, consider integrating:
- **Malaysia**: FPX, Touch 'n Go eWallet, GrabPay
- **Global**: Stripe, PayPal, Square
- **Crypto**: Bitcoin, Ethereum (for tech-savvy users)

## Contributing

This is a personal project, but suggestions and feedback are welcome! If you find bugs or have feature requests, please document them clearly.

## Troubleshooting

### Common Issues

**App won't start**:
```bash
npm install
npx expo start --clear
```

**Metro bundler issues**:
```bash
rm -rf node_modules
npm install
```

**TypeScript errors**:
```bash
npx tsc --noEmit
```

**Storage not persisting**:
- Check if AsyncStorage is properly linked
- Clear app data and restart

## License

MIT License - Feel free to use this project for personal or commercial purposes.

## Credits

Built with React Native, Expo, and Zustand. Charts powered by React Native Chart Kit.

---

**Made for individuals and small business owners who want simple, effective financial management.**
