import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, differenceInCalendarDays } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  CALM,
  TYPE,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  withAlpha,
} from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ProgressBar from '../../components/common/ProgressBar';
import EmptyState from '../../components/common/EmptyState';

import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { Goal } from '../../types';

// ── ICON & COLOR PRESETS ──────────────────────────────────────
const GOAL_ICONS: (keyof typeof Feather.glyphMap)[] = [
  'target',
  'star',
  'home',
  'smartphone',
  'truck',
  'send',
  'gift',
  'heart',
  'book',
  'coffee',
  'shopping-bag',
  'music',
];

const GOAL_COLORS = [
  '#4F5104', // CALM.accent (olive)
  '#2E7D5B', // CALM.positive (green)
  '#E67E22', // warm orange
  '#3498DB', // sky blue
  '#9B59B6', // amethyst purple
  '#E74C3C', // coral red
  '#1ABC9C', // teal
  '#F39C12', // golden amber
];

// ── MILESTONE LABELS ──────────────────────────────────────────
const MILESTONE_LABELS: Record<number, string> = {
  25: 'Quarter way',
  50: 'Halfway there',
  75: 'Almost there',
  100: 'Goal reached',
};

// ── ENCOURAGING MESSAGES ──────────────────────────────────────
const getObservation = (percentage: number): string => {
  if (percentage >= 100) return 'goal reached.';
  if (percentage >= 75) return 'almost there.';
  if (percentage >= 50) return 'halfway.';
  if (percentage >= 25) return 'a quarter saved.';
  return '';
};

const MAX_GOALS = 10;

// ── MAIN COMPONENT ────────────────────────────────────────────
const Goals: React.FC = () => {
  const { showToast } = useToast();
  const goals = usePersonalStore((s) => s.goals);
  const addGoal = usePersonalStore((s) => s.addGoal);
  const updateGoal = usePersonalStore((s) => s.updateGoal);
  const deleteGoal = usePersonalStore((s) => s.deleteGoal);
  const contributeToGoal = usePersonalStore((s) => s.contributeToGoal);
  const currency = useSettingsStore((s) => s.currency);

  // ── Add/Edit Goal Modal state ──
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalIcon, setGoalIcon] = useState<keyof typeof Feather.glyphMap>('target');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);

  // ── Contribute Modal state ──
  const [contributeModalVisible, setContributeModalVisible] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeNote, setContributeNote] = useState('');

  // ── Derived data ──
  const goalsList: Goal[] = goals || [];

  const summary = useMemo(() => {
    const totalSaved = goalsList.reduce((sum: number, g: Goal) => sum + g.currentAmount, 0);
    const totalTarget = goalsList.reduce((sum: number, g: Goal) => sum + g.targetAmount, 0);
    const overallPercentage = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    const completedCount = goalsList.filter(
      (g: Goal) => g.currentAmount >= g.targetAmount
    ).length;
    return { totalSaved, totalTarget, overallPercentage, completedCount };
  }, [goalsList]);

  // ── Form reset ──
  const resetGoalForm = useCallback(() => {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline('');
    setGoalIcon('target');
    setGoalColor(GOAL_COLORS[0]);
  }, []);

  // ── Open Add Modal ──
  const openAddGoal = useCallback(() => {
    if (goalsList.length >= MAX_GOALS) {
      showToast(`Maximum ${MAX_GOALS} goals allowed`, 'error');
      return;
    }
    resetGoalForm();
    setGoalModalVisible(true);
  }, [goalsList.length, resetGoalForm, showToast]);

  // ── Open Edit Modal ──
  const openEditGoal = useCallback((goal: Goal) => {
    lightTap();
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount.toString());
    setGoalDeadline(
      goal.deadline ? format(new Date(goal.deadline), 'yyyy-MM-dd') : ''
    );
    setGoalIcon(goal.icon as keyof typeof Feather.glyphMap);
    setGoalColor(goal.color);
    setGoalModalVisible(true);
  }, []);

  // ── Save Goal ──
  const handleSaveGoal = useCallback(() => {
    if (!goalName.trim()) {
      showToast('Please enter a goal name', 'error');
      return;
    }
    const target = parseFloat(goalTarget);
    if (!target || target <= 0) {
      showToast('Please enter a valid target amount', 'error');
      return;
    }

    // Validate deadline format if provided
    let deadline: Date | undefined;
    if (goalDeadline.trim()) {
      const parsed = new Date(goalDeadline.trim());
      if (isNaN(parsed.getTime())) {
        showToast('Please enter a valid date (YYYY-MM-DD)', 'error');
        return;
      }
      deadline = parsed;
    }

    if (editingGoal) {
      updateGoal(editingGoal.id, {
        name: goalName.trim(),
        targetAmount: target,
        deadline,
        icon: goalIcon,
        color: goalColor,
      });
      showToast('goal updated.', 'success');
    } else {
      addGoal({
        name: goalName.trim(),
        targetAmount: target,
        deadline,
        category: 'general',
        icon: goalIcon,
        color: goalColor,
      });
      showToast('goal created.', 'success');
    }

    setGoalModalVisible(false);
    resetGoalForm();
  }, [
    goalName,
    goalTarget,
    goalDeadline,
    goalIcon,
    goalColor,
    editingGoal,
    addGoal,
    updateGoal,
    resetGoalForm,
    showToast,
  ]);

  // ── Delete Goal ──
  const handleDeleteGoal = useCallback(
    (goal: Goal) => {
      lightTap();
      Alert.alert(
        'Delete Goal',
        `Remove "${goal.name}" from your goals? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteGoal(goal.id);
              showToast('Goal removed', 'success');
            },
          },
        ]
      );
    },
    [deleteGoal, showToast]
  );

  // ── Open Contribute Modal ──
  const openContribute = useCallback((goal: Goal) => {
    lightTap();
    setContributingGoal(goal);
    setContributeAmount('');
    setContributeNote('');
    setContributeModalVisible(true);
  }, []);

  // ── Handle Contribution ──
  const handleContribute = useCallback(() => {
    if (!contributingGoal) return;

    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    // Snapshot milestones BEFORE contribution
    const milestonesBefore = contributingGoal.milestones
      ? contributingGoal.milestones.filter((m) => m.reached).length
      : 0;

    // Perform contribution
    contributeToGoal(
      contributingGoal.id,
      amount,
      contributeNote.trim() || undefined
    );

    // Check milestones AFTER contribution by computing new percentage
    const newAmount = contributingGoal.currentAmount + amount;
    const newPercentage =
      contributingGoal.targetAmount > 0
        ? (newAmount / contributingGoal.targetAmount) * 100
        : 0;

    // Count how many milestones would now be reached
    const milestonesAfter = [25, 50, 75, 100].filter(
      (pct) => newPercentage >= pct
    ).length;

    // Calm milestone notification — no confetti, no celebration
    if (milestonesAfter > milestonesBefore) {
      const crossedPct = [25, 50, 75, 100].find(
        (pct) =>
          newPercentage >= pct &&
          contributingGoal.currentAmount / contributingGoal.targetAmount * 100 < pct
      );
      if (crossedPct === 100) {
        showToast('Goal reached.', 'success');
      } else if (crossedPct) {
        showToast(`${crossedPct}% milestone.`, 'success');
      } else {
        showToast('Contribution added.', 'success');
      }
    } else {
      showToast('Contribution added.', 'success');
    }

    setContributeModalVisible(false);
    setContributingGoal(null);
  }, [contributingGoal, contributeAmount, contributeNote, contributeToGoal, showToast]);

  // ── Render Milestone Dots ──
  const renderMilestoneDots = (goal: Goal) => {
    const milestonePercentages = [25, 50, 75, 100];
    const currentPct =
      goal.targetAmount > 0
        ? (goal.currentAmount / goal.targetAmount) * 100
        : 0;

    return (
      <View style={styles.milestoneDots}>
        {milestonePercentages.map((pct) => {
          const isReached = currentPct >= pct;
          // Also check the milestones array if available
          const milestoneData = goal.milestones?.find(
            (m) => m.percentage === pct
          );
          const reached = isReached || milestoneData?.reached;

          return (
            <View key={pct} style={styles.milestoneDotContainer}>
              <View
                style={[
                  styles.milestoneDot,
                  reached
                    ? { backgroundColor: goal.color }
                    : { backgroundColor: CALM.border },
                ]}
                accessibilityLabel={`${pct}% milestone ${reached ? 'reached' : 'not yet reached'}`}
              />
              <Text
                style={[
                  styles.milestoneDotLabel,
                  reached && { color: goal.color },
                ]}
              >
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Close modals ──
  const closeGoalModal = useCallback(() => {
    setGoalModalVisible(false);
    resetGoalForm();
  }, [resetGoalForm]);

  const closeContributeModal = useCallback(() => {
    setContributeModalVisible(false);
    setContributingGoal(null);
  }, []);

  return (
    <View style={styles.container}>
      <ModeToggle />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Summary Card ── */}
        {goalsList.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Goals Progress</Text>
            <Text style={styles.summaryAmount}>
              {currency} {summary.totalSaved.toFixed(2)}
            </Text>
            <Text style={styles.summarySubtext}>
              of {currency} {summary.totalTarget.toFixed(2)} total target
            </Text>

            <ProgressBar
              current={summary.totalSaved}
              total={summary.totalTarget}
              showPercentage={false}
              height={10}
            />

            <View style={styles.summaryStatsRow}>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatLabel}>Active</Text>
                <Text style={styles.summaryStatValue}>
                  {goalsList.length - summary.completedCount}
                </Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatLabel}>Completed</Text>
                <Text
                  style={[
                    styles.summaryStatValue,
                    { color: CALM.positive },
                  ]}
                >
                  {summary.completedCount}
                </Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatLabel}>Overall</Text>
                <Text style={styles.summaryStatValue}>
                  {summary.overallPercentage.toFixed(0)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Goal Cards ── */}
        {goalsList.length > 0 ? (
          goalsList.map((goal: Goal) => {
            const percentage =
              goal.targetAmount > 0
                ? Math.min(
                    (goal.currentAmount / goal.targetAmount) * 100,
                    100
                  )
                : 0;
            const isCompleted = goal.currentAmount >= goal.targetAmount;

            return (
              <Card key={goal.id} style={styles.goalCard}>
                {/* ── Header Row ── */}
                <View style={styles.goalHeader}>
                  <View
                    style={[
                      styles.goalIconCircle,
                      { backgroundColor: withAlpha(goal.color, 0.12) },
                    ]}
                  >
                    <Feather
                      name={
                        (goal.icon as keyof typeof Feather.glyphMap) ||
                        'target'
                      }
                      size={22}
                      color={goal.color}
                    />
                  </View>

                  <View style={styles.goalInfo}>
                    <Text style={styles.goalName} numberOfLines={1}>
                      {goal.name}
                    </Text>
                    <Text style={styles.goalProgressText}>
                      <Text style={styles.goalCurrentAmount}>
                        {currency} {goal.currentAmount.toFixed(2)}
                      </Text>
                      {' / '}
                      {currency} {goal.targetAmount.toFixed(2)}
                    </Text>
                    {goal.deadline && (() => {
                      const daysLeft = differenceInCalendarDays(new Date(goal.deadline), new Date());
                      const isOverdue = daysLeft < 0;
                      const daysText = isOverdue
                        ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                          ? 'due today'
                          : `${daysLeft}d left`;
                      return (
                        <Text style={styles.goalDeadline}>
                          <Feather name="calendar" size={11} color={CALM.neutral} />{' '}
                          {format(new Date(goal.deadline), 'MMM dd, yyyy')}
                          {'  ·  '}
                          <Text style={isOverdue ? styles.goalOverdue : undefined}>{daysText}</Text>
                        </Text>
                      );
                    })()}
                  </View>

                  <View
                    style={[
                      styles.percentageBadge,
                      isCompleted && {
                        backgroundColor: withAlpha(CALM.positive, 0.1),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.percentageBadgeText,
                        isCompleted && { color: CALM.positive },
                      ]}
                    >
                      {percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>

                {/* ── Calm observation ── */}
                <Text style={styles.encouragingText}>
                  {isCompleted
                    ? 'goal reached.'
                    : `${percentage.toFixed(0)}% — ${getObservation(percentage)}`}
                </Text>

                {/* ── Progress Bar ── */}
                <View style={styles.goalProgressBar}>
                  <View
                    style={[
                      styles.goalProgressTrack,
                      { height: 8, borderRadius: RADIUS.sm },
                    ]}
                  >
                    <View
                      style={[
                        styles.goalProgressFill,
                        {
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: goal.color,
                          borderRadius: RADIUS.sm,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* ── Milestone Dots ── */}
                {renderMilestoneDots(goal)}

                {/* ── Action Buttons ── */}
                <View style={styles.goalActions}>
                  <TouchableOpacity
                    style={[
                      styles.contributeBtn,
                      { backgroundColor: withAlpha(goal.color, 0.1) },
                    ]}
                    onPress={() => openContribute(goal)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Contribute to ${goal.name}`}
                    accessibilityHint="Opens a form to add money towards this goal"
                  >
                    <Feather name="plus-circle" size={15} color={goal.color} />
                    <Text style={[styles.contributeBtnText, { color: goal.color }]}>
                      Contribute
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.goalActionIconBtn}
                    onPress={() => openEditGoal(goal)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Edit ${goal.name}`}
                  >
                    <Feather name="edit-2" size={16} color={CALM.accent} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.goalActionIconBtn}
                    onPress={() => handleDeleteGoal(goal)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Delete ${goal.name}`}
                  >
                    <Feather name="trash-2" size={16} color={CALM.neutral} />
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="target"
            title="Set Your First Goal"
            message="Whether it's an emergency fund or a dream vacation, every ringgit counts"
            actionLabel="Create Goal"
            onAction={openAddGoal}
          />
        )}
      </ScrollView>

      {/* ── FAB: Add Goal ── */}
      {goalsList.length > 0 && goalsList.length < MAX_GOALS && (
        <Button
          title="Create Goal"
          onPress={openAddGoal}
          icon="plus"
          size="large"
          style={styles.fab}
          accessibilityLabel="Create a new savings goal"
          accessibilityHint="Opens a form to create a new financial goal"
        />
      )}

      {/* ── Add / Edit Goal Modal ── */}
      <Modal
        visible={goalModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeGoalModal}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { closeGoalModal(); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingGoal ? 'Edit Goal' : 'Create Goal'}
              </Text>
              <TouchableOpacity onPress={closeGoalModal}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Goal Name */}
              <Text style={styles.label}>Goal Name</Text>
              <TextInput
                style={styles.input}
                value={goalName}
                onChangeText={setGoalName}
                placeholder="e.g. Emergency Fund, Dream Vacation"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="next"
                maxLength={50}
              />

              {/* Target Amount */}
              <Text style={styles.label}>Target Amount ({currency})</Text>
              <TextInput
                style={styles.input}
                value={goalTarget}
                onChangeText={setGoalTarget}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="next"
              />

              {/* Deadline */}
              <Text style={styles.label}>Deadline (optional)</Text>
              <TextInput
                style={styles.input}
                value={goalDeadline}
                onChangeText={setGoalDeadline}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                maxLength={10}
                onSubmitEditing={Keyboard.dismiss}
              />

              {/* Icon Picker */}
              <Text style={styles.label}>Icon</Text>
              <View style={styles.iconPickerGrid}>
                {GOAL_ICONS.map((icon) => {
                  const isSelected = goalIcon === icon;
                  return (
                    <TouchableOpacity
                      key={icon}
                      style={[
                        styles.iconPickerItem,
                        isSelected && {
                          backgroundColor: withAlpha(goalColor, 0.12),
                          borderColor: goalColor,
                        },
                      ]}
                      onPress={() => {
                        lightTap();
                        setGoalIcon(icon);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={`Icon: ${icon}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Feather
                        name={icon}
                        size={22}
                        color={isSelected ? goalColor : CALM.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Color Picker */}
              <Text style={styles.label}>Color</Text>
              <View style={styles.colorPickerRow}>
                {GOAL_COLORS.map((color) => {
                  const isSelected = goalColor === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorPickerItem,
                        { backgroundColor: color },
                        isSelected && styles.colorPickerItemSelected,
                      ]}
                      onPress={() => {
                        lightTap();
                        setGoalColor(color);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={`Color ${color}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {isSelected && (
                        <Feather name="check" size={16} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Preview */}
              {goalName.trim() && (
                <View style={styles.goalPreview}>
                  <View
                    style={[
                      styles.goalPreviewIcon,
                      { backgroundColor: withAlpha(goalColor, 0.12) },
                    ]}
                  >
                    <Feather name={goalIcon} size={20} color={goalColor} />
                  </View>
                  <Text style={styles.goalPreviewName} numberOfLines={1}>
                    {goalName.trim()}
                  </Text>
                  {goalTarget && parseFloat(goalTarget) > 0 && (
                    <Text style={styles.goalPreviewTarget}>
                      {currency} {parseFloat(goalTarget).toFixed(2)}
                    </Text>
                  )}
                </View>
              )}

              {/* Actions */}
              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={closeGoalModal}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingGoal ? 'Update' : 'Create'}
                  onPress={handleSaveGoal}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── Contribute Modal ── */}
      <Modal
        visible={contributeModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeContributeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { closeContributeModal(); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contribute</Text>
              <TouchableOpacity onPress={closeContributeModal}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {contributingGoal && (
              <View style={styles.contributeContext}>
                <View
                  style={[
                    styles.contributeContextIcon,
                    {
                      backgroundColor: withAlpha(
                        contributingGoal.color,
                        0.12
                      ),
                    },
                  ]}
                >
                  <Feather
                    name={
                      (contributingGoal.icon as keyof typeof Feather.glyphMap) ||
                      'target'
                    }
                    size={20}
                    color={contributingGoal.color}
                  />
                </View>
                <View style={styles.contributeContextInfo}>
                  <Text style={styles.contributeContextName}>
                    {contributingGoal.name}
                  </Text>
                  <Text style={styles.contributeContextProgress}>
                    {currency} {contributingGoal.currentAmount.toFixed(2)} /{' '}
                    {currency} {contributingGoal.targetAmount.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Amount ({currency})</Text>
              <TextInput
                style={styles.input}
                value={contributeAmount}
                onChangeText={setContributeAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="next"
                autoFocus
              />

              {/* Remaining indicator */}
              {contributingGoal && contributeAmount && parseFloat(contributeAmount) > 0 && (
                <View style={styles.contributePreview}>
                  {(() => {
                    const newAmount =
                      contributingGoal.currentAmount +
                      parseFloat(contributeAmount);
                    const newPct =
                      contributingGoal.targetAmount > 0
                        ? Math.min(
                            (newAmount / contributingGoal.targetAmount) * 100,
                            100
                          )
                        : 0;
                    const remaining = Math.max(
                      contributingGoal.targetAmount - newAmount,
                      0
                    );
                    return (
                      <>
                        <Text style={styles.contributePreviewLabel}>
                          After this contribution
                        </Text>
                        <Text
                          style={[
                            styles.contributePreviewValue,
                            {
                              color:
                                newPct >= 100
                                  ? CALM.positive
                                  : CALM.textPrimary,
                            },
                          ]}
                        >
                          {newPct.toFixed(0)}% complete
                        </Text>
                        {remaining > 0 && (
                          <Text style={styles.contributePreviewRemaining}>
                            {currency} {remaining.toFixed(2)} to go
                          </Text>
                        )}
                        {newPct >= 100 && (
                          <Text style={styles.contributePreviewCelebrate}>
                            Goal will be reached.
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                value={contributeNote}
                onChangeText={setContributeNote}
                placeholder="e.g. Birthday money, bonus"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={closeContributeModal}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                <Button
                  title="Contribute"
                  onPress={handleContribute}
                  icon="plus"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

// ── STYLES ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: 80,
  },

  // ── Summary Card (bordered, no gradient) ──
  summaryCard: {
    padding: SPACING['2xl'],
    borderRadius: RADIUS.xl,
    marginBottom: SPACING['2xl'],
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  summaryAmount: {
    fontSize: TYPE.balance.fontSize,
    fontWeight: TYPE.balance.fontWeight,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  summarySubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
    fontVariant: ['tabular-nums'],
  },
  summaryStatsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryStatDivider: {
    width: 1,
    backgroundColor: CALM.border,
  },
  summaryStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  summaryStatValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Goal Card ──
  goalCard: {
    marginBottom: SPACING.xl,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  goalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  goalProgressText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  goalCurrentAmount: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  goalDeadline: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    marginTop: 2,
  },
  goalOverdue: {
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  percentageBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    marginLeft: SPACING.sm,
  },
  percentageBadgeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Encouraging text ──
  encouragingText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: SPACING.md,
    fontStyle: 'italic',
  },

  // ── Goal Progress Bar (custom inline) ──
  goalProgressBar: {
    marginBottom: SPACING.md,
  },
  goalProgressTrack: {
    width: '100%',
    backgroundColor: CALM.background,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
  },

  // ── Milestone Dots ──
  milestoneDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  milestoneDotContainer: {
    alignItems: 'center',
    gap: 4,
  },
  milestoneDot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
  },
  milestoneDotLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },

  // ── Goal Action Buttons ──
  goalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.md,
  },
  contributeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  contributeBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  goalActionIconBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // ── Modal Shared ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },

  // ── Icon Picker ──
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  iconPickerItem: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALM.background,
    borderWidth: 1.5,
    borderColor: CALM.border,
  },

  // ── Color Picker ──
  colorPickerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  colorPickerItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPickerItemSelected: {
    borderWidth: 3,
    borderColor: CALM.surface,
    // Outer ring simulated by shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },

  // ── Goal Preview in Modal ──
  goalPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  goalPreviewIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalPreviewName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  goalPreviewTarget: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
    fontVariant: ['tabular-nums'],
  },

  // ── Contribute Modal Context ──
  contributeContext: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  contributeContextIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributeContextInfo: {
    flex: 1,
  },
  contributeContextName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  contributeContextProgress: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ── Contribute Preview ──
  contributePreview: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  contributePreviewLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginBottom: 4,
  },
  contributePreviewValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  contributePreviewRemaining: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  contributePreviewCelebrate: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.positive,
    marginTop: SPACING.xs,
  },
});

export default Goals;
