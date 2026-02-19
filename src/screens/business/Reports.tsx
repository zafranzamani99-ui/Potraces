import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, PRODUCT_CATEGORIES, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';

const screenWidth = Dimensions.get('window').width;

const BusinessReports: React.FC = () => {
  const { sales, products } = useBusinessStore();
  const currency = useSettingsStore(state => state.currency);

  const monthlySalesData = useMemo(() => {
    const months = [];
    const salesData = [];
    const profitData = [];

    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthSales = sales.filter((s) =>
        isWithinInterval(s.date, { start: monthStart, end: monthEnd })
      );

      const totalSales = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);

      let totalProfit = 0;
      monthSales.forEach((sale) => {
        sale.items.forEach((item) => {
          const product = products.find((p) => p.id === item.productId);
          if (product) {
            const profit = (item.unitPrice - product.cost) * item.quantity;
            totalProfit += profit;
          }
        });
      });

      months.push(format(date, 'MMM'));
      salesData.push(totalSales);
      profitData.push(totalProfit);
    }

    return {
      labels: months,
      datasets: [
        {
          data: salesData.length > 0 ? salesData : [0],
        },
      ],
    };
  }, [sales, products]);

  const topSellingProducts = useMemo(() => {
    const productSales: { [key: string]: { name: string; quantity: number; revenue: number } } = {};

    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            name: item.productName,
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].revenue += item.totalPrice;
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sales]);

  const paymentMethodData = useMemo(() => {
    const cash = sales.filter((s) => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.totalAmount, 0);
    const digital = sales.filter((s) => s.paymentMethod === 'digital').reduce((sum, s) => sum + s.totalAmount, 0);
    const card = sales.filter((s) => s.paymentMethod === 'card').reduce((sum, s) => sum + s.totalAmount, 0);

    const data = [];
    if (cash > 0) data.push({ name: 'Cash', amount: cash, color: COLORS.success, legendFontColor: COLORS.text, legendFontSize: 12 });
    if (digital > 0) data.push({ name: 'Digital', amount: digital, color: COLORS.info, legendFontColor: COLORS.text, legendFontSize: 12 });
    if (card > 0) data.push({ name: 'Card', amount: card, color: COLORS.warning, legendFontColor: COLORS.text, legendFontSize: 12 });

    return data;
  }, [sales]);

  const totalStats = useMemo(() => {
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    let totalProfit = 0;

    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const profit = (item.unitPrice - product.cost) * item.quantity;
          totalProfit += profit;
        }
      });
    });

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      revenue: totalRevenue,
      profit: totalProfit,
      profitMargin,
    };
  }, [sales, products]);

  if (sales.length === 0) {
    return (
      <View style={styles.container}>
        <ModeToggle />
        <EmptyState
          icon="trending-up"
          title="No Sales Data"
          message="Start making sales to see your business reports and analytics"
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
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Total Revenue</Text>
            <Text style={styles.statValue}>{currency} {totalStats.revenue.toFixed(2)}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Total Profit</Text>
            <Text style={[styles.statValue, { color: COLORS.success }]}>
              {currency} {totalStats.profit.toFixed(2)}
            </Text>
          </Card>
        </View>

        <Card>
          <Text style={styles.chartTitle}>Monthly Sales (6 months)</Text>
          <BarChart
            data={monthlySalesData}
            width={screenWidth - 64}
            height={220}
            yAxisLabel={currency}
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: COLORS.background,
              backgroundGradientFrom: COLORS.background,
              backgroundGradientTo: COLORS.background,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: {
                borderRadius: 16,
              },
              barPercentage: 0.7,
            }}
            style={styles.chart}
          />
        </Card>

        {paymentMethodData.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>Payment Methods</Text>
            <PieChart
              data={paymentMethodData}
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

        {topSellingProducts.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>Top Selling Products</Text>
            {topSellingProducts.map((product, index) => (
              <View key={index} style={styles.productRow}>
                <View style={styles.productRank}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productQuantity}>{product.quantity} sold</Text>
                </View>
                <Text style={styles.productRevenue}>{currency} {product.revenue.toFixed(2)}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card>
          <Text style={styles.chartTitle}>Business Metrics</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{sales.length}</Text>
              <Text style={styles.metricLabel}>Total Sales</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{products.length}</Text>
              <Text style={styles.metricLabel}>Products</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: COLORS.success }]}>
                {totalStats.profitMargin.toFixed(1)}%
              </Text>
              <Text style={styles.metricLabel}>Profit Margin</Text>
            </View>
          </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
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
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  productRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(COLORS.business, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.business,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  productQuantity: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  productRevenue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.business,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default BusinessReports;
