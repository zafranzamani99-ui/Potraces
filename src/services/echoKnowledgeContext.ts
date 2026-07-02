/**
 * echoKnowledgeContext.ts — the ONE-BRAIN bridge.
 *
 * The budgeting critic and Echo chat must NOT be two separate AIs. This pure function
 * reads the SAME knowledge the critic reads (myEconomics + echoKnowledge + the debt
 * instruments) and renders a compact, scope-gated text block that can be spliced into
 * Echo's chat system prompt — exactly like learningStore.getPromptHints() already is
 * (moneyChat.ts:870). So one Gemini call can answer "where did my money go?" AND reason
 * about PTPTN / Atome / GOpinjam, grounded in one knowledge source that never drifts.
 *
 * SAFE: pure, imports only the un-wired constants. Imported by nothing in the app yet.
 *
 * Scope-gating is mandatory: the block ships inside every per-call system prompt (no
 * Gemini context-caching field today), so we only emit the slices the message needs —
 * deep instrument detail on debt/loan questions, a short overview otherwise.
 */

import { MY_ECONOMICS } from '../constants/myEconomics';
import { FAILURE_MODES } from '../constants/echoKnowledge';
import { DEBT_INSTRUMENTS, findInstruments, instrumentLine } from '../constants/myDebtInstruments';

export interface KnowledgeScope {
  debtInstruments: boolean;
  failureModes: boolean;
  economics: boolean;
  /** specific instruments the message named (deep detail), else [] */
  named: string[];
}

// EN + Malay + Manglish. The deterministic math is language-agnostic; this only
// decides WHICH knowledge to hand Echo, and Echo replies in whatever language the
// user typed (the LLM speaks BM/Manglish; these templates are EN fallbacks).
const DEBT_RE = /\b(debt|owe|owing|loan|borrow|repay|instal?ment|ansuran|interest|ujrah|riba|faedah|credit ?card|kad ?kredit|bnpl|pay ?later|paylater|atome|spaylater|spay|shopee ?pay|tiktok|grab ?pay|gopinjam|go ?pinjam|tng ?(loan|pinjam)|s ?loan|sloan|boost|payflex|ptptn|mara|jpa|biasiswa|pinjam(an)?|hutang|berhutang|bayar ?balik|langsai|settle|baki|kredit|koperasi|ko-?op|ah ?long)\b/i;
const ECON_RE = /\b(epf|kwsp|petrol|minyak|toll|tol|rent|sewa|zakat|cost of living|kos ?(hidup|sara)|gaji|salary|income|pendapatan|elaun|bil|belanjawanku|afford|mampu|harga|cukup|tak ?cukup)\b/i;
const BUDGET_RE = /\b(budget|bajet|plan|save|saving|simpan(an)?|jimat|berjimat|set aside|breathing room|spend(ing)?|belanja|duit ?raya|duit|wang|money|poket)\b/i;

export function classifyKnowledge(message: string): KnowledgeScope {
  const named = findInstruments(message).map((i) => i.id);
  const debt = DEBT_RE.test(message) || named.length > 0;
  return {
    debtInstruments: debt,
    failureModes: debt || BUDGET_RE.test(message),
    economics: ECON_RE.test(message) || BUDGET_RE.test(message),
    named,
  };
}

/**
 * Build the scope-gated knowledge fragment for Echo's chat prompt.
 * Returns '' when the message needs none of it (keeps general chat lean).
 *
 * SECURITY CONTRACT (enforced when wired): `message` is UNTRUSTED. This function never
 * echoes the raw message into its output — it only emits curated constant text (the
 * instruments matched by findInstruments are OUR records, not user text). The caller
 * MUST place this fragment in a system-role segment the model can distinguish from the
 * user turn, so a user can't forge the [ECHO KNOWLEDGE] delimiter. Do not interpolate
 * the raw message here.
 */
export function buildKnowledgePromptHints(message: string): string {
  const scope = classifyKnowledge(message);
  const parts: string[] = [];

  if (scope.economics) {
    const e = MY_ECONOMICS;
    parts.push(
      `MY MONEY FACTS (as of ${e.asOf}; never invent figures): EPF employee ${Math.round(e.epf.employeeRate * 100)}%; ` +
        `RON95 RM${e.petrol.pricePerLitre}/L; zakat ${e.zakat.rate * 100}%; ` +
        `Belanjawanku single adult KL ≈ RM${e.belanjawanku.singleAdultPublicTransport} (public) / RM${e.belanjawanku.singleAdultWithCar} (car).`,
    );
  }

  if (scope.debtInstruments) {
    // deep detail for named instruments; otherwise a short overview of the catalog
    const list = scope.named.length
      ? DEBT_INSTRUMENTS.filter((i) => scope.named.includes(i.id))
      : DEBT_INSTRUMENTS;
    const lines = list.map((i) => `- ${instrumentLine(i)}`);
    const head = scope.named.length
      ? 'MY DEBT — what the user asked about (explain plain, name the real trap):'
      : 'MY DEBT — Echo knows these (PTPTN = a real loan; MARA/JPA = mostly maybe-loans, free only if you keep your side):';
    parts.push(head + '\n' + lines.join('\n'));
  }

  if (scope.failureModes) {
    const fm = FAILURE_MODES.filter((m) => m.scope === 'reality')
      .map((m) => `- ${m.label || m.id.replace(/-/g, ' ')}: ${m.nudge.replace(/\{[^}]+\}/g, '…')}`);
    parts.push('WATCH-FOR (gentle, never alarm, never "you should"):\n' + fm.join('\n'));
  }

  if (!parts.length) return '';
  return '\n[ECHO KNOWLEDGE — ground your answer in this, stay calm, no red, no "you should", use ringgit + months]\n' + parts.join('\n\n') + '\n';
}
