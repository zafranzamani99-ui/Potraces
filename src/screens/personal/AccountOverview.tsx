import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
  addDays,
} from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { useSavingsStore } from '../../store/savingsStore';
import {
  CALM,
  TYPE,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  withAlpha,
} from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import Card from '../../components/common/Card';
import ProgressBar from '../../components/common/ProgressBar';
import { lightTap } from '../../services/haptics';

const AccountOverview: React.FC = () => {
  const navigation = useNavigation<any>();
  const { transactions, subscriptions, budgets } = usePersonalStore();
  const { debts } = useDebtStore();
  const currency = useSettingsStore((s) => s.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const savingsAccounts = useSavingsStore((s) => s.accounts);
  const expenseCategories = useCategories('expense');

  // ── Compute stats ──
  const data = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));

    // Current month
    const monthTx = transactions.filter((t) =>
      isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );
    const income = monthTx
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const net = income - expenses;
    const txCount = monthTx.length;

    // Previous month (for comparison)
    const prevTx = transactions.filter((t) =>
      isWithinInterval(t.date, { start: prevStart, end: prevEnd })
    );
    const prevIncome = prevTx
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const prevExpenses = prevTx
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const incomeChange =
      prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0;
    const expenseChange =
      prevExpenses > 0
        ? ((expenses - prevExpenses) / prevExpenses) * 100
        : 0;

    // Spending by category (top 5)
    const categoryMap: Record<string, number> = {};
    monthTx
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
      });
    const topCategories = Object.entries(categoryMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amount]) => {
        const catInfo = expenseCategories.find((c) => c.id === cat);
        return {
          id: cat,
          name: catInfo?.name || cat,
          icon: (catInfo?.icon || 'tag') as keyof typeof Feather.glyphMap,
          color: catInfo?.color || CALM.textSecondary,
          amount,
          percent: expenses > 0 ? (amount / expenses) * 100 : 0,
        };
      });

    // Wallets
    const totalWalletBalance = wallets.reduce((s, w) => s + w.balance, 0);

    // Budgets
    const totalAllocated = budgets.reduce((s, b) => s + b.allocatedAmount, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spentAmount, 0);
    const budgetUtilization =
      totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;
    const overBudgetCount = budgets.filter(
      (b) => b.spentAmount > b.allocatedAmount
    ).length;

    // Subscriptions
    const activeSubs = subscriptions.filter((s) => s.isActive);
    const monthlySubsCost = activeSubs.reduce((sum, sub) => {
      if (sub.billingCycle === 'weekly') return sum + sub.amount * 4;
      if (sub.billingCycle === 'yearly') return sum + sub.amount / 12;
      return sum + sub.amount;
    }, 0);

    // Upcoming bills
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcomingBills = subscriptions.filter(
      (sub) =>
        sub.isActive &&
        isWithinInterval(sub.nextBillingDate, {
          start: today,
          end: addDays(today, 8),
        })
    );

    // Debts
    const personalDebts = debts.filter((d) => d.mode === 'personal');
    const youOwe = personalDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
    const owedToYou = personalDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
    const activeDebtCount = personalDebts.filter(
      (d) => d.status !== 'settled'
    ).length;

    // Savings rate
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    // Savings / Investments
    const totalSavingsValue = savingsAccounts.reduce((s, a) => s + a.currentValue, 0);
    const totalSavingsInvested = savingsAccounts.reduce((s, a) => s + a.initialInvestment, 0);
    const savingsGain = totalSavingsValue - totalSavingsInvested;
    const savingsReturn = totalSavingsInvested > 0 ? (savingsGain / totalSavingsInvested) * 100 : 0;

    return {
      income,
      expenses,
      net,
      txCount,
      incomeChange,
      expenseChange,
      topCategories,
      totalWalletBalance,
      totalAllocated,
      totalSpent,
      budgetUtilization,
      overBudgetCount,
      activeSubs,
      monthlySubsCost,
      upcomingBills,
      youOwe,
      owedToYou,
      activeDebtCount,
      savingsRate,
      totalSavingsValue,
      totalSavingsInvested,
      savingsGain,
      savingsReturn,
    };
  }, [transactions, subscriptions, budgets, debts, wallets, savingsAccounts]);

  const navigateRoot = (screen: string) => {
    lightTap();
    navigation.navigate(screen);
  };

  const navigateTab = (screen: string) => {
    lightTap();
    navigation.navigate('PersonalMain', { screen });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero: Net Worth / Balance (bordered card, no gradient) ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>
          {wallets.length > 0 ? 'Total Net Worth' : 'Monthly Balance'}
        </Text>
        <Text style={styles.heroAmount}>
          {currency}{' '}
          {(wallets.length > 0
            ? data.totalWalletBalance
            : data.net
          ).toFixed(2)}
        </Text>
        <Text style={styles.heroDate}>
          {format(new Date(), 'MMMM yyyy')}
        </Text>

        {/* Mini stats row */}
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <View style={[styles.heroStatDot, { backgroundColor: withAlpha(CALM.positive, 0.15) }]}>
              <Feather name="arrow-down" size={10} color={CALM.positive} />
            </View>
            <Text style={styles.heroStatLabel}>Income</Text>
            <Text style={styles.heroStatValue}>
              {currency} {data.income.toFixed(2)}
            </Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <View style={[styles.heroStatDot, { backgroundColor: withAlpha(CALM.textPrimary, 0.1) }]}>
              <Feather name="arrow-up" size={10} color={CALM.textPrimary} />
            </View>
            <Text style={styles.heroStatLabel}>Expenses</Text>
            <Text style={styles.heroStatValue}>
              {currency} {data.expenses.toFixed(2)}
            </Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <View style={[styles.heroStatDot, { backgroundColor: withAlpha(CALM.accent, 0.15) }]}>
              <Feather name="percent" size={10} color={CALM.accent} />
            </View>
            <Text style={styles.heroStatLabel}>Saved</Text>
            <Text style={styles.heroStatValue}>
              {data.savingsRate.toFixed(0)}%
            </Text>
          </View>
        </View>
      </View>

      {/* ── Month-over-Month Comparison ── */}
      <View style={styles.row}>
        <View style={styles.comparisonCard}>
          <View style={[styles.comparisonInner, { backgroundColor: withAlpha(CALM.positive, 0.06) }]}>
            <View style={[styles.comparisonIcon, { backgroundColor: withAlpha(CALM.positive, 0.12) }]}>
              <Feather name="trending-up" size={16} color={CALM.positive} />
            </View>
            <Text style={styles.comparisonLabel}>Income</Text>
            <Text style={[styles.comparisonValue, { color: CALM.positive }]}>
              {currency} {data.income.toFixed(2)}
            </Text>
            {data.incomeChange !== 0 && (
              <View style={styles.changeBadge}>
                <Feather
                  name={data.incomeChange >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={10}
                  color={data.incomeChange >= 0 ? CALM.positive : CALM.neutral}
                />
                <Text
                  style={[
                    styles.changeText,
                    {
                      color:
                        data.incomeChange >= 0 ? CALM.positive : CALM.neutral,
                    },
                  ]}
                >
                  {Math.abs(data.incomeChange).toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.comparisonCard}>
          <View style={[styles.comparisonInner, { backgroundColor: withAlpha(CALM.textPrimary, 0.04) }]}>
            <View style={[styles.comparisonIcon, { backgroundColor: withAlpha(CALM.textPrimary, 0.08) }]}>
              <Feather name="trending-down" size={16} color={CALM.textPrimary} />
            </View>
            <Text style={styles.comparisonLabel}>Expenses</Text>
            <Text style={[styles.comparisonValue, { color: CALM.textPrimary }]}>
              {currency} {data.expenses.toFixed(2)}
            </Text>
            {data.expenseChange !== 0 && (
              <View style={styles.changeBadge}>
                <Feather
                  name={data.expenseChange <= 0 ? 'arrow-down' : 'arrow-up'}
                  size={10}
                  color={data.expenseChange <= 0 ? CALM.positive : CALM.neutral}
                />
                <Text
                  style={[
                    styles.changeText,
                    {
                      color:
                        data.expenseChange <= 0 ? CALM.positive : CALM.neutral,
                    },
                  ]}
                >
                  {Math.abs(data.expenseChange).toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Wallets ── */}
      {wallets.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateRoot('WalletManagement')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                <Feather name="credit-card" size={16} color={CALM.accent} />
              </View>
              <Text style={styles.sectionTitle}>Wallets</Text>
              <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
            </View>
            {wallets.map((w, i) => (
              <View
                key={w.id}
                style={[
                  styles.walletRow,
                  i < wallets.length - 1 && styles.walletRowBorder,
                ]}
              >
                <View
                  style={[
                    styles.walletIcon,
                    { backgroundColor: withAlpha(w.color, 0.15) },
                  ]}
                >
                  <Feather
                    name={w.icon as keyof typeof Feather.glyphMap}
                    size={14}
                    color={w.color}
                  />
                </View>
                <Text style={styles.walletName} numberOfLines={1}>
                  {w.name}
                </Text>
                {w.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
                <Text style={styles.walletBalance}>
                  {currency} {w.balance.toFixed(2)}
                </Text>
              </View>
            ))}
            <View style={styles.walletTotalRow}>
              <Text style={styles.walletTotalLabel}>Total</Text>
              <Text style={styles.walletTotalValue}>
                {currency} {data.totalWalletBalance.toFixed(2)}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Top Spending Categories ── */}
      {data.topCategories.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateRoot('TransactionsList')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                <Feather name="pie-chart" size={16} color={CALM.accent} />
              </View>
              <Text style={styles.sectionTitle}>Top Spending</Text>
              <Text style={styles.sectionSubtitle}>{data.txCount} transactions</Text>
            </View>
            {data.topCategories.map((cat, i) => (
              <View key={cat.id} style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <View style={styles.categoryBarTrack}>
                    <View
                      style={[
                        styles.categoryBarFill,
                        {
                          width: `${Math.min(cat.percent, 100)}%`,
                          backgroundColor: cat.color,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={styles.categoryAmount}>
                    {currency} {cat.amount.toFixed(2)}
                  </Text>
                  <Text style={styles.categoryPercent}>
                    {cat.percent.toFixed(0)}%
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Budget Utilization ── */}
      {budgets.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateTab('BudgetPlanning')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.neutral, 0.12) }]}>
                <Feather name="target" size={16} color={CALM.neutral} />
              </View>
              <Text style={styles.sectionTitle}>Budget</Text>
              <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
            </View>
            <ProgressBar
              current={data.totalSpent}
              total={data.totalAllocated}
              label="Overall Utilization"
              color={
                data.budgetUtilization > 100
                  ? CALM.neutral
                  : data.budgetUtilization > 80
                  ? CALM.neutral
                  : CALM.positive
              }
            />
            <View style={styles.budgetMeta}>
              <Text style={styles.budgetMetaText}>
                {budgets.length} budget{budgets.length > 1 ? 's' : ''}
              </Text>
              {data.overBudgetCount > 0 && (
                <View style={styles.overBudgetBadge}>
                  <Feather name="alert-triangle" size={11} color={CALM.neutral} />
                  <Text style={styles.overBudgetText}>
                    {data.overBudgetCount} over limit
                  </Text>
                </View>
              )}
            </View>
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Subscriptions + Upcoming Bills ── */}
      {data.activeSubs.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateRoot('SubscriptionList')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                <Feather name="repeat" size={16} color={CALM.accent} />
              </View>
              <Text style={styles.sectionTitle}>Subscriptions</Text>
              <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
            </View>

            <View style={styles.subsRow}>
              <View style={styles.subsStat}>
                <Text style={styles.subsStatValue}>{data.activeSubs.length}</Text>
                <Text style={styles.subsStatLabel}>Active</Text>
              </View>
              <View style={styles.subsStatDivider} />
              <View style={styles.subsStat}>
                <Text style={styles.subsStatValue}>
                  {currency} {data.monthlySubsCost.toFixed(2)}
                </Text>
                <Text style={styles.subsStatLabel}>Monthly Cost</Text>
              </View>
              <View style={styles.subsStatDivider} />
              <View style={styles.subsStat}>
                <Text style={[styles.subsStatValue, data.upcomingBills.length > 0 && { color: CALM.neutral }]}>
                  {data.upcomingBills.length}
                </Text>
                <Text style={styles.subsStatLabel}>Due Soon</Text>
              </View>
            </View>

            {data.upcomingBills.length > 0 && (
              <View style={styles.upcomingSection}>
                <Text style={styles.upcomingLabel}>Upcoming this week</Text>
                {data.upcomingBills.slice(0, 3).map((sub) => {
                  const daysUntil = Math.ceil(
                    (sub.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <View key={sub.id} style={styles.upcomingRow}>
                      <Text style={styles.upcomingName} numberOfLines={1}>
                        {sub.name}
                      </Text>
                      <Text style={styles.upcomingDays}>
                        {daysUntil <= 0 ? 'Today' : `${daysUntil}d`}
                      </Text>
                      <Text style={styles.upcomingAmount}>
                        {currency} {sub.amount.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Savings & Investments ── */}
      {savingsAccounts.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateRoot('SavingsTracker')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                <Feather name="trending-up" size={16} color={CALM.accent} />
              </View>
              <Text style={styles.sectionTitle}>Savings</Text>
              <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
            </View>

            <View style={styles.subsRow}>
              <View style={styles.subsStat}>
                <Text style={styles.subsStatValue}>{savingsAccounts.length}</Text>
                <Text style={styles.subsStatLabel}>Accounts</Text>
              </View>
              <View style={styles.subsStatDivider} />
              <View style={styles.subsStat}>
                <Text style={styles.subsStatValue}>
                  {currency} {data.totalSavingsValue.toFixed(2)}
                </Text>
                <Text style={styles.subsStatLabel}>Portfolio</Text>
              </View>
              <View style={styles.subsStatDivider} />
              <View style={styles.subsStat}>
                <Text style={[styles.subsStatValue, { color: data.savingsGain >= 0 ? CALM.positive : CALM.neutral }]}>
                  {data.savingsReturn >= 0 ? '+' : ''}{data.savingsReturn.toFixed(1)}%
                </Text>
                <Text style={styles.subsStatLabel}>Return</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Debts ── */}
      {(data.youOwe > 0 || data.owedToYou > 0) && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateRoot('DebtTracking')}
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBg, { backgroundColor: withAlpha(CALM.neutral, 0.12) }]}>
                <Feather name="users" size={16} color={CALM.neutral} />
              </View>
              <Text style={styles.sectionTitle}>Debts</Text>
              <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
            </View>

            <View style={styles.debtRow}>
              {data.youOwe > 0 && (
                <View style={styles.debtCard}>
                  <View style={[styles.debtInner, { backgroundColor: withAlpha(CALM.neutral, 0.06) }]}>
                    <Feather name="arrow-up-circle" size={18} color={CALM.neutral} />
                    <Text style={styles.debtLabel}>You Owe</Text>
                    <Text style={[styles.debtValue, { color: CALM.neutral }]}>
                      {currency} {data.youOwe.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
              {data.owedToYou > 0 && (
                <View style={styles.debtCard}>
                  <View style={[styles.debtInner, { backgroundColor: withAlpha(CALM.positive, 0.06) }]}>
                    <Feather name="arrow-down-circle" size={18} color={CALM.positive} />
                    <Text style={styles.debtLabel}>Owed to You</Text>
                    <Text style={[styles.debtValue, { color: CALM.positive }]}>
                      {currency} {data.owedToYou.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <Text style={styles.debtFooter}>
              {data.activeDebtCount} active debt{data.activeDebtCount !== 1 ? 's' : ''}
            </Text>
          </Card>
        </TouchableOpacity>
      )}

      {/* Bottom spacer */}
      <View style={{ height: SPACING['3xl'] }} />
    </ScrollView>
  );
};

// ── STYLES ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  content: {
    padding: SPACING['2xl'],
    gap: SPACING.lg,
  },

  // Hero (bordered card, no gradient)
  heroCard: {
    padding: SPACING['2xl'],
    borderRadius: RADIUS.xl,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    marginBottom: SPACING.xl,
  },
  heroRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  heroStatDot: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroStatValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  heroStatDivider: {
    width: 1,
    backgroundColor: CALM.border,
  },

  // Comparison cards
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  comparisonCard: {
    flex: 1,
  },
  comparisonInner: {
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  comparisonIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  comparisonLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 2,
  },
  comparisonValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: SPACING.xs,
  },
  changeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  sectionSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Wallets
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  walletRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  walletIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  defaultBadge: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
    textTransform: 'uppercase',
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  walletTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  walletTotalLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  walletTotalValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Category spending
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  categoryBarTrack: {
    height: 4,
    backgroundColor: CALM.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: 4,
    borderRadius: RADIUS.full,
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  categoryPercent: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Budget
  budgetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  budgetMetaText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  overBudgetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  overBudgetText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Subscriptions
  subsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  subsStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  subsStatValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  subsStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  subsStatDivider: {
    width: 1,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.xs,
  },
  upcomingSection: {
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.sm,
  },
  upcomingLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  upcomingName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  upcomingDays: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginRight: SPACING.sm,
  },
  upcomingAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Debts
  debtRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  debtCard: {
    flex: 1,
  },
  debtInner: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  debtLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  debtValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  debtFooter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

export default AccountOverview;
