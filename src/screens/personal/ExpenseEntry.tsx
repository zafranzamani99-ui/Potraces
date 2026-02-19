import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import GRADIENTS from '../../constants/gradients';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import GradientButton from '../../components/common/GradientButton';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import Card from '../../components/common/Card';
import Confetti from '../../components/common/Confetti';
import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, successNotification } from '../../services/haptics';

const QUICK_AMOUNTS = [5, 10, 20, 50, 100];

const ExpenseEntry: React.FC = () => {
  const { showToast } = useToast();
  const { addTransaction } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].id);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    wallets.find((w) => w.isDefault)?.id || null
  );
  const [showConfetti, setShowConfetti] = useState(false);

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (!description.trim()) {
      showToast('Please add a description', 'error');
      return;
    }

    const parsedAmount = parseFloat(amount);

    addTransaction({
      amount: parsedAmount,
      category,
      description: description.trim(),
      date: new Date(),
      type,
      mode: 'personal',
      walletId: selectedWalletId || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });

    if (selectedWalletId) {
      if (type === 'expense') {
        deductFromWallet(selectedWalletId, parsedAmount);
      } else {
        addToWallet(selectedWalletId, parsedAmount);
      }
    }

    setAmount('');
    setDescription('');
    setTags('');
    setCategory(categories[0].id);

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 100);
    successNotification();
    showToast(`${type === 'expense' ? 'Expense' : 'Income'} added successfully!`, 'success');
  };

  const handleTypeChange = (newType: 'expense' | 'income') => {
    setType(newType);
    const newCategories = newType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    setCategory(newCategories[0].id);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ModeToggle />
      <Confetti active={showConfetti} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeContainer}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'expense' && styles.typeButtonActive,
                { borderColor: COLORS.expense },
              ]}
              onPress={() => handleTypeChange('expense')}
            >
              <Feather
                name="arrow-down-circle"
                size={20}
                color={type === 'expense' ? '#fff' : COLORS.expense}
              />
              <Text
                style={[
                  styles.typeText,
                  type === 'expense' && styles.typeTextActive,
                ]}
              >
                Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'income' && styles.typeButtonActive,
                { borderColor: COLORS.success },
              ]}
              onPress={() => handleTypeChange('income')}
            >
              <Feather
                name="arrow-up-circle"
                size={20}
                color={type === 'income' ? '#fff' : COLORS.success}
              />
              <Text
                style={[
                  styles.typeText,
                  type === 'income' && styles.typeTextActive,
                ]}
              >
                Income
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        <View style={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((val) => (
            <TouchableOpacity
              key={val}
              style={[
                styles.quickAmountButton,
                amount === val.toString() && styles.quickAmountActive,
              ]}
              onPress={() => { lightTap(); setAmount(val.toString()); }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickAmountText,
                  amount === val.toString() && styles.quickAmountTextActive,
                ]}
              >
                {currency}{val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Card>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.currencySymbol}>{currency}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </Card>

        <CategoryPicker
          categories={categories}
          selectedId={category}
          onSelect={setCategory}
          label="Category"
          layout="dropdown"
        />

        <WalletPicker
          wallets={wallets}
          selectedId={selectedWalletId}
          onSelect={setSelectedWalletId}
          label="Wallet"
        />

        <Card>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="What was this for?"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={2}
          />
        </Card>

        <Card>
          <Text style={styles.label}>Tags (optional)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="personal, family, work (comma separated)"
            placeholderTextColor={COLORS.textSecondary}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.hint}>
            Add tags to organize your transactions better
          </Text>
        </Card>

        <GradientButton
          title={`Add ${type === 'expense' ? 'Expense' : 'Income'}`}
          onPress={handleSubmit}
          icon="check"
          size="large"
          gradient={type === 'expense' ? GRADIENTS.danger : GRADIENTS.success}
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  typeButtonActive: {
    backgroundColor: COLORS.expense,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  quickAmountActive: {
    borderColor: COLORS.personal,
    backgroundColor: COLORS.personal,
  },
  quickAmountText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  quickAmountTextActive: {
    color: '#fff',
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  typeTextActive: {
    color: '#fff',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
  },
  currencySymbol: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  hint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  submitButton: {
    marginTop: SPACING.sm,
    marginBottom: SPACING['3xl'],
  },
});

export default ExpenseEntry;
