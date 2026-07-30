/**
 * fillCards — turns the model's card specs (or an app-side default) into fully
 * filled EchoCards, reading every number from the stores. This is the READ-ONLY
 * analog of executeAction: it mutates nothing.
 *
 * The pure decision logic (suppression, floor, model-vs-default) lives in
 * select.ts so it's tsx-testable; this file only adds the live store snapshot.
 */
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useDebtStore } from '../../store/debtStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';
import { useCategoryStore } from '../../store/categoryStore';
import { CardSnapshot } from './builders';
import { selectCards, defaultCardKindForMessage } from './select';
import { isSmallTalk } from '../smallTalk';
import { EchoCard, EchoCardSpec } from './types';

/** Read all the stores once into a plain snapshot for the pure builders. */
export function gatherSnapshot(): CardSnapshot {
  const now = new Date();
  const p = usePersonalStore.getState();
  const mode = useAppStore.getState().mode;
  const expenseCats = useCategoryStore.getState().getExpenseCategories(mode);
  return {
    now,
    currency: useSettingsStore.getState().currency,
    mode,
    transactions: p.transactions,
    subscriptions: p.subscriptions,
    budgets: p.budgets,
    goals: p.goals,
    wallets: useWalletStore.getState().wallets,
    debts: useDebtStore.getState().debts,
    savings: useSavingsStore.getState().accounts,
    expenseCats,
  };
}

/** Live entry point — called from MoneyChat.processResponse / EchoInlineChat. */
export function fillCards(specs: EchoCardSpec[], userMessage: string, hasAction: boolean): EchoCard[] {
  if (hasAction || isSmallTalk(userMessage)) return [];
  if (!specs.length && !defaultCardKindForMessage(userMessage)) return []; // avoid gathering the snapshot for nothing
  return selectCards(specs, userMessage, hasAction, gatherSnapshot());
}
