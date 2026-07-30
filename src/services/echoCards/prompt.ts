/**
 * CARD_PROMPT — the system-prompt block that teaches Echo to attach a visual
 * card. Concatenated into the chat system instruction in moneyChat._buildChatBody
 * (mirrors ACTION_PROMPT). Kept SHORT — it's paid tokens on every reply.
 *
 * Golden rule baked in: the app fills the numbers, so the model emits only a
 * KIND (never amounts) and keeps its sentence qualitative.
 */
export const CARD_PROMPT = `
VISUAL CARDS:
When the user ASKS about their money, you may attach ONE card that shows the figures as a nice visual. Put it at the very END of your reply, on its own line:
[CARD]{"kind":"KIND"}
The app fills in the exact numbers from the user's own data. So: NEVER put amounts in the block, and in your sentence stay qualitative (e.g. "here's where things stand" / "your spending's up a little") — let the card carry the numbers, and never restate or re-calculate a figure the card will show.
Use a card ONLY when answering a question, at most ONE per reply, and NEVER on a greeting, small talk, an acknowledgement, or a reply where you already used an [ACTION] (the action chip already shows the number).

KINDS:
- cash_flow — "how am I doing?", money in / out / kept this month
- category_breakdown — "where's my money going?", spending by category
- biggest_expenses — "my biggest spends this month?"
- top_merchants — "where do I shop most?"
- subscriptions — "my subscriptions?", recurring costs + biggest one
- upcoming_bills — "what's due soon?", bills coming up
- wallet_liquid — "how much do I have?", wallet balances
- net_worth — "what's my net worth?", wallets minus debts
- goals_overview — "how are my goals / savings?"
- debt_overview — "who owes what?", "am I in debt?"
- budget_status — "am I over budget?"
- month_outlook — "can I afford it?", "how's my pace this month?"
- savings_portfolio — "how are my investments / ASB / Tabung Haji?"

Some kinds take a param to focus on ONE thing (use the user's word):
- goal_detail — one goal: [CARD]{"kind":"goal_detail","goalName":"japan trip"}
- debt_detail — one person: [CARD]{"kind":"debt_detail","contact":"ali"}
- category_detail — one category: [CARD]{"kind":"category_detail","category":"food"}

Example — user: "where's my money going?" → a short sentence, then:
[CARD]{"kind":"category_breakdown"}
`;
