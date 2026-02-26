import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';

const screenWidth = Dimensions.get('window').width;

const PersonalReports: React.FC = () => {
  const { transactions, subscriptions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const expenseCategories = useCategories('expense');

  const categoryData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthlyExpenses = transactions.filter(
      (t) =>
        t.type === 'expense' &&
        isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );

    const categoryTotals: { [key: string]: number } = {};
    monthlyExpenses.forEach((t) => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    return Object.entries(categoryTotals)
      .map(([category, amount]) => {
        const cat = expenseCategories.find((c) => c.id === category);
        return {
          name: cat?.name || category,
          amount,
          color: cat?.color || COLORS.chart1,
          legendFontColor: COLORS.text,
          legendFontSize: 12,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions, expenseCategories]);

  const trendData = useMemo(() => {
    const months = [];
    const expenseData = [];
    const incomeData = [];

    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthTransactions = transactions.filter((t) =>
        isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      );

      const income = monthTransactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = monthTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      months.push(format(date, 'MMM'));
      incomeData.push(income);
      expenseData.push(expenses);
    }

    return {
      labels: months,
      datasets: [
        {
          data: incomeData,
          color: (opacity = 1) => withAlpha(COLORS.income, opacity),
          strokeWidth: 2,
        },
        {
          data: expenseData,
          color: (opacity = 1) => withAlpha(COLORS.expense, opacity),
          strokeWidth: 2,
        },
      ],
      legend: ['Income', 'Expenses'],
    };
  }, [transactions]);

  const subscriptionStats = useMemo(() => {
    const activeCount = subscriptions.filter((s) => s.isActive).length;
    const totalMonthly = subscriptions
      .filter((s) => s.isActive)
      .reduce((sum, sub) => {
        const monthlyAmount = (() => {
          switch (sub.billingCycle) {
            case 'weekly':
              return sub.amount * 4;
            case 'yearly':
              return sub.amount / 12;
            default:
              return sub.amount;
          }
        })();
        return sum + monthlyAmount;
      }, 0);

    return { activeCount, totalMonthly };
  }, [subscriptions]);

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <ModeToggle />
        <EmptyState
          icon="bar-chart-2"
          title="No Data Yet"
          message="Start adding transactions to see your financial reports"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={styles.chartTitle}>Income vs Expenses (6 months)</Text>
          <LineChart
            data={trendData}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              backgroundColor: COLORS.background,
              backgroundGradientFrom: COLORS.background,
              backgroundGradientTo: COLORS.background,
              decimalPlaces: 0,
              color: (opacity = 1) => withAlpha(COLORS.primary, opacity),
              labelColor: (opacity = 1) => withAlpha(COLORS.textSecondary, opacity),
              style: {
                borderRadius: 16,
              },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
              },
            }}
            bezier
            style={styles.chart}
          />
        </Card>

        {categoryData.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>Expenses by Category (This Month)</Text>
            <PieChart
              data={categoryData}
              width={screenWidth - 64}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              absolute
              hasLegend={true}
            />
          </Card>
        )}

        {subscriptionStats.activeCount > 0 && (
          <Card>
            <Text style={styles.chartTitle}>Subscription Overview</Text>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{subscriptionStats.activeCount}</Text>
                <Text style={styles.statLabel}>Active Subscriptions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{currency} {subscriptionStats.totalMonthly.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Monthly Cost</Text>
              </View>
            </View>
          </Card>
        )}

        <Card>
          <Text style={styles.chartTitle}>Top Categories</Text>
          {categoryData.slice(0, 5).map((category, index) => (
            <View key={index} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <View style={[styles.colorDot, { backgroundColor: category.color }]} />
                <Text style={styles.categoryName}>{category.name}</Text>
              </View>
              <Text style={styles.categoryAmount}>{currency} {category.amount.toFixed(2)}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Charts
  chartTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  chart: {
    marginVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
  },

  // Stats
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
  },
  statValue: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: RADIUS.sm,
    marginRight: SPACING.md,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  categoryAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
});

export default PersonalReports;
