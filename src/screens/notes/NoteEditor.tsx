import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { intentGlyph } from '../../constants/intentIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotesStore } from '../../store/notesStore';
import ScreenGuide, { whenStore, type GuideStep } from '../../components/common/ScreenGuide';
import { useWalletStore } from '../../store/walletStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FormatToolbar from '../../components/notes/FormatToolbar';
import EchoExtractingLoader from '../../components/notes/EchoExtractingLoader';
import {
  buildRenderModel, diffRange, remapFormatting, toggleAttr, addAttr, activeAttrs,
  setBlock, lineStartOf, reconcileConfirmedStrikes, textWithoutStruckLines, defaultBlockStyle,
  EMPTY_FORMATTING, type NoteFormatting, type InlineAttr, type BlockStyle,
} from '../../utils/richText';
import { lightTap, mediumTap, warningNotification } from '../../services/haptics';
import { useIntentEngine } from '../../hooks/useIntentEngine';
import { useVoiceInput, VoiceErrorKind } from '../../hooks/useVoiceInput';
import { useCategories } from '../../hooks/useCategories';
import { usePremiumStore } from '../../store/premiumStore';
import { isGeminiAvailable } from '../../services/geminiClient';
import ModalToastHost from '../../components/common/ModalToastHost';
import { AIExtraction, ExtractionIntent } from '../../types';
import { useLearningStore } from '../../store/learningStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useT } from '../../i18n';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import ConfirmationCard from './ConfirmationCard';
import QueryResultCard from './QueryResultCard';
import PaywallModal from '../../components/common/PaywallModal';

const EDIT_TYPES: { key: ExtractionIntent }[] = [
  { key: 'expense' },
  { key: 'income' },
  { key: 'subscription' },
  { key: 'debt' },
  { key: 'savings_goal' },
  // Playbook is a v2 feature — not offered here yet.
];

const AUTO_SAVE_DELAY = 600; // ms

// The writing surface uses KeyboardAwareScrollView (follows the caret so new lines
// don't hide behind the keyboard) but backed by gesture-handler's ScrollView, whose
// native pan/tap arbitration lets a drag SCROLL without focusing the full-height text
// input (a plain RN/Reanimated ScrollView focuses the input on drag → keyboard pops
// up when you only meant to scroll). Wrapped for Reanimated so the library's scrollTo
// worklet still drives it. See rn-keyboard-controller "usage with gesture-handler".
const AnimatedGestureScrollView = Reanimated.createAnimatedComponent(ScrollView);

const NoteEditor: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const neuStd = useNeu(); // field cards — standard neu for the visible onyx raise
  const styles = useMemo(() => makeStyles(C, neuStd, isDark), [C, neuStd, isDark]);
  // Onyx: one faintDark neu instance — header icon chips (raised), field cards
  // (raisedSoft), pills (raised), and the centered dialogs (raisedModal).
  const neu = useNeu(undefined, { faintDark: true });
  const currency = useSettingsStore((s) => s.currency);
  const editTypeLabel = useCallback((key: ExtractionIntent): string => {
    switch (key) {
      case 'expense': return t.notes.typeExpense;
      case 'income': return t.notes.typeIncome;
      case 'subscription': return t.notes.typeBill ?? 'Bill';
      case 'debt': return t.notes.typeDebt;
      case 'debt_update': return t.notes.typePayment;
      case 'savings_goal': return t.notes.typeSavings ?? 'Savings';
      case 'playbook': return t.notes.typePlaybook;
      default: return String(key);
    }
  }, [t]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pageId: string = route.params?.pageId;

  const page = useNotesStore((s) => s.pages.find((p) => p.id === pageId));
  const updatePageContent = useNotesStore((s) => s.updatePageContent);
  const deletePage = useNotesStore((s) => s.deletePage);
  const updateExtraction = useNotesStore((s) => s.updateExtraction);

  // Single unified text (plain — stays the source of truth for extraction/title)
  const [text, setText] = useState(page?.content ?? '');
  const textRef = useRef(text);
  textRef.current = text;

  // ── Rich formatting (offset-based metadata over the plain text) ──
  const updatePageFormatting = useNotesStore((s) => s.updatePageFormatting);
  const [formatting, setFormatting] = useState<NoteFormatting>(() => page?.formatting ?? EMPTY_FORMATTING);
  const formattingRef = useRef(formatting);
  formattingRef.current = formatting;
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [noteFocused, setNoteFocused] = useState(false);
  // Pending inline formats set at a caret (tap B → type bold), applied to the
  // next inserted characters — mirrors iOS Notes.
  const [pending, setPending] = useState<Partial<Record<InlineAttr, boolean>>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const justTypedRef = useRef(false);

  const renderModel = useMemo(() => buildRenderModel(text, formatting), [text, formatting]);

  const [showPaywall, setShowPaywall] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  // Measurable wrappers for the walk-through spotlight (the TextInput ref is
  // taken by inputRef; these give the guide clean measureInWindow targets).
  const guideTargetRef = useRef<any>(null);
  const extractPillRef = useRef<any>(null);
  const hasUnsavedRef = useRef(false);

  const {
    isClassifying,
    extractionSource,
    extractions,
    queryAnswer,
    statusMessage,
    classify,
    retry,
    confirmExtraction,
    skipExtraction,
  } = useIntentEngine({
    pageId,
    onSetupWallet: (presetId) =>
      navigation.navigate('WalletManagement', { prefillPreset: presetId }),
  });

  const {
    isRecording,
    isTranscribing,
    liveTranscript,
    error: voiceError,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
  } = useVoiceInput({
    onResult: (transcription) => {
      const separator = text.trim() ? '\n' : '';
      handleTextChange(text + separator + transcription);
    },
  });

  const handleSkip = useCallback((id: string) => {
    const ext = extractions.find((e) => e.id === id);
    if (ext?.extractedData.description) {
      useLearningStore.getState().learnSkip(ext.extractedData.description);
    }
    skipExtraction(id);
  }, [extractions, skipExtraction]);

  const pendingExtractions = extractions.filter((e) => e.status === 'pending');
  const [showExtractModal, setShowExtractModal] = useState(false);
  const prevPendingCountRef = useRef(0);
  const isMountRef = useRef(true);

  // Edit modal state
  const [editingExtraction, setEditingExtraction] = useState<AIExtraction | null>(null);
  const [editType, setEditType] = useState<ExtractionIntent>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPerson, setEditPerson] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editWalletId, setEditWalletId] = useState('');
  const [editDebtType, setEditDebtType] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [editModalAnim, setEditModalAnim] = useState<'fade' | 'none'>('fade');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [multilineFocused, setMultilineFocused] = useState(false);

  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);
  const addWallet = useWalletStore((s) => s.addWallet);

  const editCategories = editType === 'income' ? incomeCategories : expenseCategories;
  const showEditCategory = ['expense', 'income', 'subscription', 'savings_goal'].includes(editType);
  const showEditWallet = ['expense', 'income', 'subscription'].includes(editType);
  const showEditPerson = ['debt', 'debt_update'].includes(editType);
  const showEditDebtDirection = editType === 'debt';

  // UX-C1 swap-in: align with QuickAddExpense canonical contract.
  // Every saved expense/income transaction must have a walletId. When the
  // user has zero wallets, auto-create a default "Cash" wallet rather than
  // silently saving wallet-less. Mirrors QuickAddExpense.ensureDefaultWalletId.
  const ensureDefaultWalletId = useCallback((): string | null => {
    const existing = wallets.find((w) => w.isDefault) || wallets[0];
    if (existing) return existing.id;
    if (wallets.length === 0) {
      addWallet({
        name: t.quickAdd.cashWalletName,
        type: 'ewallet',
        balance: 0,
        icon: 'dollar-sign',
        color: C.accent,
        isDefault: true,
      });
      const fresh = useWalletStore.getState().wallets;
      const created = fresh.find((w) => w.isDefault) || fresh[0];
      return created?.id || null;
    }
    return null;
  }, [wallets, addWallet, t, C.accent]);

  const handleEditNavToSettings = useCallback(() => {
    setEditModalAnim('none');
    setEditingExtraction(null);
    setTimeout(() => {
      navigation.navigate('SettingsDetail', { section: 'money', scrollTo: 'categories' });
      setEditModalAnim('fade');
    }, 50);
  }, [navigation]);

  // Auto-open modal when new extractions appear (not on initial mount)
  useEffect(() => {
    if (isMountRef.current) {
      isMountRef.current = false;
      prevPendingCountRef.current = pendingExtractions.length;
      return;
    }
    if (pendingExtractions.length > 0 && prevPendingCountRef.current === 0) {
      setShowExtractModal(true);
    }
    prevPendingCountRef.current = pendingExtractions.length;
  }, [pendingExtractions.length]);

  // Auto-close modal when all extractions are handled
  useEffect(() => {
    if (pendingExtractions.length === 0 && showExtractModal) {
      setShowExtractModal(false);
    }
  }, [pendingExtractions.length, showExtractModal]);

  // Auto-focus on mount for new (empty) notes — but NOT while the first-visit
  // walk-through is pending, so the greeting shows in full space instead of
  // being shoved above the keyboard. The guide's "tap here to type" step brings
  // the keyboard up when the user actually taps the input.
  useEffect(() => {
    const guidePending = !useSettingsStore.getState().dismissedHints.includes('guide_note_editor');
    if (!page?.content && !guidePending) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  // If the walk-through is skipped, the mount-only auto-focus above already ran
  // (suppressed), so re-focus once the guide is dismissed and the note is still
  // empty — otherwise a skipped first run lands on a blank note with no keyboard.
  const editorGuideDismissed = useSettingsStore((s) => s.dismissedHints.includes('guide_note_editor'));
  useEffect(() => {
    if (editorGuideDismissed && !page?.content) {
      const id = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorGuideDismissed]);

  // Stable step list (memoized) so ScreenGuide's measure effect runs once per
  // step, not on every keystroke — that churn flickered the step-1 hole and
  // auto-dismissed step 2 when the extract pill unmounted during classification.
  const editorGuideSteps = useMemo<GuideStep[]>(() => [
    // No intro card here — the user was just greeted on the Notes landing, so
    // go straight to the action instead of repeating the same greeting/copy.
    {
      kind: 'doWithMe',
      targetRef: guideTargetRef,
      label: t.guide.noteEditorStep,
      keyboardAware: true,
      // Advance only once the note holds a plausible amount (a digit + a few
      // chars), not on the first debounced keystroke.
      watch: whenStore(
        useNotesStore,
        (s) => { const pg = s.pages.find((p) => p.id === pageId); const c = pg?.content ?? ''; return (/\d/.test(c) && c.trim().length >= 4) ? c.trim().length : 0; },
        (n, base) => n > base,
      ),
    },
    {
      kind: 'doWithMe',
      targetRef: extractPillRef,
      label: t.guide.noteEditorStep2,
      keyboardAware: true,
      dismissKeyboardOnEnter: true,
      // Backstop only — handleExtract dismisses the guide on tap; this covers
      // the case the user extracts some other way.
      watch: whenStore(
        useNotesStore,
        (s) => { const pg = s.pages.find((p) => p.id === pageId); return pg ? pg.extractions.length : 0; },
        (n, base) => n > base,
      ),
    },
  ], [t, pageId]);

  // Track keyboard visibility
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setMultilineFocused(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleTextChange = useCallback(
    (newText: string) => {
      const d = diffRange(textRef.current, newText);
      let nextFmt = remapFormatting(formattingRef.current, d, newText);
      // Apply pending inline formats to freshly-inserted characters.
      const pend = pendingRef.current;
      const isInsert = d.oldEnd === d.start && d.newEnd > d.start;
      if (isInsert) {
        for (const attr of Object.keys(pend) as InlineAttr[]) {
          if (pend[attr]) nextFmt = { ...nextFmt, marks: addAttr(nextFmt.marks, d.start, d.newEnd, attr) };
        }
      }
      if (Object.keys(pendingRef.current).length) { pendingRef.current = {}; setPending({}); }
      justTypedRef.current = true; // let the selection-change that follows this edit pass without clearing pending
      setFormatting(nextFmt);
      formattingRef.current = nextFmt;
      setText(newText);
      textRef.current = newText;
      hasUnsavedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updatePageContent(pageId, newText);
        updatePageFormatting(pageId, formattingRef.current);
        hasUnsavedRef.current = false;
      }, AUTO_SAVE_DELAY);
    },
    [pageId, updatePageContent, updatePageFormatting]
  );

  // Persist formatting immediately (toolbar actions, auto-strike).
  const persistFormatting = useCallback((f: NoteFormatting) => {
    setFormatting(f);
    formattingRef.current = f;
    updatePageFormatting(pageId, f);
  }, [pageId, updatePageFormatting]);

  const handleSelectionChange = useCallback((e: any) => {
    setSelection(e.nativeEvent.selection);
    // Moving the caret (a selection change NOT caused by the edit we just made)
    // drops any pending caret format, so "tap B, tap elsewhere, type" doesn't
    // bold the wrong text.
    if (justTypedRef.current) { justTypedRef.current = false; return; }
    if (Object.keys(pendingRef.current).length) { pendingRef.current = {}; setPending({}); }
  }, []);

  // ── Format toolbar actions ──
  const onToggleInline = useCallback((attr: InlineAttr) => {
    const { start, end } = selectionRef.current;
    if (end > start) {
      persistFormatting({ ...formattingRef.current, marks: toggleAttr(formattingRef.current.marks, start, end, attr) });
    } else {
      setPending((p) => { const next = { ...p, [attr]: !p[attr] }; pendingRef.current = next; return next; });
    }
  }, [persistFormatting]);

  const onSetBlock = useCallback((style: BlockStyle) => {
    const ls = lineStartOf(textRef.current, selectionRef.current.start);
    persistFormatting({ ...formattingRef.current, blocks: setBlock(textRef.current, formattingRef.current.blocks, ls, style) });
  }, [persistFormatting]);

  // Auto-strikethrough: every line Echo has confirmed gets struck through.
  // Re-derived idempotently from ALL confirmed items (not just newly-confirmed),
  // so re-opening a note also strikes any item that couldn't be matched before —
  // e.g. a computed-amount debt line like "ali (16-9)+6".
  useEffect(() => {
    const confirmed = extractions
      .filter((e) => e.status === 'confirmed')
      .map((e) => ({
        amount: e.extractedData?.amount,
        description: e.extractedData?.description,
        person: e.extractedData?.person,
      }));
    if (confirmed.length === 0) return;
    const next = reconcileConfirmedStrikes(textRef.current, formattingRef.current, confirmed);
    if (JSON.stringify(next.marks) !== JSON.stringify(formattingRef.current.marks)) {
      persistFormatting(next);
    }
  }, [extractions, persistFormatting]);

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      mediumTap();
      stopAndTranscribe(); // transcript delivered via onResult (manual stop OR auto-end)
    } else {
      lightTap();
      await startRecording();
    }
  }, [isRecording, stopAndTranscribe, startRecording]);

  const handleCancelVoice = useCallback(() => {
    lightTap();
    cancelRecording();
  }, [cancelRecording]);

  const voiceErrorCopy = useCallback((kind: VoiceErrorKind): string => {
    switch (kind) {
      case 'permission': return t.moneyChat.voicePermDenied;
      case 'no-speech': return t.moneyChat.voiceNoSpeech;
      case 'network': return t.moneyChat.voiceNetwork;
      case 'setup': return t.moneyChat.voiceSetup;
      case 'unavailable': return t.moneyChat.voiceSetup;
      case 'quota': return t.moneyChat.voiceLimit;
      default: return t.moneyChat.voiceNoSpeech;
    }
  }, [t]);

  // Quota → open paywall (gating happens inside startRecording)
  useEffect(() => {
    if (voiceError?.kind === 'quota') setShowPaywall(true);
  }, [voiceError]);

  const runExtract = useCallback(() => {
    // The walk-through's "tap extract" step is complete the instant the user
    // taps here — bow the guide out now so it's robust to the pill unmounting
    // during classification and to the confirmation modal opening on top.
    useSettingsStore.getState().dismissHint('guide_note_editor');
    // Flush pending save so store is up to date
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      updatePageContent(pageId, text);
      updatePageFormatting(pageId, formattingRef.current);
      hasUnsavedRef.current = false;
    }
    // Extract only the NEW/unstruck lines — struck lines are already-saved items,
    // so re-extracting them would surface the whole note again ("11 items found"
    // when 7 are already done). Pass the LIVE text (classify()'s store `page`
    // closure is stale within this same synchronous tick).
    classify(textWithoutStruckLines(text, formattingRef.current.marks));
  }, [classify, text, pageId, updatePageContent, updatePageFormatting]);

  const handleExtract = useCallback(() => {
    lightTap();
    const settings = useSettingsStore.getState();
    const premium = usePremiumStore.getState();
    const geminiUp = isGeminiAvailable();
    const hasCredits = premium.canUseAI();
    const willUseCloud = geminiUp && hasCredits;

    if (!willUseCloud) {
      // No cloud read — out of monthly AI credits, or offline. Tell the user Echo will
      // use the (less accurate) offline reader and let them confirm once, then remember.
      if (!settings.notesOfflineNoticeSeen) {
        Alert.alert(
          t.notes.offlineReaderTitle,
          hasCredits ? t.notes.offlineReaderBodyNoNet : t.notes.offlineReaderBody,
          [
            { text: t.common.cancel, style: 'cancel' },
            { text: t.notes.offlineReaderCta, onPress: () => { settings.setNotesOfflineNoticeSeen(true); runExtract(); } },
          ],
        );
        return;
      }
      runExtract();
      return;
    }

    // Cloud read (spends one AI credit) → one-time consent before any note text leaves
    // the device (mirrors the voice-cloud consent).
    if (!settings.notesAiNoticeSeen) {
      Alert.alert(t.notes.aiConsentTitle, t.notes.aiConsentBody, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.notes.aiConsentCta, onPress: () => { settings.setNotesAiNoticeSeen(true); runExtract(); } },
      ]);
      return;
    }
    runExtract();
  }, [runExtract, t]);

  const handleClearExtractions = useCallback(() => {
    lightTap();
    // "not right?" → smart re-extract, not just a clear. retry() feeds the rejected
    // answer back and re-runs Echo in RETRY mode (stronger model + more reasoning) so
    // it reconsiders. The modal closes, the extract loader shows, and it auto-reopens
    // with the reconsidered result.
    retry();
  }, [retry]);

  const handleEdit = useCallback((id: string) => {
    const ext = pendingExtractions.find((e) => e.id === id);
    if (!ext) return;
    lightTap();
    setShowTypePicker(false);
    setEditingExtraction(ext);
    const validIntents: ExtractionIntent[] = [
      'expense', 'income', 'debt', 'debt_update', 'bnpl',
      'seller_order', 'seller_cost', 'query', 'savings_goal',
      'subscription', 'playbook', 'plain',
    ];
    const safeType = validIntents.includes(ext.type) ? ext.type : 'expense';
    setEditType(safeType);
    setEditAmount(ext.extractedData.amount?.toString() || '');
    setEditDescription(ext.extractedData.description || '');
    setEditPerson(ext.extractedData.person || '');

    // Match category
    const cats = safeType === 'income' ? incomeCategories : expenseCategories;
    const catStr = (ext.extractedData.category || '').toLowerCase().replace(/[\s&]+/g, '_');
    const catMatch = cats.find((c) => c.id === catStr)
      || cats.find((c) => c.name.toLowerCase().replace(/[\s&]+/g, '_') === catStr)
      || cats[0];
    setEditCategoryId(catMatch?.id || 'other');

    // Match wallet
    const walletStr = (ext.extractedData.wallet || '').toLowerCase();
    const walletMatch = wallets.find((w) => w.name.toLowerCase() === walletStr)
      || wallets.find((w) => w.isDefault)
      || wallets[0];
    setEditWalletId(walletMatch?.id || '');

    // Debt direction
    setEditDebtType(ext.extractedData.transactionType === 'income' ? 'they_owe' : 'i_owe');
  }, [pendingExtractions, expenseCategories, incomeCategories, wallets]);

  const handleEditSave = useCallback(() => {
    if (!editingExtraction) return;
    mediumTap();
    const amount = parseFloat(editAmount) || 0;
    const orig = editingExtraction;
    const desc = editDescription || orig.extractedData.description || '';

    // Learn from corrections
    const learn = useLearningStore.getState();
    if (editType !== orig.type) {
      learn.learnTypeCorrection(desc, editType);
    }
    if (editPerson && editPerson !== (orig.extractedData.person || '')) {
      learn.learnPersonAlias(orig.extractedData.person || desc, editPerson);
    }
    // Learn category association
    const selectedCatId = editCategoryId;
    if (desc && selectedCatId) {
      learn.learnCategory(desc, selectedCatId);
    }
    // Learn wallet association
    const selWallet = wallets.find((w) => w.id === editWalletId);
    if (desc && selWallet) {
      learn.learnWallet(desc, selWallet.name);
    }

    // Resolve category and wallet
    const selectedCat = editCategories.find((c) => c.id === editCategoryId);
    let selectedWallet = wallets.find((w) => w.id === editWalletId);

    // UX-C1: for expense/income, if no wallet was resolved (e.g. zero-wallet
    // user or extraction with no matching wallet name), auto-create the
    // canonical Cash wallet so the saved transaction has a walletId.
    if (!selectedWallet && (editType === 'expense' || editType === 'income')) {
      const ensuredId = ensureDefaultWalletId();
      if (ensuredId) {
        selectedWallet = useWalletStore.getState().wallets.find((w) => w.id === ensuredId);
      }
    }

    // For debt, derive transactionType from debt direction
    const txnType = editType === 'debt'
      ? (editDebtType === 'they_owe' ? 'income' : 'expense')
      : (editType === 'income' ? 'income' : 'expense');

    updateExtraction(pageId, orig.id, {
      type: editType,
      extractedData: {
        amount,
        description: editDescription,
        person: editPerson || null,
        category: selectedCat?.id || orig.extractedData.category,
        wallet: selectedWallet?.name || orig.extractedData.wallet,
        transactionType: txnType,
      },
    });
    const id = orig.id;
    setEditingExtraction(null);
    confirmExtraction(id);
  }, [editingExtraction, editType, editAmount, editDescription, editPerson, editCategoryId, editWalletId, editDebtType, editCategories, wallets, pageId, updateExtraction, confirmExtraction, ensureDefaultWalletId]);

  const handleEditCancel = useCallback(() => {
    setEditingExtraction(null);
  }, []);

  // Flush save on unmount / back
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hasUnsavedRef.current) {
        updatePageContent(pageId, textRef.current);
        updatePageFormatting(pageId, formattingRef.current);
      }
    };
  }, [pageId, updatePageContent, updatePageFormatting]);

  const handleBack = useCallback(() => {
    // Flush pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (hasUnsavedRef.current) {
      updatePageContent(pageId, text);
      updatePageFormatting(pageId, formattingRef.current);
      hasUnsavedRef.current = false;
    }
    // Delete empty pages
    if (!text.trim()) {
      deletePage(pageId);
    }
    navigation.goBack();
  }, [text, pageId, updatePageContent, updatePageFormatting, deletePage, navigation]);

  const handleDelete = useCallback(() => {
    warningNotification();
    Alert.alert(t.notes.deleteNoteSingular, t.notes.cannotUndo, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          deletePage(pageId);
          navigation.goBack();
        },
      },
    ]);
  }, [pageId, deletePage, navigation]);

  if (!page) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t.notes.noteNotFound}</Text>
      </View>
    );
  }

  const dateLabel = format(page.updatedAt, 'dd MMM yyyy, HH:mm');

  // ── Toolbar state derived from the current selection ──
  const baseActive = activeAttrs(formatting.marks, selection.start, selection.end);
  const displayActive: Record<InlineAttr, boolean> = {
    b: pending.b ?? baseActive.b,
    i: pending.i ?? baseActive.i,
    u: pending.u ?? baseActive.u,
    s: pending.s ?? baseActive.s,
  };
  const curLineStart = lineStartOf(text, selection.start);
  const currentBlock: BlockStyle =
    formatting.blocks.find((b) => lineStartOf(text, b.at) === curLineStart)?.style
    ?? defaultBlockStyle(curLineStart);

  const blockStyleFor = (block: BlockStyle) =>
    block === 'title' ? styles.blkTitle : block === 'heading' ? styles.blkHeading : styles.blkBody;
  const inlineStyleFor = (attrs: InlineAttr[]) => {
    const s: any = {};
    if (attrs.includes('b')) s.fontWeight = TYPOGRAPHY.weight.bold;
    if (attrs.includes('i')) s.fontStyle = 'italic';
    const deco: string[] = [];
    if (attrs.includes('u')) deco.push('underline');
    if (attrs.includes('s')) deco.push('line-through');
    if (deco.length) s.textDecorationLine = deco.join(' ');
    if (attrs.includes('s')) s.color = C.textMuted; // struck / Echo-confirmed lines dim out
    return s;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={[styles.backBtn, neu.raised]}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t.common.back}
          accessibilityRole="button"
        >
          <Feather name="chevron-left" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.micBtn,
            neu.raised,
            isRecording && neu.inset,
          ]}
          onPress={handleMicPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={isRecording ? t.notes.stopRecording : t.notes.recordVoice}
          accessibilityRole="button"
          accessibilityState={{ selected: isRecording, busy: isTranscribing }}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={C.bronze} />
          ) : (
            <Feather
              name={isRecording ? 'mic-off' : 'mic'}
              size={18}
              color={isRecording ? C.bronze : C.textMuted}
            />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteBtn, neu.raised]}
          onPress={() => {
            if (!text.trim()) return;
            lightTap();
            const extractionSummary = extractions
              .filter((e) => e.status === 'confirmed' || e.status === 'pending')
              .map((e) => {
                const d = e.extractedData;
                const status = e.status === 'confirmed' ? 'saved' : 'pending';
                return `[${status}] ${e.type}: ${d.description || 'item'} ${currency}${d.amount}${d.person ? ` (${d.person})` : ''}`;
              })
              .join('\n');
            navigation.navigate('MoneyChat', {
              noteContext: text,
              extractionContext: extractionSummary || undefined,
            });
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t.notes.openMoneyChat}
          accessibilityRole="button"
        >
          <Feather name="message-circle" size={18} color={C.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteBtn, neu.raised]}
          onPress={handleDelete}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t.notes.deleteNoteSingular}
          accessibilityRole="button"
        >
          <Feather name="trash-2" size={18} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Writing surface — KeyboardAwareScrollView follows the caret in the multiline
          input so new lines never hide behind the keyboard. bottomOffset clears the
          keyboard + the FormatToolbar (~56px) that floats above it. */}
      <KeyboardAwareScrollView
        ScrollViewComponent={AnimatedGestureScrollView}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={80}
      >
        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{t.notes.recordingHint}</Text>
            <TouchableOpacity
              onPress={handleCancelVoice}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.voiceCancel}
            >
              <Feather name="x" size={14} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {isRecording && !!liveTranscript && (
          <View style={styles.recordingBar}>
            <Text style={[styles.recordingText, { color: C.textSecondary, flex: 1 }]} numberOfLines={4}>
              {liveTranscript}
            </Text>
          </View>
        )}
        {isTranscribing && (
          <View style={styles.recordingBar}>
            <ActivityIndicator size="small" color={C.bronze} />
            <Text style={styles.recordingText}>{t.notes.transcribing}</Text>
          </View>
        )}
        {voiceError && voiceError.kind !== 'quota' && (
          <View style={styles.recordingBar}>
            <Text style={[styles.recordingText, { color: C.bronze }]}>{voiceErrorCopy(voiceError.kind)}</Text>
          </View>
        )}

        <View ref={guideTargetRef} collapsable={false}>
          <TextInput
            ref={inputRef}
            style={styles.unifiedInput}
            onChangeText={handleTextChange}
            onSelectionChange={handleSelectionChange}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => { setNoteFocused(false); pendingRef.current = {}; setPending({}); }}
            placeholder={t.notes.startWritingPlaceholder}
            placeholderTextColor={C.textMuted}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={withAlpha(C.accent, 0.25)}
          >
            {text.length === 0 ? null : renderModel.map((line, li) => (
              <Text key={li} style={blockStyleFor(line.block)}>
                {line.runs.map((run, ri) => (
                  <Text key={ri} style={inlineStyleFor(run.attrs)}>{run.text}</Text>
                ))}
                {li < renderModel.length - 1 ? '\n' : ''}
              </Text>
            ))}
          </TextInput>
        </View>

        {/* First-visit walk-through, do-it-with-me:
            1) type in the REAL input (advance once they've written something),
            2) tap the REAL extract button through the hole (advance the instant
               Echo pulls an amount out) — then the guide bows out so the app's
               own confirmation card is the reveal. */}
        <ScreenGuide id="guide_note_editor" steps={editorGuideSteps} />

        {/* Inline extract button — appears after text */}
        {text.trim().length > 0 && pendingExtractions.length === 0 && !isClassifying && (
          <TouchableOpacity
            ref={extractPillRef}
            style={[styles.extractBtn, neu.raised, { backgroundColor: withAlpha(C.bronze, 0.06) }]}
            onPress={handleExtract}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="flash" size={13} color={C.bronze} />
            <Text style={styles.extractBtnText}>{t.notes.extractLower}</Text>
          </TouchableOpacity>
        )}

        {/* Extracting — Echo is working (spinner + progressing phrases) */}
        {isClassifying && <EchoExtractingLoader />}

        {/* Status message — shows after extraction completes */}
        {statusMessage && !isClassifying && (
          <View style={styles.statusRow}>
            <Feather
              name={extractionSource ? 'zap' : 'info'}
              size={12}
              color={extractionSource === 'ai' ? C.positive : extractionSource === 'local' ? C.bronze : C.textMuted}
            />
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        {/* Reopen pill — shows when modal is closed but extractions pending */}
        {pendingExtractions.length > 0 && !showExtractModal && (
          <TouchableOpacity
            style={[styles.reopenPill, neu.raised, { backgroundColor: withAlpha(C.bronze, 0.08) }]}
            onPress={() => setShowExtractModal(true)}
            activeOpacity={0.7}
          >
            <Feather name="zap" size={13} color={C.bronze} />
            <Text style={styles.reopenText}>
              {pendingExtractions.length} {pendingExtractions.length > 1 ? t.notes.itemsFound : t.notes.itemFound}
            </Text>
          </TouchableOpacity>
        )}

        {/* Query answer — inline */}
        {queryAnswer && (
          <View style={styles.inlineCard}>
            <QueryResultCard answer={queryAnswer} />
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Extraction results modal */}
      <Modal
        visible={showExtractModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtractModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowExtractModal(false)}
          />
          <KeyboardAvoidingView
            style={[styles.extractCard, neu.raisedModal]}
            behavior="padding"
          >
            {/* Close button */}
            <TouchableOpacity
              onPress={() => { setEditingExtraction(null); setShowExtractModal(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.extractClose}
              accessibilityLabel={t.common.close}
              accessibilityRole="button"
            >
              <Feather name="x" size={18} color={C.textMuted} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.extractHeader}>
              <Feather name="zap" size={25} color={C.bronze} />
              <View>
                <Text style={styles.extractTitle}>
                  {pendingExtractions.length} {pendingExtractions.length > 1 ? t.notes.itemsFound : t.notes.itemFound}
                </Text>
                <Text style={styles.extractHint}>
                  {extractionSource === 'ai' ? t.notes.viaAi : extractionSource === 'local' ? t.notes.viaLocalParser : t.notes.tapToEdit}
                </Text>
              </View>
            </View>

            {/* Clear & re-extract */}
            <TouchableOpacity onPress={handleClearExtractions} style={styles.retryBanner} activeOpacity={0.7}>
              <Feather name="refresh-cw" size={12} color={C.bronze} />
              <Text style={styles.retryText}>{t.notes.clearAndReExtract}</Text>
            </TouchableOpacity>

            {/* Extraction cards — always visible */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.extractScroll}
              contentContainerStyle={styles.extractScrollContent}
            >
              {pendingExtractions.map((ext) => (
                <ConfirmationCard
                  key={ext.id}
                  extraction={ext}
                  onConfirm={confirmExtraction}
                  onSkip={handleSkip}
                  onEdit={handleEdit}
                />
              ))}
            </ScrollView>

          </KeyboardAvoidingView>

          {/* Edit overlay — covers entire modal, edit card centered */}
          {editingExtraction && (
            <>
              <Pressable style={styles.editOverlay} onPress={handleEditCancel} />
              <KeyboardAvoidingView
                style={styles.editOverlayCard}
                behavior="padding"
                pointerEvents="box-none"
              >
                <View style={[styles.editInnerCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  style={styles.editScroll}
                  contentContainerStyle={styles.editScrollContent}
                >
                  {/* Header — type selector as pill + close */}
                  <View style={styles.editHeader}>
                    <TouchableOpacity
                      style={[styles.editTypePill, neu.raised, { backgroundColor: withAlpha(C.bronze, 0.08) }]}
                      onPress={() => { lightTap(); setShowTypePicker(true); }}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={intentGlyph(editType)}
                        size={15}
                        color={C.bronze}
                      />
                      <Text style={styles.editTypePillText}>
                        {editTypeLabel(editType)}
                      </Text>
                      <Feather name="chevron-down" size={12} color={C.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleEditCancel}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={t.common.back}
                      accessibilityRole="button"
                    >
                      <Feather name="x" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Amount — hero style */}
                  <View style={styles.editAmountSection}>
                    <Text style={styles.editAmountPrefix}>{currency}</Text>
                    <TextInput
                      style={styles.editAmountInput}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={withAlpha(C.textMuted, 0.4)}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                  </View>

                  {/* Description field card */}
                  <View style={styles.editFieldCard} onStartShouldSetResponder={() => true}>
                    <Text style={styles.editFieldLabel}>{t.notes.description}</Text>
                    <TextInput
                      style={[styles.editFieldInput, styles.editFieldMultiline]}
                      value={editDescription}
                      onChangeText={setEditDescription}
                      placeholder={t.notes.description}
                      placeholderTextColor={C.textMuted}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="default"
                      onFocus={() => setMultilineFocused(true)}
                      onBlur={() => setMultilineFocused(false)}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                  </View>

                  {/* Category */}
                  {showEditCategory && (
                    <View style={styles.editPickerCard}>
                      <CategoryPicker
                        categories={editCategories}
                        selectedId={editCategoryId}
                        onSelect={setEditCategoryId}
                        label={t.notes.category}
                        layout="dropdown"
                        onNavigateToSettings={handleEditNavToSettings}
                      />
                    </View>
                  )}

                  {/* Wallet */}
                  {showEditWallet && wallets.length > 0 && (
                    <View style={styles.editPickerCard}>
                      <WalletPicker
                        wallets={wallets}
                        selectedId={editWalletId}
                        onSelect={setEditWalletId}
                        label={t.notes.wallet}
                      />
                    </View>
                  )}

                  {/* Person + debt direction */}
                  {showEditPerson && (
                    <>
                      <View style={styles.editFieldCard} onStartShouldSetResponder={() => true}>
                        <Text style={styles.editFieldLabel}>{t.notes.person}</Text>
                        <TextInput
                          style={styles.editFieldInput}
                          value={editPerson}
                          onChangeText={setEditPerson}
                          placeholder={t.notes.personName}
                          placeholderTextColor={C.textMuted}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={withAlpha(C.accent, 0.25)}
                        />
                      </View>
                      {showEditDebtDirection && (
                        <View style={styles.editDebtRow}>
                          <TouchableOpacity
                            style={[styles.editDebtToggle, neu.raised, editDebtType === 'they_owe' && styles.editDebtTheyOwe]}
                            onPress={() => setEditDebtType('they_owe')}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.editDebtText, editDebtType === 'they_owe' && styles.editDebtTextTheyOwe]}>
                              {t.notes.theyOweMe}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.editDebtToggle, neu.raised, editDebtType === 'i_owe' && styles.editDebtIOwe]}
                            onPress={() => setEditDebtType('i_owe')}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.editDebtText, editDebtType === 'i_owe' && styles.editDebtTextIOwe]}>
                              {t.notes.iOweThem}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}

                  {/* Confirm — Neu Select (primary olive CTA) */}
                  <NeuButton
                    icon="check"
                    label={t.notes.confirm}
                    onPress={handleEditSave}
                    disabled={!editAmount}
                    style={styles.editConfirmBtn}
                    accessibilityLabel={t.notes.confirm}
                  />
                </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </>
          )}

          {/* Type picker overlay — inside extraction Modal, over edit card */}
          {showTypePicker && (
            <>
              <Pressable
                style={styles.typePickerOverlay}
                onPress={() => setShowTypePicker(false)}
              />
              <View style={styles.typePickerCenter} pointerEvents="box-none">
                <View style={[styles.typePickerCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
                  <Text style={styles.typePickerTitle}>{t.notes.selectType}</Text>
                  {EDIT_TYPES.map((et) => {
                    const active = editType === et.key;
                    return (
                      <TouchableOpacity
                        key={et.key}
                        style={[styles.typePickerOption, active && styles.typePickerOptionActive]}
                        onPress={() => {
                          setEditType(et.key);
                          setShowTypePicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.typePickerIcon, active && styles.typePickerIconActive]}>
                          <MaterialCommunityIcons name={intentGlyph(et.key)} size={19} color={active ? C.bronze : C.textMuted} />
                        </View>
                        <Text style={[styles.typePickerText, active && styles.typePickerTextActive]}>
                          {editTypeLabel(et.key)}
                        </Text>
                        {active && <Feather name="check" size={18} color={C.bronze} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* Floating gold done FAB — LAST element so it's always on top */}
          {keyboardVisible && multilineFocused && (
            <TouchableOpacity
              style={[styles.doneFab, { bottom: keyboardHeight + 16, zIndex: 200 }]}
              onPress={() => Keyboard.dismiss()}
              activeOpacity={0.8}
            >
              <Feather name="check" size={20} color={C.onAccent} />
            </TouchableOpacity>
          )}
        </View>
        <ModalToastHost />
      </Modal>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="ai"
        currentUsage={usePremiumStore.getState().aiCallsCount}
      />

      {/* iOS-Notes-style format bar — pinned above the keyboard while writing */}
      <FormatToolbar
        visible={noteFocused}
        active={displayActive}
        block={currentBlock}
        onToggleInline={onToggleInline}
        onSetBlock={onSetBlock}
        onDismiss={() => Keyboard.dismiss()}
      />
    </View>
  );
};

export default NoteEditor;

const makeStyles = (C: typeof CALM, neuStd: ReturnType<typeof useNeu>, isDark = false) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: SPACING['3xl'],
  },
  unifiedInput: {
    minHeight: 220,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  // Block styles for the rich editor (Title / Heading / Body font sizes).
  blkTitle: {
    fontSize: 26,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    lineHeight: 33,
  },
  blkHeading: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: 27,
  },
  blkBody: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textPrimary,
    lineHeight: 26,
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginLeft: SPACING.xl,
    marginBottom: SPACING.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.full,
  },
  extractBtnText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  inlineCard: {
    paddingHorizontal: SPACING.lg,
    marginBottom: 2,
  },
  reopenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginLeft: SPACING.xl,
    marginBottom: SPACING.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderRadius: RADIUS.full,
  },
  reopenText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Onyx sheet: near-black bg, no outline — separation comes from neu.raisedModal.
  extractCard: {
    width: '88%',
    maxHeight: '75%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  extractClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    zIndex: 20,
  },
  editOverlayCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  editInnerCard: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: C.background,
    borderRadius: RADIUS['2xl'],
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md + 2,
    paddingBottom: SPACING.lg,
  },
  extractHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  extractTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  extractHint: {
    fontSize: 10,
    color: C.bronze,
    fontStyle: 'italic',
  },
  retryBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    marginBottom: SPACING.xs,
  },
  retryText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
  // neu-onyx-vertical-error fix: bleed the clipping ScrollView out to the modal edge + pad
  // content back in so each card's neu shadow has room and isn't cut into vertical lines.
  // extractCard padding is SPACING.xl, so bleed/pad by exactly that. See memory
  // neu-boxshadow-device-seam.
  extractScroll: {
    flexShrink: 1,
    marginHorizontal: -SPACING.xl,
  },
  extractScrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontStyle: 'italic',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.bronze,
  },
  recordingText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING['3xl'],
  },
  // Edit modal — matches MoneyChat ActionEditModal
  editCard: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS['2xl']),
  },
  editClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  // neu-onyx-vertical-error fix: bleed the clipping ScrollView to the card edge + pad content
  // back in so inner neu shadows (pickers, type pill) aren't cut into vertical lines.
  editScroll: {
    marginHorizontal: -SPACING.lg,
  },
  editScrollContent: {
    gap: SPACING.sm + 2,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  editTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm + 4,
  },
  editTypePillText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.1,
  },
  typePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    zIndex: 100,
  },
  typePickerCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    zIndex: 101,
  },
  typePickerCard: {
    width: '80%',
    maxWidth: 300,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: 2,
  },
  typePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  typePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  typePickerOptionActive: {
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  typePickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerIconActive: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  typePickerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  typePickerTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  // Hero amount card — clean flat fill (a drop shadow left vertical seams on the
  // near-black sheet; a faint fill lifts it with no artifact).
  // Onyx field cards: standard neu.raisedSoft raise + near-black face so they read as BLACK
  // raised cards, not grey slabs. Safe now the edit ScrollView bleeds (editScroll) so shadows
  // don't clip. See memory neu-boxshadow-device-seam.
  editAmountSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  editAmountPrefix: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  editAmountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    padding: 0,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  editFieldCard: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  editFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  editFieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    letterSpacing: -0.1,
  },
  editFieldMultiline: {
    minHeight: 44,
    paddingTop: 4,
    paddingBottom: 4,
    lineHeight: 20,
  },
  editPickerCard: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  editDebtRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  editDebtToggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
  },
  editDebtTheyOwe: {
    backgroundColor: withAlpha(C.deepOlive, 0.12),
  },
  editDebtIOwe: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  editDebtText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  editDebtTextTheyOwe: {
    color: C.deepOlive,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  editDebtTextIOwe: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  // NeuButton (Neu Select) supplies the olive fill + neu; this only spaces it.
  editConfirmBtn: {
    marginTop: SPACING.sm,
  },
  // Floating done button
  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
