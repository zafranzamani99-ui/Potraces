/**
 * Chat Actions — lets MoneyChat AI execute real actions in the app.
 *
 * The AI includes [ACTION]{...}[/ACTION] blocks in its response.
 * We parse them out, execute via stores, and return confirmations.
 */

import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useWalletStore } from '../store/walletStore';
import { useAppStore } from '../store/appStore';
import { AppMode } from '../types';

// ─── Action Types ────────────────────────────────────────

export type ChatActionType =
  | 'add_expense'
  | 'add_income'
  | 'add_debt'
  | 'add_subscription'
  | 'split_bill';

export interface ChatAction {
  type: ChatActionType;
  amount: number;
  description: string;
  category?: string;
  wallet?: string;
  person?: string;
  debtType?: 'i_owe' | 'they_owe';
  billingCycle?: 'monthly' | 'yearly' | 'weekly';
  people?: string[];      // for split_bill
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

// ─── Executor ────────────────────────────────────────────

export function executeAction(action: ChatAction): ActionResult {
  const mode: AppMode = useAppStore.getState().mode;

  try {
    switch (action.type) {
      case 'add_expense': {
        const walletId = findWalletId(action.wallet);
        usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'other',
          type: 'expense',
          date: new Date(),
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().deductFromWallet(walletId, action.amount);
        return {
          success: true,
          message: `Added expense: ${action.description} — RM ${action.amount.toFixed(2)}`,
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
          date: new Date(),
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().addToWallet(walletId, action.amount);
        return {
          success: true,
          message: `Added income: ${action.description} — RM ${action.amount.toFixed(2)}`,
          action,
        };
      }

      case 'add_debt': {
        const debtType = action.debtType || 'i_owe';
        useDebtStore.getState().addDebt({
          contact: {
            id: Date.now().toString(),
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
        const now = new Date();
        const cycle = action.billingCycle || 'monthly';
        const nextBilling = new Date(now);
        if (cycle === 'monthly') nextBilling.setMonth(nextBilling.getMonth() + 1);
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
        const splitId = useDebtStore.getState().addSplit({
          description: action.description,
          totalAmount: action.amount,
          splitMethod: 'equal',
          participants: people.map((name) => ({
            contact: { id: Date.now().toString() + name, name, isFromPhone: false },
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
            contact: { id: Date.now().toString() + name, name, isFromPhone: false },
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
          message: `Split RM ${action.amount.toFixed(2)} for "${action.description}" — ${people.length} people owe RM ${perPerson.toFixed(2)} each`,
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
   {"type":"add_subscription","amount":NUMBER,"description":"Netflix","billingCycle":"monthly"|"yearly"|"weekly","category":"subscription"}

5. split_bill — Split expense with friends
   {"type":"split_bill","amount":NUMBER,"description":"TEXT","people":["name1","name2"],"category":"food"}

RULES:
- Only include ACTION blocks when the user CLEARLY asks to add/record/create something
- NEVER include ACTION blocks when the user is just asking questions about their finances
- wallet is optional — only include if the user mentions a specific wallet/bank
- Always confirm what you did in your text response
- Use RM amounts — always a number, never a string
- You CAN include MULTIPLE action blocks in one response (e.g. a subscription + debts for each person)
- If info is MISSING (e.g. "share with 5 people" but no names), DO NOT guess — ASK the user for the names first, then create the actions in your NEXT response once they provide them
- For shared expenses: think about the FULL picture. Subscription sharing = 1 subscription action + multiple add_debt actions (one per person who owes)
- ALWAYS ask follow-up questions when you need more details to complete an action properly

EXAMPLE — shared subscription:
User: "netflix rm75 share with ali, abu, ahmad"
Response: I'll add the Netflix subscription and track who owes you.
[ACTION]{"type":"add_subscription","amount":75,"description":"Netflix","billingCycle":"monthly","category":"subscription"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ali","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Abu","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ahmad","debtType":"they_owe"}[/ACTION]`;
