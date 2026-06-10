import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Modal,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import ContactPicker from '../common/ContactPicker';
import ModalToastHost from '../common/ModalToastHost';
import { useToast } from '../../context/ToastContext';
import { renderIcon, COMMON_ICONS, suggestIcons } from '../commitments/CommitmentForm';
import { lightTap, mediumTap } from '../../services/haptics';
import { Contact, SharedSubscription, SharedSubMember } from '../../types';

interface SharedSubFormSheetProps {
  visible: boolean;
  onClose: () => void;
  editingSub?: SharedSubscription | null;
}

const SPRING_CFG = { damping: 22, stiffness: 220, mass: 0.5 };

const SharedSubFormSheet: React.FC<SharedSubFormSheetProps> = ({ visible, onClose, editingSub }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const currency = useSettingsStore((s) => s.currency);
  const userName = useSettingsStore((s) => s.userName);
  const addSharedSubscription = useDebtStore((s) => s.addSharedSubscription);
  const updateSharedSubscription = useDebtStore((s) => s.updateSharedSubscription);
  const addSharedSubMember = useDebtStore((s) => s.addSharedSubMember);
  const updateSharedSubMember = useDebtStore((s) => s.updateSharedSubMember);
  const removeSharedSubMember = useDebtStore((s) => s.removeSharedSubMember);
  const { showToast } = useToast();
  const closingRef = useRef(false);
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const saveScale = useSharedValue(1);

  const [name, setName] = useState('');
  const [iconName, setIconName] = useState<string | undefined>(undefined);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string | undefined>(undefined);
  const [totalAmount, setTotalAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [billingDay, setBillingDay] = useState('1');
  const [members, setMembers] = useState<{ contact: Contact; tag: string; shareAmount: string }[]>([]);
  const [note, setNote] = useState('');

  const isEditing = !!editingSub;

  const selfContact = useMemo((): Contact => ({
    id: '__self__',
    name: userName?.trim() || 'me',
    isFromPhone: false,
  }), [userName]);

  // Open animation
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      if (editingSub) {
        setName(editingSub.name);
        setIconName(editingSub.iconName);
        setImageUri(editingSub.imageUri);
        setTotalAmount(String(editingSub.totalAmount));
        setBillingCycle(editingSub.billingCycle);
        setBillingDay(String(editingSub.billingDay));
        setMembers(editingSub.members.filter((m) => m.isActive).map((m) => ({
          contact: m.contact,
          tag: m.tag,
          shareAmount: String(m.shareAmount),
        })));
        setNote(editingSub.note ?? '');
      } else {
        setName('');
        setIconName(undefined);
        setImageUri(undefined);
        setTotalAmount('');
        setBillingCycle('monthly');
        setBillingDay('1');
        setMembers([{ contact: selfContact, tag: t.sharedSubs.owner, shareAmount: '' }]);
        setNote('');
      }
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, SPRING_CFG);
    }
  }, [visible]);

  const finishClose = useCallback(() => {
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, finishClose]);

  // Drag gesture
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeSheet)();
          } else {
            sheetY.value = withSpring(0, SPRING_CFG);
          }
        }),
    [SCREEN_H, closeSheet]
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const saveAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveScale.value }],
  }));

  const totalNum = parseFloat(totalAmount) || 0;
  const sharesSum = members.reduce((sum, m) => sum + (parseFloat(m.shareAmount) || 0), 0);
  const sumMatches = totalNum > 0 && Math.abs(sharesSum - totalNum) < 0.01;
  const canSave = name.trim().length > 0 && (isEditing || totalNum > 0) && members.length >= 2;

  const suggested = useMemo(() => suggestIcons(name), [name]);

  const openIconPicker = useCallback(() => {
    setPickerSelection(iconName);
    setIconPickerVisible(true);
  }, [iconName]);

  const selectIcon = useCallback((icon: string) => {
    lightTap();
    setPickerSelection(icon);
  }, []);

  const saveIconSelection = useCallback(() => {
    mediumTap();
    setIconName(pickerSelection);
    if (pickerSelection) setImageUri(undefined);
    setIconPickerVisible(false);
  }, [pickerSelection]);

  const removeAvatar = useCallback(() => {
    lightTap();
    setPickerSelection(undefined);
    setImageUri(undefined);
    setIconName(undefined);
    setIconPickerVisible(false);
  }, []);

  const pickImage = useCallback(() => {
    setIconPickerVisible(false);
    setTimeout(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        lightTap();
        setImageUri(result.assets[0].uri);
        setIconName(undefined);
      }
    }, 50);
  }, []);

  const handleAddContacts = useCallback((contacts: Contact[]) => {
    setMembers((prev) => {
      const existingIds = new Set(prev.map((m) => m.contact.id));
      const newMembers = contacts
        .filter((c) => !existingIds.has(c.id))
        .map((c) => ({ contact: c, tag: '', shareAmount: '' }));
      return [...prev, ...newMembers];
    });
  }, []);

  const handleRemoveMember = useCallback((contactId: string) => {
    if (contactId === '__self__') return;
    setMembers((prev) => prev.filter((m) => m.contact.id !== contactId));
  }, []);

  const handleMemberField = useCallback((contactId: string, field: 'tag' | 'shareAmount', value: string) => {
    setMembers((prev) => prev.map((m) =>
      m.contact.id === contactId ? { ...m, [field]: value } : m
    ));
  }, []);

  const handleEqualSplit = useCallback(() => {
    if (totalNum <= 0 || members.length === 0) return;
    const perPerson = (totalNum / members.length).toFixed(2);
    setMembers((prev) => prev.map((m) => ({ ...m, shareAmount: perPerson })));
    lightTap();
  }, [totalNum, members.length]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const day = parseInt(billingDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      showToast('billing day must be 1–31', 'error');
      return;
    }

    const builtMembers: SharedSubMember[] = members.map((m) => ({
      contact: m.contact,
      tag: m.tag.trim(),
      shareAmount: parseFloat(m.shareAmount) || 0,
      isActive: true,
      joinedAt: new Date(),
    }));

    if (isEditing && editingSub) {
      updateSharedSubscription(editingSub.id, {
        name: name.trim(),
        iconName,
        imageUri,
        billingCycle,
        billingDay: day,
        note: note.trim() || undefined,
      });
      const existingIds = new Set(editingSub.members.map((m) => m.contact.id));
      const newIds = new Set(builtMembers.map((m) => m.contact.id));
      builtMembers.forEach((m) => {
        if (existingIds.has(m.contact.id)) {
          updateSharedSubMember(editingSub.id, m.contact.id, { tag: m.tag });
        } else {
          addSharedSubMember(editingSub.id, m);
        }
      });
      editingSub.members.forEach((m) => {
        if (!newIds.has(m.contact.id)) {
          removeSharedSubMember(editingSub.id, m.contact.id);
        }
      });
      showToast(t.sharedSubs.subUpdated, 'success');
    } else {
      addSharedSubscription({
        name: name.trim(),
        iconName,
        imageUri,
        totalAmount: totalNum,
        billingCycle,
        billingDay: day,
        members: builtMembers,
        isActive: true,
        note: note.trim() || undefined,
      });
      showToast(t.sharedSubs.subCreated, 'success');
    }

    setTimeout(closeSheet, 400);
  }, [canSave, name, iconName, imageUri, totalNum, billingCycle, billingDay, members, note, isEditing, editingSub, closeSheet, t]);

  if (!visible) return null;

  const selectedContacts = members.map((m) => m.contact);

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
      {/* Animated backdrop */}
      <Reanimated.View style={[styles.backdrop, backdropAnimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeSheet} />
      </Reanimated.View>

      {/* Sheet */}
      <Reanimated.View style={[styles.sheetContainer, sheetAnimStyle]}>
        {/* Drag zone */}
        <GestureDetector gesture={panGesture}>
          <View collapsable={false}>
            <View style={styles.topRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.titleZone}>
              <Text style={styles.title}>
                {isEditing ? 'edit ' : 'new '}
                <Text style={styles.titleAccent}>
                  {isEditing ? (editingSub?.name?.toLowerCase() || 'subscription') : 'shared subscription'}
                </Text>
              </Text>
              <Text style={styles.subtitle}>
                {isEditing ? 'update subscription details' : 'track shared recurring costs with others'}
              </Text>
            </View>
          </View>
        </GestureDetector>

        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={styles.scrollContent}
          bottomOffset={32}
          keyboardDismissMode="on-drag"
        >
          {/* Icon + Name (grouped card — matches CommitmentForm) */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <TouchableOpacity onPress={openIconPicker} activeOpacity={0.7} style={styles.nameIconBtn}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.nameIconImage} />
                ) : iconName ? (
                  <View style={[styles.nameIconFallback, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                    {renderIcon(iconName, 20, C.accent)}
                  </View>
                ) : (
                  <View style={[styles.nameIconFallback, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.accent }}>
                      {name ? name.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.fieldFlex}>
                <Text style={styles.fieldLabel}>
                  {t.sharedSubs.subName} <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t.sharedSubs.namePlaceholder}
                  placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>
            </View>
          </View>

          {/* Hero amount card — only during creation; use "adjust amounts" to change later */}
          {!isEditing && (<View style={styles.heroCard}>
            <Text style={styles.fieldLabel}>
              {t.sharedSubs.totalCost} <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency}>{currency}</Text>
              <TextInput
                style={styles.heroAmountInput}
                value={(() => {
                  const dotIdx = totalAmount.indexOf('.');
                  const intRaw = dotIdx === -1 ? totalAmount : totalAmount.slice(0, dotIdx);
                  const fracRaw = dotIdx === -1 ? null : totalAmount.slice(dotIdx + 1);
                  const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
                  return fracRaw === null ? intFormatted : `${intFormatted}.${fracRaw}`;
                })()}
                onChangeText={(raw) => {
                  const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                  const fd = stripped.indexOf('.');
                  let normalized = stripped;
                  if (fd !== -1) {
                    normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                    const [ip, fp = ''] = normalized.split('.');
                    normalized = ip + '.' + fp.slice(0, 2);
                  }
                  setTotalAmount(normalized);
                }}
                placeholder="0.00"
                placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            </View>
          </View>)}

          {/* Billing cycle — standalone pills (matches CommitmentForm) */}
          <View style={styles.cyclePillRow}>
            {(['monthly', 'quarterly', 'yearly'] as const).map((cycle) => {
              const isActive = billingCycle === cycle;
              return (
                <TouchableOpacity
                  key={cycle}
                  style={[styles.cyclePill, isActive && styles.cyclePillActive]}
                  onPress={() => { setBillingCycle(cycle); lightTap(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cyclePillText, isActive && styles.cyclePillTextActive]}>
                    {t.sharedSubs[cycle]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Billing day */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>{t.sharedSubs.billingDay}</Text>
            <TextInput
              style={[styles.fieldInput, { width: 80 }]}
              value={billingDay}
              onChangeText={setBillingDay}
              placeholder="1"
              placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
              keyboardType="number-pad"
              maxLength={2}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
          </View>

          {/* Members */}
          <View style={styles.fieldCard}>
            <View style={styles.membersHeaderRow}>
              <Text style={styles.fieldLabel}>members <Text style={styles.requiredStar}>*</Text></Text>
              {!isEditing && totalNum > 0 && members.length >= 2 && (
                <TouchableOpacity onPress={handleEqualSplit} style={styles.splitEvenBtn} activeOpacity={0.7}>
                  <Feather name="divide" size={12} color={C.accent} />
                  <Text style={styles.splitEvenText}>split even</Text>
                </TouchableOpacity>
              )}
            </View>

            {members.map((m) => {
              const isSelf = m.contact.id === '__self__';
              const initial = (m.contact.name || '?')[0].toUpperCase();
              return (
                <View key={m.contact.id} style={styles.memberRow}>
                  <View style={[styles.avatar, { borderColor: isSelf ? C.accent : withAlpha(C.textPrimary, 0.12) }]}>
                    <Text style={[styles.avatarText, { color: isSelf ? C.accent : C.textSecondary }]}>
                      {initial}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.contact.name}{isSelf ? ` (${t.sharedSubs.owner})` : ''}
                    </Text>
                    <View style={styles.memberFields}>
                      <TextInput
                        style={[styles.memberInput, { flex: 1 }]}
                        value={m.tag}
                        onChangeText={(v) => handleMemberField(m.contact.id, 'tag', v)}
                        placeholder={t.sharedSubs.tagPlaceholder}
                        placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                      {!isEditing && (
                        <TextInput
                          style={[styles.memberInput, { width: 80 }]}
                          value={m.shareAmount}
                          onChangeText={(v) => handleMemberField(m.contact.id, 'shareAmount', v)}
                          placeholder={currency}
                          placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                          keyboardType="decimal-pad"
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                      )}
                    </View>
                  </View>
                  {!isSelf && (
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(m.contact.id)}
                      style={styles.removeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="x" size={14} color={C.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <ContactPicker
              selectedContacts={selectedContacts}
              onSelect={handleAddContacts}
              mode="multi"
              label={t.sharedSubs.addMember}
              hideLabel
            />
          </View>

          {/* Sum check — only during creation */}
          {!isEditing && totalNum > 0 && members.length > 0 && (
            <View style={[styles.sumCheck, sumMatches ? styles.sumMatch : styles.sumMismatch]}>
              <Feather
                name={sumMatches ? 'check-circle' : 'alert-circle'}
                size={14}
                color={sumMatches ? C.accent : C.bronze}
              />
              <Text style={[styles.sumText, { color: sumMatches ? C.accent : C.bronze }]}>
                {currency}{sharesSum.toFixed(2)} / {currency}{totalNum.toFixed(2)}
                {' — '}{sumMatches ? t.sharedSubs.sumMatch : t.sharedSubs.sumMismatch}
              </Text>
            </View>
          )}

          {/* Note */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              note <Text style={styles.optionalLabel}>optional</Text>
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={note}
              onChangeText={setNote}
              placeholder="anything to remember"
              placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
          </View>
        </KeyboardAwareScrollView>

        {/* Save zone — pinned bottom */}
        <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, 34) }]}>
          <Reanimated.View style={saveAnimStyle}>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              onPressIn={() => { saveScale.value = withTiming(0.97, { duration: 120 }); }}
              onPressOut={() => { saveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
              accessibilityRole="button"
              accessibilityLabel={isEditing ? 'save changes' : 'create subscription'}
            >
              <View style={styles.saveBtnInner}>
                <Feather name="check" size={16} color={canSave ? C.surface : C.textMuted} />
                <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
                  {isEditing ? 'save changes' : 'create subscription'}
                </Text>
              </View>
            </Pressable>
          </Reanimated.View>

          <Pressable
            style={styles.closeLink}
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="close"
          >
            {({ pressed }) => (
              <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                <Feather name="x" size={12} color={C.textMuted} />
                <Text style={styles.closeLinkText}>close</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ModalToastHost />
      </Reanimated.View>

      {/* Icon picker overlay */}
      {iconPickerVisible && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIconPickerVisible(false)}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.dimBg, 0.45) }]} />
          </Pressable>
          <View style={styles.iconPickerWrap} pointerEvents="box-none">
            <View style={styles.iconPickerCard} onStartShouldSetResponder={() => true}>
              <View style={styles.iconPickerHeader}>
                <Text style={styles.iconPickerTitle}>
                  {'choose '}
                  <Text style={styles.iconPickerTitleAccent}>icon</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setIconPickerVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.iconPickerClose}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {suggested.length > 0 && (
                <>
                  <Text style={styles.iconPickerSectionLabel}>suggested</Text>
                  <View style={styles.iconGrid}>
                    {suggested.map((icon) => {
                      const sel = pickerSelection === icon;
                      return (
                        <TouchableOpacity
                          key={`s-${icon}`}
                          style={[styles.iconGridItem, sel && styles.iconGridItemActive]}
                          onPress={() => selectIcon(icon)}
                          activeOpacity={0.7}
                        >
                          {renderIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.iconPickerSectionLabel}>common</Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 180 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View style={styles.iconGrid}>
                  {COMMON_ICONS.map((icon) => {
                    const sel = pickerSelection === icon;
                    return (
                      <TouchableOpacity
                        key={icon}
                        style={[styles.iconGridItem, sel && styles.iconGridItemActive]}
                        onPress={() => selectIcon(icon)}
                        activeOpacity={0.7}
                      >
                        {renderIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.iconPickerDivider} />

              <TouchableOpacity style={styles.iconPickerRow} onPress={pickImage} activeOpacity={0.7}>
                <Feather name="image" size={16} color={C.accent} />
                <Text style={styles.iconPickerRowText}>choose from gallery</Text>
              </TouchableOpacity>

              <Pressable style={styles.iconPickerSaveBtn} onPress={saveIconSelection}>
                <View style={styles.iconPickerSaveBtnInner}>
                  <Feather name="check" size={14} color={C.onAccent} />
                  <Text style={styles.iconPickerSaveBtnText}>save</Text>
                </View>
              </Pressable>

              {(imageUri || pickerSelection) && (
                <Pressable style={styles.iconPickerRemove} onPress={removeAvatar}>
                  {({ pressed }) => (
                    <View style={[styles.iconPickerRemoveInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="x" size={12} color={C.textMuted} />
                      <Text style={styles.iconPickerRemoveText}>remove</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </>
      )}
    </Modal>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  titleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  titleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.07),
    overflow: 'hidden',
    marginBottom: SPACING.sm + 2,
    ...(C === CALM_DARK ? {} : SHADOWS.sm),
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm + 2,
  },
  nameIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  nameIconImage: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  nameIconFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldFlex: { flex: 1 },
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  requiredStar: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  optionalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    fontStyle: 'italic',
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
    letterSpacing: -0.1,
  },
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  cyclePillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  cyclePill: {
    flex: 1,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.10),
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.06 : 0.02),
  },
  cyclePillActive: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  cyclePillText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  cyclePillTextActive: {
    color: C.onAccent,
  },
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  splitEvenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.1),
  },
  splitEvenText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 4,
  },
  memberFields: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  memberInput: {
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.08 : 0.04),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  removeBtn: {
    padding: SPACING.xs,
  },
  sumCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm + 2,
  },
  sumMatch: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  sumMismatch: {
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  sumText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  saveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  saveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnDisabled: {
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.12 : 0.08),
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.3,
  },
  saveBtnTextDisabled: {
    color: C.textMuted,
  },
  closeLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  closeLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  closeLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  iconPickerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
    paddingHorizontal: SPACING.xl,
  },
  iconPickerCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.lg,
  },
  iconPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    position: 'relative',
  },
  iconPickerClose: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  iconPickerTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  iconPickerSectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconGridItem: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  iconGridItemActive: {
    backgroundColor: C.accent,
  },
  iconPickerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    marginVertical: SPACING.sm,
  },
  iconPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xs,
  },
  iconPickerRowText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    letterSpacing: -0.1,
  },
  iconPickerSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.sm + 4,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 44,
  },
  iconPickerSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconPickerSaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.2,
  },
  iconPickerRemove: {
    alignSelf: 'center',
    marginTop: SPACING.xs,
  },
  iconPickerRemoveInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  iconPickerRemoveText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
});

export default React.memo(SharedSubFormSheet);
