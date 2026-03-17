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
import { AIExtraction } from '../types';

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
  classify: () => void;
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
          // Local parser worked but AI was unavailable — tell user
          showStatus(`extracted via local parser · ${aiLeft} AI calls left`, 5000);
        } else if (addedCount > 0) {
          // Cards appeared — no extra message needed
        } else if (intentResult?.intent === 'plain') {
          showStatus('no financial content found');
        } else if (!aiWasAvailable) {
          showStatus(aiLeft <= 0
            ? 'AI limit reached this month · using local parser'
            : 'AI temporarily unavailable · using local parser');
        } else if (intentResult?.extractions?.length === 0) {
          showStatus('nothing to extract');
        } else {
          showStatus('nothing new to extract');
        }
      } catch (err) {
        console.warn('[useIntentEngine] Classification failed:', err);
        showStatus('extraction failed — try again');
      } finally {
        if (!abortRef.current) {
          setIsClassifying(false);
          setClassifyStep(null);
        }
      }
    },
    [pageId, enabled, walletNames, page?.extractions, addExtraction, showStatus]
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
      if (!extraction) return;

      const { amount, description, category, transactionType, wallet, person } =
        extraction.extractedData;

      const resolveWalletId = () =>
        wallet
          ? wallets.find((w) => w.name.toLowerCase() === wallet.toLowerCase())?.id
          : undefined;

      // ── Expense / Income → personalStore ──
      if (
        (extraction.type === 'expense' || extraction.type === 'income') &&
        amount > 0
      ) {
        const wId = resolveWalletId();
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
          const contactId = Date.now().toString() + Math.random().toString(36).slice(2, 7);
          contact = { id: contactId, name: person, isFromPhone: false };
          addContact({ name: person, isFromPhone: false });
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
          const pWalletId = resolveWalletId();
          const paymentId = addPayment(matchingDebt.id, {
            amount,
            date: new Date(),
            note: description || 'payment from note',
            walletId: pWalletId,
          });
          // Adjust wallet: i_owe → money out, they_owe → money in
          if (pWalletId) {
            if (matchingDebt.type === 'i_owe') {
              useWalletStore.getState().deductFromWallet(pWalletId, amount);
            } else {
              useWalletStore.getState().addToWallet(pWalletId, amount);
            }
          }
          updateExtractionStatus(pageId, extractionId, 'confirmed', paymentId);
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

      // ── Subscription → personalStore ──
      if (extraction.type === 'subscription' && amount > 0) {
        const cycle = (extraction.extractedData as any).billingCycle || 'monthly';
        const now = new Date();
        const nextBilling = new Date(now);
        if (cycle === 'monthly') nextBilling.setMonth(nextBilling.getMonth() + 1);
        else if (cycle === 'quarterly') nextBilling.setMonth(nextBilling.getMonth() + 3);
        else if (cycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setDate(nextBilling.getDate() + 7);

        addSubscription({
          name: description || 'subscription',
          amount,
          billingCycle: cycle,
          startDate: now,
          nextBillingDate: nextBilling,
          category: category || 'subscription',
          isActive: true,
          reminderDays: 3,
          isInstallment: false,
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
          contributeToGoal(goal.id, amount, description || 'contribution from note');
          updateExtractionStatus(pageId, extractionId, 'confirmed', goal.id);
        } else {
          // No matching goal — just mark confirmed
          updateExtractionStatus(pageId, extractionId, 'confirmed');
        }
        return;
      }

      // ── Playbook → income tx + playbookStore ──
      if (extraction.type === 'playbook' && amount > 0) {
        const wId = resolveWalletId();
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
      pageId, wallets, mode,
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
