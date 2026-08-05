import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Image, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import NeuButton from '../../components/common/NeuButton';
import KeyboardDoneFab from '../../components/common/KeyboardDoneFab';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { useNeu } from '../../components/common/neu';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { supabasePersonal } from '../../services/supabase';
import { submitFeedback, NotSignedInError } from '../../services/betaFeedback';
import { useFeedbackDraftStore, type FeedbackType } from '../../store/feedbackDraftStore';

const MAX_SHOTS = 3;

/**
 * "Report a bug / idea", writes into the shared `beta_feedback` table (the same
 * one the web form + admin board use). Reached from Settings, About, Help &
 * Community. Users can type without an account; sign-in is only asked at Send and
 * the typed draft is preserved across the sign-in round-trip (persisted to disk).
 * Up to 3 optional screenshots.
 */
const FeedbackForm: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const insets = useSafeAreaInsets();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const navigation = useNavigation<any>();

  const draft = useFeedbackDraftStore((s) => s.draft);
  const setDraft = useFeedbackDraftStore((s) => s.setDraft);
  const clearDraft = useFeedbackDraftStore((s) => s.clearDraft);

  // Initialise from the persisted draft (covers a process-kill remount). The
  // native stack keeps this screen mounted across the Account sign-in trip, so
  // live state also survives the normal round trip.
  const [type, setType] = useState<FeedbackType>(draft?.type ?? 'bug');
  const [body, setBody] = useState(draft?.body ?? '');
  const [shots, setShots] = useState<string[]>(draft?.screenshotUris ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(true); // assume signed in until checked (hides the benefit line)
  const [multilineFocused, setMultilineFocused] = useState(false);

  const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setMultilineFocused(false));

  // Re-check the personal session on focus (also when returning from Account) to
  // toggle the "sign in so we can update you" benefit line.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      supabasePersonal.auth.getSession().then(({ data }) => {
        if (alive) setSignedIn(!!data.session);
      });
      return () => { alive = false; };
    }, []),
  );

  // Persist the draft (debounced) so it survives the sign-in trip AND a
  // low-memory kill during OAuth. Clear when there's nothing worth keeping.
  useEffect(() => {
    const hasContent = body.trim().length > 0 || shots.length > 0;
    const h = setTimeout(() => {
      if (hasContent) setDraft({ type, body, screenshotUris: shots });
      else clearDraft();
    }, 400);
    return () => clearTimeout(h);
  }, [type, body, shots, setDraft, clearDraft]);

  const pickScreenshots = useCallback(async () => {
    lightTap();
    const remaining = MAX_SHOTS - shots.length;
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (res.canceled || !res.assets?.length) return;
    // Copy each picked file out of the picker's tmp cache into documents so it
    // survives a restart.
    const added: string[] = [];
    for (const asset of res.assets.slice(0, remaining)) {
      let uri = asset.uri;
      try {
        if (FileSystem.documentDirectory) {
          const dest = `${FileSystem.documentDirectory}feedback-shot-${Date.now()}-${added.length}.jpg`;
          await FileSystem.copyAsync({ from: uri, to: dest });
          uri = dest;
        }
      } catch {
        // fall back to the picker uri (works until the OS purges tmp)
      }
      added.push(uri);
    }
    setShots((prev) => [...prev, ...added].slice(0, MAX_SHOTS));
  }, [shots.length]);

  const removeShot = useCallback((idx: number) => {
    lightTap();
    setShots((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSend = useCallback(async () => {
    if (!body.trim() || submitting) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await submitFeedback({ type, body, screenshotUris: shots });
      clearDraft();
      setBody('');
      setShots([]);
      setType('bug');
      showToast(t.settings.fbSent, 'success');
      navigation.goBack();
    } catch (e: any) {
      if (e instanceof NotSignedInError) {
        setDraft({ type, body, screenshotUris: shots }); // force-save before leaving
        setSubmitting(false);
        navigation.navigate('Account', { returnTo: 'FeedbackForm' });
        return;
      }
      const msg = String(e?.message ?? '');
      showToast(msg.includes('rate_limit') ? t.settings.fbRateLimited : t.settings.fbSendFailed, 'error');
      setSubmitting(false);
    }
  }, [body, shots, type, submitting, clearDraft, setDraft, showToast, t, navigation]);

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={styles.intro}>{t.settings.fbIntro}</Text>

        {/* Bug / Idea, Neu Pills */}
        <View style={styles.typeRow}>
          {(['bug', 'idea'] as FeedbackType[]).map((opt) => {
            const active = type === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.typePill, neu.raised, active && styles.typePillActive]}
                onPress={() => { lightTap(); setType(opt); }}
                activeOpacity={0.85}
              >
                <Feather
                  name={opt === 'bug' ? 'alert-circle' : 'zap'}
                  size={16}
                  color={active ? C.onAccent : C.textSecondary}
                />
                <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                  {opt === 'bug' ? t.settings.fbBug : t.settings.fbIdea}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Description, Note Field */}
        <Text style={styles.label}>{t.settings.fbDescLabel}</Text>
        <View style={[styles.fieldCard, neu.raisedSoft]}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder={t.settings.fbDescPlaceholder}
            placeholderTextColor={C.textMuted}
            multiline
            textAlignVertical="top"
            onFocus={() => setMultilineFocused(true)}
            onBlur={() => setMultilineFocused(false)}
          />
        </View>

        {/* Optional screenshots (up to 3) */}
        <Text style={styles.label}>{t.settings.fbAttach}</Text>
        <View style={styles.shotsRow}>
          {shots.map((uri, idx) => (
            <View key={`${uri}-${idx}`} style={styles.shotWrap}>
              {/* Seam rule: neu shadow on the outer view, overflow-clip on the inner. */}
              <View style={[styles.shotShadow, neu.raised]}>
                <View style={styles.shotClip}>
                  <Image source={{ uri }} style={styles.shotImg} resizeMode="cover" />
                </View>
              </View>
              <TouchableOpacity
                style={styles.shotRemove}
                onPress={() => removeShot(idx)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.settings.fbRemove}
              >
                <Feather name="x" size={12} color={C.onAccent} />
              </TouchableOpacity>
            </View>
          ))}
          {shots.length < MAX_SHOTS && (
            <TouchableOpacity
              style={[styles.addTile, neu.raised]}
              onPress={pickScreenshots}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.settings.fbAttach}
            >
              <Feather name="plus" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.warning}>{t.settings.fbScreenshotWarning}</Text>

        {!signedIn && <Text style={styles.benefit}>{t.settings.fbSignInBenefit}</Text>}

        <View style={styles.sendWrap}>
          <NeuButton
            icon="send"
            label={t.settings.fbSend}
            onPress={handleSend}
            disabled={!body.trim()}
            loading={submitting}
          />
        </View>

        <Text style={styles.consent}>{t.settings.fbConsent}</Text>
      </KeyboardAwareScrollView>

      <KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, maxWidth: 680, width: '100%', alignSelf: 'center' as const },
  intro: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 22,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  // Bug / Idea, Neu Pills (faintDark raised idle, olive fill when selected).
  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  typePillActive: { backgroundColor: C.accent },
  typePillText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  typePillTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  // Neu Card (borderless C.background + neu.raisedSoft).
  fieldCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 96,
    padding: 0,
  },
  shotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  shotWrap: { position: 'relative' },
  shotShadow: { borderRadius: RADIUS.lg },
  shotClip: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  shotImg: { width: 84, height: 84 },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  shotRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warning: {
    fontSize: TYPOGRAPHY.size.xs,
    lineHeight: 16,
    color: C.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  benefit: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  sendWrap: { marginTop: SPACING.xs },
  consent: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});

export default FeedbackForm;
