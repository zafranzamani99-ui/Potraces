/**
 * Hook that connects the NoteEditor to the Intent Engine.
 * Manual-only: user taps "extract" button to trigger classification.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { classifyIntent, IntentResult } from '../services/intentEngine';
import { answerQuery, QueryAnswer } from '../services/queryEngine';
import { isGeminiAvailable } from '../services/geminiClient';
import { usePremiumStore } from '../store/premiumStore';
import { useNotesStore } from '../store/notesStore';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useAppStore } from '../store/appStore';
import { useDebtStore } from '../store/debtStore';
import { useSellerStore } from '../store/sellerStore';
import { usePlaybookStore } from '../store/playbookStore';
import { parseCommitmentSchedule, computeNextBillingDate } from '../utils/commitmentParse';
import { applyGoalContribution } from '../utils/money';
import { AIExtraction } from '../types';
import { useT } from '../i18n';
import { useCalm } from './useCalm';

interface UseIntentEngineOptions {
  pageId: string;
  enabled?: boolean;
}

export type ClassifyStep = 'scanning' | 'ai' | 'local' | null;

interface UseIntentEngineReturn {
  isClassifying: boolean;
  classifyStep: ClassifyStep;
  extractionSource: 'ai' | 'local' | null;
  result: IntentResult | null;
  extractions: AIExtraction[];
  queryAnswer: QueryAnswer | null;
  statusMessage: string | null;
  classify: (currentText?: string) => void;
  retry: () => void;
  confirmExtraction: (extractionId: string) => void;
  skipExtraction: (extractionId: string) => void;
}

export function useIntentEngine({
  pageId,
  enabled = true,
}: UseIntentEngineOptions): UseIntentEngineReturn {
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyStep, setClassifyStep] = useState<ClassifyStep>(null);
  const [extractionSource, setExtractionSource] = useState<'ai' | 'local' | null>(null);
  const [result, setResult] = useState<IntentResult | null>(null);
  const [queryAnswer, setQueryAnswer] = useState<QueryAnswer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = useNotesStore((s) => s.pages.find((p) => p.id === pageId));
  const addExtraction = useNotesStore((s) => s.addExtraction);
  const updateExtractionStatus = useNotesStore((s) => s.updateExtractionStatus);
  const clearPendingExtractions = useNotesStore((s) => s.clearPendingExtractions);
  const wallets = useWalletStore((s) => s.wallets);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const addSubscription = usePersonalStore((s) => s.addSubscription);
  const goals = usePersonalStore((s) => s.goals);
  const contributeToGoal = usePersonalStore((s) => s.contributeToGoal);
  const mode = useAppStore((s) => s.mode);

  // Debt store
  const debts = useDebtStore((s) => s.debts);
  const contacts = useDebtStore((s) => s.contacts);
  const addDebt = useDebtStore((s) => s.addDebt);
  const addPayment = useDebtStore((s) => s.addPayment);
  const addContact = useDebtStore((s) => s.addContact);

  // Seller store
  const addIngredientCost = useSellerStore((s) => s.addIngredientCost);
  const getActiveSeason = useSellerStore((s) => s.getActiveSeason);

  const t = useT();
  const C = useCalm();
  const walletNames = wallets.map((w) => w.name);

  const showStatus = useCallback((msg: string, durationMs = 4000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), durationMs);
  }, []);

  const runClassification = useCallback(
    async (text: string) => {
      if (!text.trim() || !enabled) return;
      abortRef.current = false;
      setIsClassifying(true);
      setClassifyStep('scanning');
      setExtractionSource(null);
      setStatusMessage(null);

      const aiWasAvailable = isGeminiAvailable();

      try {
        const intentResult = await classifyIntent(text, walletNames, (step) => {
          if (!abortRef.current) setClassifyStep(step);
        });
        if (abortRef.current) return;

        setExtractionSource(intentResult?.source || null);
        setResult(intentResult);

        // Answer queries inline
        if (intentResult?.intent === 'query') {
          const answer = await answerQuery(text);
          if (!abortRef.current) setQueryAnswer(answer);
        } else {
          setQueryAnswer(null);
        }

        // Add new extractions to the store (skip if already added)
        let addedCount = 0;
        if (intentResult?.extractions) {
          const existingIds = new Set(
            (page?.extractions || [])
              .filter((e) => e.status === 'confirmed' || e.status === 'pending')
              .map((e) => e.rawText)
          );
          for (const extraction of intentResult.extractions) {
            const hasAmount = extraction.extractedData.amount > 0;
            const isQuery = extraction.type === 'query';
            if (!existingIds.has(extraction.rawText) && (hasAmount || isQuery)) {
              addExtraction(pageId, extraction);
              addedCount++;
            }
          }
        }

        // Status feedback
        const usedLocal = intentResult?.source === 'local';
        const aiLeft = usePremiumStore.getState().getRemainingAiCalls();

        if (addedCount > 0 && usedLocal && !aiWasAvailable) {
          // Echo fell back to its offline reader — keep it branded, not technical.
          showStatus(t.notes.toastExtracted, 5000);
        } else if (addedCount > 0) {
          // Cards appeared — no extra message needed
        } else if (intentResult?.intent === 'plain') {
          showStatus(t.notes.toastNoContent);
        } else if (!aiWasAvailable) {
          showStatus(aiLeft <= 0 ? t.notes.toastLimit : t.notes.toastBusy);
        } else if (intentResult?.extractions?.length === 0) {
          showStatus(t.notes.toastNothing);
        } else {
          showStatus(t.notes.toastNothingNew);
        }
      } catch (err) {
        if (__DEV__) console.warn('[useIntentEngine] Classification failed:', err);
        showStatus(t.notes.toastFailed);
      } finally {
        if (!abortRef.current) {
          setIsClassifying(false);
          setClassifyStep(null);
        }
      }
    },
    [pageId, enabled, walletNames, page?.extractions, addExtraction, showStatus, t]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const confirmExtraction = useCallback(
    (extractionId: string) => {
      // Read from store directly to get latest data (important after edit)
      const currentPage = useNotesStore.getState().pages.find((p) => p.id === pageId);
      const extraction = (currentPage?.extractions || []).find(
        (e) => e.id === extractionId
      );
      // Idempotency guard: only a still-pending extraction may be applied. Without
      // this a rapid double-tap on "save" (the card is removed on an async re-render,
      // so it stays pressable for a frame) would re-enter here and create a SECOND
      // transaction/debt/subscription + a second wallet movement.
      if (!extraction || extraction.status !== 'pending') return;

      const { amount, description, category, transactionType, wallet, person } =
        extraction.extractedData;

      // Wallet resolver for money-MOVING confirms (expense/income/playbook): a
      // named wallet if it matches, else the default/first wallet, else create the
      // canonical Cash wallet — so a saved item ALWAYS lands in a real wallet and
      // its balance actually moves (mirrors QuickAdd / NoteEditor's edit path).
      const ensureWalletId = (): string | undefined => {
        const named = wallet
          ? wallets.find((w) => w.name.toLowerCase() === wallet.toLowerCase())
          : undefined;
        if (named) return named.id;
        const fallback = wallets.find((w) => w.isDefault) || wallets[0];
        if (fallback) return fallback.id;
        useWalletStore.getState().addWallet({
          name: t.quickAdd.cashWalletName,
          type: 'ewallet',
          balance: 0,
          icon: 'dollar-sign',
          color: C.accent,
          isDefault: true,
        });
        const fresh = useWalletStore.getState().wallets;
        return (fresh.find((w) => w.isDefault) || fresh[0])?.id;
      };
      // Non-creating resolver — used where a wallet is optional (debt payment).
      const resolveWalletId = () =>
        wallet
          ? wallets.find((w) => w.name.toLowerCase() === wallet.toLowerCase())?.id
          : undefined;

      // ── Expense / Income → personalStore ──
      if (
        (extraction.type === 'expense' || extraction.type === 'income') &&
        amount > 0
      ) {
        const wId = ensureWalletId();
        const txnId = addTransaction({
          amount,
          category: category || 'other',
          description: description || '',
          date: new Date(),
          type: transactionType === 'income' ? 'income' : 'expense',
          mode,
          walletId: wId,
          inputMethod: 'text',
          rawInput: extraction.rawText,
          confidence: 'high',
        });
        // Adjust wallet balance
        if (wId) {
          if (transactionType === 'income') {
            useWalletStore.getState().addToWallet(wId, amount);
          } else {
            useWalletStore.getState().deductFromWallet(wId, amount);
          }
        }
        updateExtractionStatus(pageId, extractionId, 'confirmed', txnId);
        return;
      }

      // ── Debt → debtStore ──
      if (extraction.type === 'debt' && amount > 0 && person) {
        // Find or create contact
        let contact = contacts.find(
          (c) => c.name.toLowerCase() === person.toLowerCase()
        );
        if (!contact) {
          // Use the id addContact actually persists — fabricating our own here
          // produced a phantom contact.id that never matched the stored contact.
          const contactId = addContact({ name: person, isFromPhone: false });
          contact = { id: contactId, name: person, isFromPhone: false };
        }

        // Direction: if transactionType is 'income' → they_owe me, else → i_owe
        const debtType = transactionType === 'income' ? 'they_owe' : 'i_owe';

        const debtId = addDebt({
          contact,
          type: debtType,
          totalAmount: amount,
          description: description || `debt — ${person}`,
          mode,
        });
        updateExtractionStatus(pageId, extractionId, 'confirmed', debtId);
        return;
      }

      // ── Debt Update → find matching debt, add payment ──
      if (extraction.type === 'debt_update' && amount > 0 && person) {
        // Find the most recent unsettled debt with this person
        const matchingDebt = debts.find(
          (d) =>
            d.contact.name.toLowerCase() === person.toLowerCase() &&
            d.status !== 'settled'
        );

        if (matchingDebt) {
          // Cap to what's actually left BEFORE moving the wallet. addPayment already
          // caps the RECORDED payment to the remaining balance, but the wallet delta
          // used the raw amount — overpaying a debt (e.g. "paid Ali 500" on a 300
          // remaining) deducted 500 while recording 300, leaving 200 of invisible
          // cash. Mirror chatActions debt_update: drive both from the capped `pay`.
          const before = Math.max(0, matchingDebt.totalAmount - matchingDebt.paidAmount);
          const pay = Math.min(amount, before);
          if (pay <= 0) {
            // Debt already settled — record nothing and don't touch the wallet.
            updateExtractionStatus(pageId, extractionId, 'confirmed');
            return;
          }
          const pWalletId = resolveWalletId();
          const paymentId = addPayment(matchingDebt.id, {
            amount: pay,
            date: new Date(),
            note: description || 'payment from note',
            walletId: pWalletId,
          });
          // Adjust wallet: i_owe → money out, they_owe → money in
          if (pWalletId) {
            if (matchingDebt.type === 'i_owe') {
              useWalletStore.getState().deductFromWallet(pWalletId, pay);
            } else {
              useWalletStore.getState().addToWallet(pWalletId, pay);
            }
          }
          updateExtractionStatus(pageId, extractionId, 'confirmed', paymentId ?? undefined);
        } else {
          // No matching debt — just mark confirmed
          updateExtractionStatus(pageId, extractionId, 'confirmed');
        }
        return;
      }

      // ── Seller Cost → sellerStore ──
      if (extraction.type === 'seller_cost' && amount > 0) {
        const activeSeason = getActiveSeason();
        const costId = addIngredientCost({
          description: description || 'cost from note',
          amount,
          date: new Date(),
          seasonId: activeSeason?.id,
        });
        updateExtractionStatus(pageId, extractionId, 'confirmed', costId);
        return;
      }

      // ── Subscription / Commitment → personalStore ──
      if (extraction.type === 'subscription' && amount > 0) {
        const data = extraction.extractedData as any;
        // Honor any schedule the parser stated; otherwise re-derive it from the raw
        // text so a late-night "rumah sewa 850 sebulan due 25hb" lands as a monthly
        // commitment due on the 25th — not "today + 1 month".
        const parsed = parseCommitmentSchedule(extraction.rawText || description || '');
        const cycle = (data.billingCycle as any) || parsed.billingCycle;
        const dueDay: number | undefined = data.dueDay ?? parsed.dueDay;
        const installments: number | undefined = data.installments ?? parsed.installments;
        const now = new Date();
        const nextBilling = computeNextBillingDate(now, cycle, dueDay);
        const isInstallment = !!installments && installments > 1;

        addSubscription({
          name: description || 'commitment',
          amount,
          billingCycle: cycle,
          startDate: now,
          nextBillingDate: nextBilling,
          category: category || 'subscription',
          isActive: true,
          reminderDays: 3,
          isInstallment,
          // `amount` is the PER-INSTALLMENT figure (e.g. "3x49.90" → 49.90), so the
          // outstanding balance is amount × count. The parser/prompt extract per-
          // installment amounts, never the plan total.
          ...(isInstallment
            ? {
                totalInstallments: installments,
                completedInstallments: 0,
                outstandingBalance: Math.round(amount * (installments as number) * 100) / 100,
              }
            : {}),
        });
        updateExtractionStatus(pageId, extractionId, 'confirmed');
        return;
      }

      // ── Savings Goal Contribution → personalStore ──
      if (extraction.type === 'savings_goal' && amount > 0) {
        const goalName = description || '';
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(goalName.toLowerCase()) ||
                 goalName.toLowerCase().includes(g.name.toLowerCase())
        );
        if (goal) {
          // Cap to the goal's remaining room so we debit the wallet by the SAME
          // amount the goal absorbs (contributeToGoal caps internally too).
          const { actualAmount } = applyGoalContribution(goal.currentAmount, goal.targetAmount, amount);
          if (actualAmount > 0) {
            // Money leaves a wallet INTO savings — mirror the Goals screen: a linked
            // 'savings' expense + wallet debit, so it isn't double-counted (the goal
            // used to grow while the wallet kept the money).
            const wId = ensureWalletId();
            const linkedTxId = wId
              ? (addTransaction({
                  amount: actualAmount,
                  category: 'savings',
                  description: goal.name,
                  date: new Date(),
                  type: 'expense',
                  mode,
                  walletId: wId,
                  inputMethod: 'text',
                  rawInput: extraction.rawText,
                  linkedGoalId: goal.id,
                }) || undefined)
              : undefined;
            if (wId) useWalletStore.getState().deductFromWallet(wId, actualAmount);
            contributeToGoal(goal.id, actualAmount, description || 'contribution from note', wId, linkedTxId);
            updateExtractionStatus(pageId, extractionId, 'confirmed', goal.id);
          }
          // else: goal already full → leave pending (nothing to contribute).
          return;
        }
        // No matching goal → leave PENDING. Marking it 'confirmed' here used to
        // show "saved" while recording nothing (silent no-op). Keeping it pending
        // lets the user create a matching goal or edit the item instead.
        return;
      }

      // ── Playbook → income tx + playbookStore ──
      if (extraction.type === 'playbook' && amount > 0) {
        const wId = ensureWalletId();
        // Create income transaction
        const txId = addTransaction({
          amount,
          category: category || 'salary',
          description: description || 'income',
          date: new Date(),
          type: 'income',
          mode,
          walletId: wId,
          inputMethod: 'text',
          rawInput: extraction.rawText,
          confidence: 'high',
        });
        if (wId) useWalletStore.getState().addToWallet(wId, amount);

        // Map allocations to PlaybookAllocation[]
        const rawAllocs = extraction.extractedData.allocations || [];
        const allocations = rawAllocs.map((a: any) => ({
          category: a.category || 'other',
          allocatedAmount: a.amount || 0,
        }));

        // Create playbook
        const pbId = usePlaybookStore.getState().createPlaybook({
          name: description || 'playbook',
          sourceAmount: amount,
          sourceTransactionId: txId,
          allocations,
        });
        updateExtractionStatus(pageId, extractionId, 'confirmed', pbId || txId);
        return;
      }

      // ── Seller Order → sellerStore (simplified — no product matching) ──
      // Orders are complex (need items array). Mark confirmed and let user
      // create the full order through NewOrder screen.

      // ── Fallback: mark confirmed ──
      updateExtractionStatus(pageId, extractionId, 'confirmed');
    },
    [
      pageId, wallets, mode, t, C,
      addTransaction, addSubscription, goals, contributeToGoal,
      updateExtractionStatus,
      contacts, debts, addDebt, addPayment, addContact,
      addIngredientCost, getActiveSeason,
    ]
  );

  const skipExtraction = useCallback(
    (extractionId: string) => {
      updateExtractionStatus(pageId, extractionId, 'skipped');
    },
    [pageId, updateExtractionStatus]
  );

  const classify = useCallback((currentText?: string) => {
    const content = currentText || page?.content;
    if (content) {
      runClassification(content);
    }
  }, [page?.content, runClassification]);

  const retry = useCallback(() => {
    clearPendingExtractions(pageId);
    classify();
  }, [clearPendingExtractions, pageId, classify]);

  return {
    isClassifying,
    classifyStep,
    extractionSource,
    result,
    extractions: page?.extractions || [],
    queryAnswer,
    statusMessage,
    classify,
    retry,
    confirmExtraction,
    skipExtraction,
  };
}
