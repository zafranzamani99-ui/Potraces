/**
 * Chat Actions — lets MoneyChat AI execute real actions in the app.
 *
 * The AI includes [ACTION]{...}[/ACTION] blocks in its response.
 * We parse them out, execute via stores, and return confirmations.
 */

import { format } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useWalletStore } from '../store/walletStore';
import { useSavingsStore } from '../store/savingsStore';
import { useAppStore } from '../store/appStore';
import { usePlaybookStore } from '../store/playbookStore';
import { computePlaybookStats } from '../utils/playbookStats';
import { AppMode } from '../types';
import { useLearningStore } from '../store/learningStore';

// ─── Action Types ────────────────────────────────────────

export type ChatActionType =
  | 'add_expense'
  | 'add_income'
  | 'add_debt'
  | 'add_subscription'
  | 'split_bill'
  | 'debt_update'
  | 'transfer'
  | 'add_goal_contribution'
  | 'cancel_subscription'
  | 'forgive_debt'
  | 'update_subscription'
  | 'add_bnpl'
  | 'repay_credit'
  | 'update_savings'
  | 'add_savings_account'
  | 'create_goal'
  | 'withdraw_goal';

export interface ChatAction {
  type: ChatActionType;
  amount: number;
  description: string;
  category?: string;
  wallet?: string;
  person?: string;
  debtType?: 'i_owe' | 'they_owe';
  billingCycle?: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
  people?: string[];      // for split_bill
  date?: string;          // ISO date override (default: now)
  fromWallet?: string;    // for transfer
  toWallet?: string;      // for transfer
  goalName?: string;      // for add_goal_contribution
  newAmount?: number;      // for update_subscription
  creditWallet?: string;   // for add_bnpl / repay_credit
  accountName?: string;    // for update_savings / add_savings_account
  accountType?: string;    // for add_savings_account
  initialInvestment?: number; // for add_savings_account
  goalTarget?: number;     // for create_goal
  goalDeadline?: string;   // ISO date for create_goal
  goalIcon?: string;       // for create_goal
  goalColor?: string;      // for create_goal
}

export interface ActionResult {
  success: boolean;
  message: string;
  action: ChatAction;
}

// ─── Parser ──────────────────────────────────────────────

const ACTION_REGEX = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g;

/** Strip markdown code fences that the model might wrap around JSON. */
function cleanJson(raw: string): string {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return s.trim();
}

export function parseActions(text: string): { cleanText: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const cleanText = text.replace(ACTION_REGEX, (_, json) => {
    try {
      const parsed = JSON.parse(cleanJson(json));
      if (parsed.type && typeof parsed.amount === 'number') {
        actions.push(parsed as ChatAction);
      }
    } catch (e) {
      console.warn('[ChatActions] Failed to parse action block:', json, e);
    }
    return '';
  }).trim();

  return { cleanText, actions };
}

// ─── Wallet Resolver ─────────────────────────────────────

function findWalletId(name?: string): string | undefined {
  if (!name) return undefined;
  const wallets = useWalletStore.getState().wallets;
  const lower = name.toLowerCase();
  const match = wallets.find(
    (w) => w.name.toLowerCase() === lower || w.name.toLowerCase().includes(lower)
  );
  return match?.id;
}

// ─── Date resolver ───────────────────────────────────────

function resolveDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ─── Budget impact helper ────────────────────────────────

function getBudgetImpact(category: string): string {
  const { budgets, transactions } = usePersonalStore.getState();
  const budget = budgets.find((b) => b.category.toLowerCase() === category.toLowerCase());
  if (!budget) return '';

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const spent = transactions
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return t.type === 'expense' && t.category === budget.category && d >= monthStart;
    })
    .reduce((s, t) => s + t.amount, 0);

  const left = budget.allocatedAmount - spent;
  if (left > 0) {
    return ` (${category}: RM ${spent.toFixed(0)}/${budget.allocatedAmount.toFixed(0)}, RM ${left.toFixed(0)} breathing room left)`;
  }
  return ` (${category}: RM ${spent.toFixed(0)}/${budget.allocatedAmount.toFixed(0)} — past breathing room)`;
}

// ─── ID generator ───────────────────────────────────────
let _idCounter = 0;
function uniqueId(suffix?: string): string {
  return `${Date.now()}-${++_idCounter}${suffix ? `-${suffix}` : ''}`;
}

// ─── Executor ────────────────────────────────────────────

export function executeAction(action: ChatAction): ActionResult {
  const mode: AppMode = useAppStore.getState().mode;
  const actionDate = resolveDate(action.date);

  // Learn category + wallet associations from executed actions
  const learn = useLearningStore.getState();
  if (action.description && action.category) learn.learnCategory(action.description, action.category);
  if (action.description && action.wallet) learn.learnWallet(action.description, action.wallet);

  try {
    switch (action.type) {
      case 'add_expense': {
        const walletId = findWalletId(action.wallet);
        const txId = usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'other',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().deductFromWallet(walletId, action.amount);
        const impact = getBudgetImpact(action.category || 'other');

        // Playbook auto-link
        let pbNote = '';
        const activePbs = usePlaybookStore.getState().getActivePlaybooks();
        if (activePbs.length === 1) {
          const pb = activePbs[0];
          usePlaybookStore.getState().linkExpense(pb.id, txId);
          usePersonalStore.getState().updateTransaction(txId, {
            playbookLinks: [{ playbookId: pb.id, amount: action.amount }],
          });
          const stats = computePlaybookStats(pb, usePersonalStore.getState().transactions);
          pbNote = ` (${pb.name}: RM ${stats.remaining.toFixed(0)} left)`;
        } else if (activePbs.length > 1) {
          pbNote = ` (${activePbs.length} playbooks active — link it in Budget Planning)`;
        }

        return {
          success: true,
          message: `Added expense: ${action.description} — RM ${action.amount.toFixed(2)}${impact}${pbNote}`,
          action,
        };
      }

      case 'add_income': {
        const walletId = findWalletId(action.wallet);
        usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'income',
          type: 'income',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().addToWallet(walletId, action.amount);
        let incomeMsg = `Added income: ${action.description} — RM ${action.amount.toFixed(2)}`;
        if (action.amount >= 500 && usePlaybookStore.getState().getActivePlaybooks().length < 2) {
          incomeMsg += `\n\nWant to track where this goes? Create a playbook in Budget Planning.`;
        }
        return {
          success: true,
          message: incomeMsg,
          action,
        };
      }

      case 'add_debt': {
        const debtType = action.debtType || 'i_owe';
        useDebtStore.getState().addDebt({
          contact: {
            id: uniqueId(),
            name: action.person || 'someone',
            isFromPhone: false,
          },
          type: debtType,
          totalAmount: action.amount,
          description: action.description,
          category: action.category,
          mode,
        });
        const label = debtType === 'i_owe' ? 'You owe' : 'Owed to you';
        return {
          success: true,
          message: `${label}: ${action.person || 'someone'} — RM ${action.amount.toFixed(2)} (${action.description})`,
          action,
        };
      }

      case 'add_subscription': {
        const now = actionDate;
        const cycle = action.billingCycle || 'monthly';
        const nextBilling = new Date(now);
        if (cycle === 'monthly') nextBilling.setMonth(nextBilling.getMonth() + 1);
        else if (cycle === 'quarterly') nextBilling.setMonth(nextBilling.getMonth() + 3);
        else if (cycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setDate(nextBilling.getDate() + 7);

        usePersonalStore.getState().addSubscription({
          name: action.description,
          amount: action.amount,
          billingCycle: cycle,
          startDate: now,
          nextBillingDate: nextBilling,
          category: action.category || 'subscription',
          isActive: true,
          reminderDays: 3,
          isInstallment: false,
        });
        return {
          success: true,
          message: `Added subscription: ${action.description} — RM ${action.amount.toFixed(2)}/${cycle}`,
          action,
        };
      }

      case 'split_bill': {
        const people = action.people || [];
        if (people.length === 0) {
          return { success: false, message: 'No people specified for split.', action };
        }
        const perPerson = Math.round((action.amount / (people.length + 1)) * 100) / 100;

        // Also record the full amount as an expense
        const walletId = findWalletId(action.wallet);
        usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'food',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().deductFromWallet(walletId, action.amount);

        const splitId = useDebtStore.getState().addSplit({
          description: action.description,
          totalAmount: action.amount,
          splitMethod: 'equal',
          participants: people.map((name) => ({
            contact: { id: uniqueId(name), name, isFromPhone: false },
            amount: perPerson,
            isPaid: false,
          })),
          items: [],
          category: action.category,
          mode,
        });
        // Create individual debts for each person
        for (const name of people) {
          useDebtStore.getState().addDebt({
            contact: { id: uniqueId(name), name, isFromPhone: false },
            type: 'they_owe',
            totalAmount: perPerson,
            description: action.description,
            category: action.category,
            mode,
            splitId,
          });
        }
        return {
          success: true,
          message: `Split RM ${action.amount.toFixed(2)} for "${action.description}" — ${people.length} people owe RM ${perPerson.toFixed(2)} each (expense recorded)`,
          action,
        };
      }

      case 'debt_update': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified for debt payment.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) =>
            d.contact.name.toLowerCase() === personName.toLowerCase() &&
            d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        const walletId = findWalletId(action.wallet);
        useDebtStore.getState().addPayment(matchingDebt.id, {
          amount: action.amount,
          date: actionDate,
          note: action.description || 'payment via chat',
          walletId,
        });
        const remaining = matchingDebt.totalAmount - matchingDebt.paidAmount - action.amount;
        const remainMsg = remaining <= 0
          ? `${personName}'s debt is now settled!`
          : `${personName} has RM ${remaining.toFixed(2)} left`;
        return {
          success: true,
          message: `Recorded RM ${action.amount.toFixed(2)} payment — ${remainMsg}`,
          action,
        };
      }

      case 'transfer': {
        const fromId = findWalletId(action.fromWallet);
        const toId = findWalletId(action.toWallet);
        if (!fromId || !toId) {
          const missing = !fromId ? action.fromWallet : action.toWallet;
          return { success: false, message: `Wallet "${missing}" not found.`, action };
        }
        useWalletStore.getState().transferBetweenWallets(
          fromId, toId, action.amount, action.description || 'transfer via chat'
        );
        return {
          success: true,
          message: `Transferred RM ${action.amount.toFixed(2)} from ${action.fromWallet} to ${action.toWallet}`,
          action,
        };
      }

      case 'add_goal_contribution': {
        const goalName = action.goalName || action.description;
        const goals = usePersonalStore.getState().goals;
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(goalName.toLowerCase()) ||
                 goalName.toLowerCase().includes(g.name.toLowerCase())
        );
        if (!goal) {
          return { success: false, message: `No savings goal matching "${goalName}" found.`, action };
        }
        usePersonalStore.getState().contributeToGoal(goal.id, action.amount, action.description || 'contribution via chat');
        const newAmount = Math.min(goal.currentAmount + action.amount, goal.targetAmount);
        const pct = goal.targetAmount > 0 ? Math.round((newAmount / goal.targetAmount) * 100) : 0;
        return {
          success: true,
          message: `Added RM ${action.amount.toFixed(2)} to "${goal.name}" — now at RM ${newAmount.toFixed(2)} (${pct}%)`,
          action,
        };
      }

      case 'cancel_subscription': {
        const subName = action.description;
        const subs = usePersonalStore.getState().subscriptions;
        const sub = subs.find(
          (s) => s.isActive && (
            s.name.toLowerCase().includes(subName.toLowerCase()) ||
            subName.toLowerCase().includes(s.name.toLowerCase())
          )
        );
        if (!sub) {
          return { success: false, message: `No active subscription matching "${subName}" found.`, action };
        }
        usePersonalStore.getState().deleteSubscription(sub.id);
        return {
          success: true,
          message: `Cancelled "${sub.name}" (was RM ${sub.amount.toFixed(2)}/${sub.billingCycle})`,
          action,
        };
      }

      case 'forgive_debt': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) =>
            d.contact.name.toLowerCase() === personName.toLowerCase() &&
            d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        const remaining = matchingDebt.totalAmount - matchingDebt.paidAmount;
        useDebtStore.getState().updateDebt(matchingDebt.id, { status: 'settled' } as any);
        return {
          success: true,
          message: `Forgiven ${personName}'s debt of RM ${remaining.toFixed(2)} — marked as settled`,
          action,
        };
      }

      case 'update_subscription': {
        const subName = action.description;
        const subs = usePersonalStore.getState().subscriptions;
        const sub = subs.find(
          (s) => s.isActive && (
            s.name.toLowerCase().includes(subName.toLowerCase()) ||
            subName.toLowerCase().includes(s.name.toLowerCase())
          )
        );
        if (!sub) {
          return { success: false, message: `No active subscription matching "${subName}" found.`, action };
        }
        const updates: Record<string, any> = {};
        if (action.newAmount !== undefined && action.newAmount > 0) updates.amount = action.newAmount;
        if (action.billingCycle) updates.billingCycle = action.billingCycle;
        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nothing to update — provide newAmount or billingCycle.', action };
        }
        usePersonalStore.getState().updateSubscription(sub.id, updates);
        const amt = updates.amount || sub.amount;
        const cycle = updates.billingCycle || sub.billingCycle;
        return {
          success: true,
          message: `Updated "${sub.name}" — now RM ${amt.toFixed(2)}/${cycle}`,
          action,
        };
      }

      case 'add_bnpl': {
        const walletId = findWalletId(action.creditWallet || action.wallet);
        if (!walletId) {
          return { success: false, message: `Credit wallet "${action.creditWallet || action.wallet}" not found.`, action };
        }
        const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
        if (!wallet || wallet.type !== 'credit') {
          return { success: false, message: `"${action.creditWallet || action.wallet}" is not a credit wallet.`, action };
        }
        useWalletStore.getState().useCredit(walletId, action.amount);
        usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'shopping',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        const newUsed = (wallet.usedCredit || 0) + action.amount;
        const available = (wallet.creditLimit || 0) - newUsed;
        return {
          success: true,
          message: `BNPL purchase: ${action.description} — RM ${action.amount.toFixed(2)} on ${wallet.name} (RM ${available.toFixed(2)} available)`,
          action,
        };
      }

      case 'repay_credit': {
        const creditId = findWalletId(action.creditWallet || action.wallet);
        if (!creditId) {
          return { success: false, message: `Credit wallet "${action.creditWallet || action.wallet}" not found.`, action };
        }
        const creditWallet = useWalletStore.getState().wallets.find((w) => w.id === creditId);
        if (!creditWallet || creditWallet.type !== 'credit') {
          return { success: false, message: `"${action.creditWallet || action.wallet}" is not a credit wallet.`, action };
        }
        // Deduct from source bank wallet if specified
        const fromId = findWalletId(action.fromWallet);
        if (fromId) {
          useWalletStore.getState().deductFromWallet(fromId, action.amount);
        }
        useWalletStore.getState().repayCredit(creditId, action.amount);
        const newUsed = Math.max(0, (creditWallet.usedCredit || 0) - action.amount);
        return {
          success: true,
          message: `Paid RM ${action.amount.toFixed(2)} to ${creditWallet.name} — RM ${newUsed.toFixed(2)} remaining`,
          action,
        };
      }

      case 'update_savings': {
        const savingsStore = useSavingsStore.getState();
        const accounts = savingsStore.accounts;
        const name = action.accountName || action.description;
        const account = accounts.find(
          (a) => a.name.toLowerCase().includes(name.toLowerCase()) ||
                 name.toLowerCase().includes(a.name.toLowerCase())
        );
        if (!account) {
          const available = accounts.map(a => a.name).join(', ');
          return {
            success: false,
            message: `No savings account matching "${name}". You have: ${available || 'none'}`,
            action,
          };
        }
        savingsStore.addSnapshot(account.id, action.amount, action.description || 'updated via chat', 'manual');
        const gain = action.amount - account.initialInvestment;
        const ret = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;
        return {
          success: true,
          message: `Updated ${account.name} to RM ${action.amount.toFixed(2)} (${ret >= 0 ? '+' : ''}${ret.toFixed(1)}% overall)`,
          action,
        };
      }

      case 'add_savings_account': {
        const savingsStore = useSavingsStore.getState();
        if (savingsStore.accounts.length >= 5) {
          return { success: false, message: 'Maximum 5 savings accounts — remove one first.', action };
        }
        savingsStore.addAccount({
          name: action.description || action.accountName || 'New Account',
          type: action.accountType || 'other',
          initialInvestment: action.initialInvestment ?? action.amount,
          currentValue: action.amount,
        });
        return {
          success: true,
          message: `Added savings account "${action.description || action.accountName}" with RM ${action.amount.toFixed(2)}`,
          action,
        };
      }

      case 'create_goal': {
        const goals = usePersonalStore.getState().goals;
        if (goals.length >= 10) {
          return { success: false, message: 'Maximum 10 goals — remove one first.', action };
        }
        const target = action.goalTarget || action.amount;
        if (!target || target <= 0) {
          return { success: false, message: 'Please specify a target amount.', action };
        }
        let deadline: Date | undefined;
        if (action.goalDeadline) {
          const d = new Date(action.goalDeadline);
          if (!isNaN(d.getTime())) deadline = d;
        }
        usePersonalStore.getState().addGoal({
          name: action.description || action.goalName || 'New Goal',
          targetAmount: target,
          deadline,
          category: 'general',
          icon: action.goalIcon || 'target',
          color: action.goalColor || '#4F5104',
        });
        return {
          success: true,
          message: `Created goal "${action.description || action.goalName}" — target RM ${target.toFixed(2)}${deadline ? ` by ${format(deadline, 'dd MMM yyyy')}` : ''}`,
          action,
        };
      }

      case 'withdraw_goal': {
        const goals = usePersonalStore.getState().goals;
        const name = action.goalName || action.description;
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(name.toLowerCase()) ||
                 name.toLowerCase().includes(g.name.toLowerCase())
        );
        if (!goal) {
          const available = goals.map(g => g.name).join(', ');
          return { success: false, message: `No goal matching "${name}". You have: ${available || 'none'}`, action };
        }
        if (action.amount > goal.currentAmount) {
          return { success: false, message: `Can't withdraw RM ${action.amount.toFixed(2)} — goal only has RM ${goal.currentAmount.toFixed(2)}.`, action };
        }
        usePersonalStore.getState().withdrawFromGoal(goal.id, action.amount, action.description || 'withdrawn via chat');
        const newAmount = goal.currentAmount - action.amount;
        const pct = goal.targetAmount > 0 ? Math.round((newAmount / goal.targetAmount) * 100) : 0;
        return {
          success: true,
          message: `Withdrew RM ${action.amount.toFixed(2)} from "${goal.name}" — now at RM ${newAmount.toFixed(2)} (${pct}%)`,
          action,
        };
      }

      default:
        return { success: false, message: `Unknown action: ${action.type}`, action };
    }
  } catch (err: any) {
    return { success: false, message: `Failed: ${err?.message || 'unknown error'}`, action };
  }
}

// ─── Prompt Instructions for Gemini ──────────────────────

export const ACTION_PROMPT = `
ACTION CAPABILITIES:
You can perform real actions in the user's app. When the user asks you to add, record, create, or track something, include an ACTION block in your response.

FORMAT — include this EXACTLY as shown (valid JSON between the tags):
[ACTION]{"type":"add_expense","amount":15.50,"description":"lunch nasi lemak","category":"food"}[/ACTION]

AVAILABLE ACTIONS:
1. add_expense — Record a spending
   {"type":"add_expense","amount":NUMBER,"description":"TEXT","category":"CATEGORY","wallet":"WALLET_NAME"}
   Categories: food, transport, shopping, bills, entertainment, health, education, groceries, other

2. add_income — Record money received
   {"type":"add_income","amount":NUMBER,"description":"TEXT","category":"income","wallet":"WALLET_NAME"}

3. add_debt — Track money owed
   {"type":"add_debt","amount":NUMBER,"description":"TEXT","person":"NAME","debtType":"i_owe"|"they_owe"}

4. add_subscription — Track recurring payment
   {"type":"add_subscription","amount":NUMBER,"description":"Netflix","billingCycle":"monthly"|"yearly"|"weekly"|"quarterly","category":"subscription"}

5. split_bill — Split expense with friends (records the expense AND creates debts)
   {"type":"split_bill","amount":NUMBER,"description":"TEXT","people":["name1","name2"],"category":"food","wallet":"WALLET_NAME"}

6. debt_update — Record a payment on an existing debt
   {"type":"debt_update","amount":NUMBER,"description":"TEXT","person":"NAME","wallet":"WALLET_NAME"}
   Use when someone pays back money or user pays off a debt. Matches the person name to find active debt.

7. transfer — Move money between wallets
   {"type":"transfer","amount":NUMBER,"description":"TEXT","fromWallet":"SOURCE_WALLET","toWallet":"DEST_WALLET"}
   Use when user wants to move money between bank accounts, e-wallets, etc.

8. add_goal_contribution — Save money toward a goal
   {"type":"add_goal_contribution","amount":NUMBER,"description":"TEXT","goalName":"GOAL_NAME"}
   Match goalName to the user's existing savings goals. Use when user says "simpan", "save for", "add to goal", etc.

9. cancel_subscription — Cancel/deactivate a subscription
   {"type":"cancel_subscription","amount":0,"description":"SUBSCRIPTION_NAME"}
   Fuzzy matches the name against active subscriptions. Use when user says "cancel", "stop", "batalkan".

10. forgive_debt — Forgive/write off someone's debt
   {"type":"forgive_debt","amount":0,"description":"TEXT","person":"NAME"}
   Marks the debt as settled without payment. Use when user says "cancel hutang", "lupakan", "forgive", "let it go".

11. update_subscription — Change subscription amount or billing cycle
   {"type":"update_subscription","amount":0,"description":"SUBSCRIPTION_NAME","newAmount":NUMBER,"billingCycle":"monthly"|"yearly"|"weekly"|"quarterly"}
   Fuzzy matches active subscription. Include newAmount and/or billingCycle.

12. add_bnpl — Record a buy-now-pay-later purchase
   {"type":"add_bnpl","amount":NUMBER,"description":"TEXT","category":"CATEGORY","creditWallet":"CREDIT_WALLET_NAME"}
   Records expense AND uses credit on the specified credit wallet (SPayLater, credit card, etc).

13. repay_credit — Pay off credit/BNPL balance
   {"type":"repay_credit","amount":NUMBER,"description":"TEXT","creditWallet":"CREDIT_WALLET_NAME","fromWallet":"BANK_WALLET_NAME"}
   Repays credit wallet balance. fromWallet is optional — if specified, deducts from that bank wallet.

14. update_savings — Update the current value of a savings/investment account
   {"type":"update_savings","amount":NUMBER,"description":"ACCOUNT_NAME","accountName":"ACCOUNT_NAME"}
   Fuzzy matches accountName against user's savings accounts (TNG+, ASB, Tabung Haji, etc).
   Use when user says "TNG+ now RM 5200", "update ASB", "my ASB is at RM 50000 now".

15. add_savings_account — Add a new savings/investment account
   {"type":"add_savings_account","amount":NUMBER,"description":"ACCOUNT_NAME","accountType":"TYPE","initialInvestment":NUMBER}
   Types: tng_plus, robo_crypto, esa, bank, asb, tabung_haji, stocks, gold, other
   Use when user says "add my ASB account", "I opened TNG+ with RM 1000".

16. create_goal — Create a new savings goal
   {"type":"create_goal","amount":NUMBER,"description":"GOAL_NAME","goalTarget":NUMBER,"goalDeadline":"YYYY-MM-DD"}
   amount and goalTarget should be the same (target amount). goalDeadline is optional.
   Use when user says "I want to save for X", "create goal for Y", "nak simpan untuk Z".

17. withdraw_goal — Withdraw/remove money from a goal
   {"type":"withdraw_goal","amount":NUMBER,"description":"GOAL_NAME","goalName":"GOAL_NAME"}
   Use when user says "take RM 500 from japan fund", "keluarkan duit dari goal", "withdraw from emergency fund".

DATE OVERRIDE:
Any action can include "date":"YYYY-MM-DD" to record for a past/future date.
Example: {"type":"add_expense","amount":50,"description":"dinner yesterday","category":"food","date":"2026-03-12"}

RULES:
- Only include ACTION blocks when the user CLEARLY asks to add/record/create something
- NEVER include ACTION blocks when the user is just asking questions about their finances
- wallet is optional — only include if the user mentions a specific wallet/bank
- Always confirm what you did in your text response
- Use RM amounts — always a number, never a string
- You CAN include MULTIPLE action blocks in one response
- If info is MISSING (e.g. "share with 5 people" but no names), DO NOT guess — ASK the user for the names first
- For shared expenses: think about the FULL picture. Subscription sharing = 1 subscription action + multiple add_debt actions
- For debt_update: ALWAYS check the debts context to find the right person. If no matching debt exists, tell the user.
- For transfer: BOTH wallets must be named. If user only mentions one, ASK for the other.
- For add_goal_contribution: match the goal name fuzzy. If no match, tell the user which goals exist.
- After recording an expense, note the budget impact if relevant (the system will append this automatically).
- For update_subscription: only include fields that are changing (newAmount and/or billingCycle).
- For add_bnpl: the creditWallet must be a credit-type wallet (SPayLater, credit card). Records both the expense and credit usage.
- For repay_credit: fromWallet is the bank/ewallet paying off the credit. If user doesn't mention source, omit fromWallet.

EXAMPLES:

Shared subscription:
User: "netflix rm75 share with ali, abu, ahmad"
Response: I'll add the Netflix subscription and track who owes you.
[ACTION]{"type":"add_subscription","amount":75,"description":"Netflix","billingCycle":"monthly","category":"subscription"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ali","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Abu","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ahmad","debtType":"they_owe"}[/ACTION]

Debt payment:
User: "ali bayar rm50"
Response: I'll record Ali's payment.
[ACTION]{"type":"debt_update","amount":50,"description":"Ali's payment","person":"Ali"}[/ACTION]

Wallet transfer:
User: "transfer rm200 from maybank to tng"
Response: Moving RM 200 from Maybank to TNG.
[ACTION]{"type":"transfer","amount":200,"description":"transfer to tng","fromWallet":"Maybank","toWallet":"TNG"}[/ACTION]

Goal contribution:
User: "simpan rm500 for japan trip"
Response: Adding RM 500 to your Japan Trip goal!
[ACTION]{"type":"add_goal_contribution","amount":500,"description":"saving for japan","goalName":"Japan Trip"}[/ACTION]

Past date:
User: "semalam lunch rm12"
Response: Got it — recording yesterday's lunch.
[ACTION]{"type":"add_expense","amount":12,"description":"lunch","category":"food","date":"2026-03-12"}[/ACTION]

Cancel subscription:
User: "cancel gym subscription"
Response: Done — cancelled your gym subscription.
[ACTION]{"type":"cancel_subscription","amount":0,"description":"gym"}[/ACTION]

Forgive debt:
User: "lupakan la hutang ali tu"
Response: Okay — Ali's debt is forgiven.
[ACTION]{"type":"forgive_debt","amount":0,"description":"forgiven","person":"Ali"}[/ACTION]

Update subscription:
User: "netflix naik harga rm65 now"
Response: Updated your Netflix subscription.
[ACTION]{"type":"update_subscription","amount":0,"description":"Netflix","newAmount":65}[/ACTION]

BNPL purchase:
User: "beli phone rm2000 guna spaylater"
Response: Recording your SPayLater purchase.
[ACTION]{"type":"add_bnpl","amount":2000,"description":"phone","category":"shopping","creditWallet":"SPayLater"}[/ACTION]

Credit repayment:
User: "bayar spaylater rm500 from maybank"
Response: Paying off RM 500 on SPayLater.
[ACTION]{"type":"repay_credit","amount":500,"description":"monthly payment","creditWallet":"SPayLater","fromWallet":"Maybank"}[/ACTION]

Update savings:
User: "TNG+ sekarang RM 5200"
Response: Updated your TNG GO+ balance.
[ACTION]{"type":"update_savings","amount":5200,"description":"TNG+","accountName":"TNG+"}[/ACTION]

Add savings account:
User: "aku baru open ASB, letak RM 5000"
Response: Nice — added your ASB account!
[ACTION]{"type":"add_savings_account","amount":5000,"description":"ASB","accountType":"asb","initialInvestment":5000}[/ACTION]

Create goal:
User: "aku nak simpan untuk laptop baru, target RM 5000 by december"
Response: Created your laptop savings goal!
[ACTION]{"type":"create_goal","amount":5000,"description":"Laptop Baru","goalTarget":5000,"goalDeadline":"2026-12-31"}[/ACTION]

Withdraw from goal:
User: "ambil RM 500 dari emergency fund"
Response: Withdrawing from your Emergency Fund.
[ACTION]{"type":"withdraw_goal","amount":500,"description":"Emergency Fund","goalName":"Emergency Fund"}[/ACTION]`;
