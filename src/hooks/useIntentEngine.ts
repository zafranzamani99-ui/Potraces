/**
 * Hook that connects the NoteEditor to the Intent Engine.
 * Manual-only: user taps "extract" button to trigger classification.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { classifyIntent, IntentResult } from '../services/intentEngine';
import { answerQuery, QueryAnswer } from '../services/queryEngine';
import { isGeminiAvailable } from '../services/geminiClient';
import { useNotesStore } from '../store/notesStore';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useAppStore } from '../store/appStore';
import { useDebtStore } from '../store/debtStore';
import { useSellerStore } from '../store/sellerStore';
import { AIExtraction } from '../types';

interface UseIntentEngineOptions {
  pageId: string;
  enabled?: boolean;
}

interface UseIntentEngineReturn {
  isClassifying: boolean;
  result: IntentResult | null;
  extractions: AIExtraction[];
  queryAnswer: QueryAnswer | null;
  statusMessage: string | null;
  classify: () => void;
  confirmExtraction: (extractionId: string) => void;
  skipExtraction: (extractionId: string) => void;
}

export function useIntentEngine({
  pageId,
  enabled = true,
}: UseIntentEngineOptions): UseIntentEngineReturn {
  const [isClassifying, setIsClassifying] = useState(false);
  const [result, setResult] = useState<IntentResult | null>(null);
  const [queryAnswer, setQueryAnswer] = useState<QueryAnswer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = useNotesStore((s) => s.pages.find((p) => p.id === pageId));
  const addExtraction = useNotesStore((s) => s.addExtraction);
  const updateExtractionStatus = useNotesStore((s) => s.updateExtractionStatus);
  const wallets = useWalletStore((s) => s.wallets);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
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
      setStatusMessage(null);

      const aiWasAvailable = isGeminiAvailable();

      try {
        const intentResult = await classifyIntent(text, walletNames);
        if (abortRef.current) return;

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
        if (addedCount > 0) {
          // Cards appeared — no message needed
        } else if (intentResult?.intent === 'plain') {
          showStatus('no financial content found');
        } else if (!aiWasAvailable) {
          showStatus('ai unavailable — try again later');
        } else if (intentResult?.extractions?.length === 0) {
          showStatus('nothing to extract');
        } else {
          showStatus('nothing new to extract');
        }
      } catch (err) {
        console.warn('[useIntentEngine] Classification failed:', err);
        showStatus('extraction failed — try again');
      } finally {
        if (!abortRef.current) setIsClassifying(false);
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
        const txnId = addTransaction({
          amount,
          category: category || 'other',
          description: description || '',
          date: new Date(),
          type: transactionType === 'income' ? 'income' : 'expense',
          mode,
          walletId: resolveWalletId(),
          inputMethod: 'text',
          rawInput: extraction.rawText,
          confidence: 'high',
        });
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
          const paymentId = addPayment(matchingDebt.id, {
            amount,
            date: new Date(),
            note: description || 'payment from note',
            walletId: resolveWalletId(),
          });
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

      // ── Seller Order → sellerStore (simplified — no product matching) ──
      // Orders are complex (need items array). Mark confirmed and let user
      // create the full order through NewOrder screen.
      // Future: match product names → build items array automatically.

      // ── Fallback: mark confirmed ──
      updateExtractionStatus(pageId, extractionId, 'confirmed');
    },
    [
      pageId, wallets, mode,
      addTransaction, updateExtractionStatus,
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

  return {
    isClassifying,
    result,
    extractions: page?.extractions || [],
    queryAnswer,
    statusMessage,
    classify,
    confirmExtraction,
    skipExtraction,
  };
}
