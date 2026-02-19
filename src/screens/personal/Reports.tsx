import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, EXPENSE_CATEGORIES } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';

const screenWidth = Dimensions.get('window').width;

const PersonalReports: React.FC = () => {
  const { transactions, subscriptions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);

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
        const cat = EXPENSE_CATEGORIES.find((c) => c.id === category);
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
  }, [transactions]);

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
          color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: expenseData,
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
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
              color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
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
    padding: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
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
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
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
    borderRadius: 6,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    color: COLORS.text,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default PersonalReports;
