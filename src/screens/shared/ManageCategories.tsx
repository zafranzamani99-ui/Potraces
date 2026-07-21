// ManageCategories — the one place to edit every list the app classifies money
// by: expense / income / investment categories + payment methods. Reached from
// Settings → Money Setup → "Manage categories" (both personal and business
// modes; business passes mode='business' so category edits stay mode-scoped).
import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
// Page scroller = gesture-handler's ScrollView (DebtTracking recipe — see
// CLAUDE.md "Scroll screens"). No inputs here, so no keyboard pieces.
import { ScrollView } from 'react-native-gesture-handler';
import { useRoute } from '@react-navigation/native';
import SettingRow from '../../components/common/SettingRow';
import CategoryManager from '../../components/common/CategoryManager';
import PaymentMethodManager from '../../components/common/PaymentMethodManager';
import { CALM, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';

const ManageCategories: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const route = useRoute<any>();
  const mode: 'personal' | 'business' = route.params?.mode === 'business' ? 'business' : 'personal';

  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [categoryManagerType, setCategoryManagerType] = useState<'expense' | 'income' | 'investment'>('expense');
  const [paymentMethodManagerVisible, setPaymentMethodManagerVisible] = useState(false);

  const openCategory = (type: 'expense' | 'income' | 'investment') => {
    lightTap();
    setCategoryManagerType(type);
    setCategoryManagerVisible(true);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SettingRow
          icon="i/pricetags"
          chipColor="#9A6400"
          label={t.settings.expenseCategories}
          onPress={() => openCategory('expense')}
        />
        <SettingRow
          icon="i/trending-up"
          chipColor="#4F5104"
          label={t.settings.incomeCategories}
          onPress={() => openCategory('income')}
        />
        <SettingRow
          icon="i/pie-chart"
          chipColor="#A688B8"
          label={t.settings.investmentCategories}
          onPress={() => openCategory('investment')}
        />
        <SettingRow
          icon="i/card"
          chipColor="#6BA3BE"
          label={t.settings.paymentMethods}
          onPress={() => { lightTap(); setPaymentMethodManagerVisible(true); }}
        />
      </ScrollView>

      {categoryManagerVisible && (
        <CategoryManager
          visible
          onClose={() => setCategoryManagerVisible(false)}
          type={categoryManagerType}
          mode={mode}
        />
      )}
      {paymentMethodManagerVisible && (
        <PaymentMethodManager
          visible
          onClose={() => setPaymentMethodManagerVisible(false)}
        />
      )}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING['3xl'] },
});

export default ManageCategories;
