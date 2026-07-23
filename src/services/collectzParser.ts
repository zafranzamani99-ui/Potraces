// Collectz — AI paste-parse for WhatsApp session announcements.
//
// Organizers receive/write announcements like "Futsal Khamis 16/7/2026, 9pm-11pm,
// MG2 Bangi, RM180, RM45/team, roster…" in WhatsApp. Pasting that text here
// prefills the CollectzCreate form. Zero proxy changes: the prompt is built
// client-side and sent through aiProxyFetch like every other AI call.
import { aiProxyFetch } from './aiProxy';
import { usePremiumStore } from '../store/premiumStore';

export type CollectzParsedCategory = 'sport' | 'makan' | 'trip' | 'gift' | 'other';

export interface CollectzParsedDraft {
  title: string | null;
  /** Activity kind, so the form pre-picks the right chip + icon set. */
  category: CollectzParsedCategory | null;
  event_at: string | null; // ISO string — start
  event_end: string | null; // ISO string — end (from "9pm-11pm" ranges)
  venue: string | null;
  details_text: string | null;
  rules_text: string | null;
  scheme: 'flat' | 'equal' | 'custom' | null;
  total_amount: number | null;
  default_share: number | null;
  pay_by: string | null; // ISO string
  /** Capacity when the roster is split into numbered TEAM blocks (else null). */
  team_count: number | null;
  team_size: number | null;
  /** Every named person; `team` = their 1-based TEAM block (null if not in one). */
  roster: Array<{ name: string; slot: 'active' | 'reserve'; team: number | null }>;
}

const VALID_CATEGORIES: CollectzParsedCategory[] = ['sport', 'makan', 'trip', 'gift', 'other'];
const VALID_SCHEMES = ['flat', 'equal', 'custom'] as const;

// Middle model (owner call 2026-07-22): announcement parsing is quality-sensitive
// (dates, amounts, rosters) but the feature stays free — quota-metered below.
const MODEL = 'gemini-3.5-flash';

const PROMPT = `You parse Malaysian WhatsApp group announcements for paid group activities
(futsal, badminton, makan, trips, gifts — anything) into structured JSON. The
messages are informal, often Manglish (mixed Malay + English). Read carefully and
extract EVERY useful fact — a shallow parse is worse than none.

Extract STRICT JSON (no markdown, no commentary) with this exact shape:
{
  "title": string | null,          // short event title, e.g. "Futsal Khamis 25/7/2026"
  "category": "sport" | "makan" | "trip" | "gift" | "other" | null,
                                   // Infer from the activity: futsal/badminton/bola/
                                   // gym/hiking/sukan → "sport"; makan/dinner/lunch/
                                   // BBQ/potluck → "makan"; trip/travel/trip/camp/
                                   // outing → "trip"; hadiah/gift/present/kutipan
                                   // hadiah → "gift"; else "other".
  "event_at": string | null,       // ISO 8601 START datetime, local +08:00 if no zone
                                   // given. Resolve relative dates against TODAY:
                                   // %TODAY%. Malaysian dates are usually d/m/yyyy.
  "event_end": string | null,      // ISO 8601 END datetime when a time RANGE is given
                                   // ("Masa: 9pm-11pm" → end 23:00; "11.00pm-1.00am"
                                   // → end is 01:00 the NEXT day). null if only one
                                   // time is stated.
  "venue": string | null,          // place only, e.g. "MG2 Bangi"
  "details_text": string | null,   // The NON-payment extra lines (play style / game
                                   // rules, court numbers, attire), COPIED VERBATIM from
                                   // the message. Keep the ORIGINAL language (leave Malay
                                   // as Malay), wording, bullets and emojis exactly. Do
                                   // NOT translate, summarize, reword, or add anything.
                                   // "\\n"-joined in original order. null if none.
  "rules_text": string | null,     // The PAYMENT-rules lines (how much / who to pay /
                                   // deadline / cancel policy), COPIED VERBATIM from the
                                   // message. Keep the ORIGINAL language, wording, bullets
                                   // and emojis exactly — do NOT translate, summarize,
                                   // reword, or append your own "RM9 each" note. You STILL
                                   // read these lines to compute scheme/amounts below, but
                                   // what you RETURN here is the untouched original text.
                                   // "\\n"-joined in original order. null if none.
  "scheme": "flat" | "equal" | "custom" | null,
                                   // flat = one fixed price EACH PERSON pays.
                                   // equal = only a lump total, to divide by headcount.
                                   // custom = each person owes a DIFFERENT stated amount.
  "total_amount": number | null,   // The overall / court / venue cost if stated ("Harga
                                   // Court: RM180" → 180). ALWAYS capture this even when
                                   // scheme is flat — it is informational, not the split.
  "default_share": number | null,  // The per-PERSON price for scheme "flat".
  "pay_by": string | null,         // ISO 8601 payment deadline if stated ("sebelum jam 6
                                   // ptg" on event day → that date at 18:00 +08:00)
  "team_count": number | null,     // Number of TEAM blocks when the roster is split into
                                   // numbered teams (TEAM 1, TEAM 2 …). null if there are
                                   // no teams (a single flat name list).
  "team_size": number | null,      // Players PER team = the highest slot number inside a
                                   // team block (blocks numbered 1..5 → 5), or an explicit
                                   // "5 orang satu team". null when team_count is null.
  "roster": [ { "name": string, "slot": "active" | "reserve", "team": number | null } ]
                                   // Every named person. "Waiting list"/"reserve"/"WL"
                                   // names are slot="reserve". For TEAM lists include
                                   // every FILLED member across all teams and set "team"
                                   // to their 1-based team number (TEAM 3 → 3); skip blank
                                   // numbered slots. "team" is null when there are no
                                   // teams. Strip leading numbers, emojis, and weird
                                   // whitespace. Keep display names as written.
}

TEAMS (numbered TEAM blocks — "TEAM 1 … TEAM 2 …"):
- Count the blocks → team_count. Read the slot numbering inside a block (1., 2., …)
  → the largest is team_size (usually every block is 1..5 → team_size 5). Use the
  SAME team_size you divide the per-team price by.
- Give every named player a "team" equal to their block's number. Empty numbered
  slots are skipped (no roster entry) but they DO count toward team_size.

PER-TEAM PRICING (important — "RM45 satu team" / "RM45/team" / "bayar ikut team"):
- This is a price for a WHOLE team, not per person. Convert it to a per-person
  "flat" share by dividing by the team size:
    * team size = players-per-team when the message shows numbered team lists
      (e.g. each TEAM block is numbered 1..5 → team size 5), or an explicit
      "5 orang satu team" / "per team 6".
    * scheme = "flat", default_share = round(perTeamPrice / teamSize) to 2 decimals.
- The per-person amount goes into default_share ONLY. The original payment lines
  are returned in rules_text VERBATIM (see its rule above) — do NOT replace them
  with a computed "RM9 each" note or a translation.
- If you genuinely cannot tell the team size, leave scheme=null and
  default_share=null, and put the full "RM45 per team" scheme into rules_text.

Rules:
- Numbers like "RM180" / "RM 17" → 180 / 17. Never invent amounts.
- If the message is not a group-activity announcement, return every field null,
  category null, and an empty roster.
- Output JSON only.

WORKED EXAMPLE — input:
"""
Futsal Khamis 25/7/2026
Masa: 9pm-11pm
Tempat: MG2 Bangi
Harga Court : RM180

Attention ‼️
- Bayar ikut team iaitu RM45 satu team
- Bayar kt kepala team korang baru bayar kt aku. Aku nak RM 45 kt QR aku
- Tak terima bayar sorang sorang
- Sape yang cancel last minit bayar kt team masing masing.

Play style ‼️
- Main 7 minit
- Seri dua dua kluar
- Dalam masa tujuh minit yang leading stay
- King Stay

TEAM 1
1. Mael
2.
3.
4.
5.
TEAM 2
1. Raja Arep
TEAM 3
1. Kai
TEAM 4
1. pg aikol
"""
output (note: details_text and rules_text are the ORIGINAL lines copied word-for-word,
NOT translated — only the numeric fields are computed):
{
  "title": "Futsal Khamis 25/7/2026",
  "category": "sport",
  "event_at": "2026-07-25T21:00:00+08:00",
  "event_end": "2026-07-25T23:00:00+08:00",
  "venue": "MG2 Bangi",
  "details_text": "Play style ‼️\\n- Main 7 minit\\n- Seri dua dua kluar\\n- Dalam masa tujuh minit yang leading stay\\n- King Stay",
  "rules_text": "- Bayar ikut team iaitu RM45 satu team\\n- Bayar kt kepala team korang baru bayar kt aku. Aku nak RM 45 kt QR aku\\n- Tak terima bayar sorang sorang\\n- Sape yang cancel last minit bayar kt team masing masing.",
  "scheme": "flat",
  "total_amount": 180,
  "default_share": 9,
  "pay_by": null,
  "team_count": 4,
  "team_size": 5,
  "roster": [
    { "name": "Mael", "slot": "active", "team": 1 },
    { "name": "Raja Arep", "slot": "active", "team": 2 },
    { "name": "Kai", "slot": "active", "team": 3 },
    { "name": "pg aikol", "slot": "active", "team": 4 }
  ]
}`;

/** Parse a pasted WhatsApp announcement into a create-form draft. */
export async function parseCollectzAnnouncement(text: string): Promise<CollectzParsedDraft> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste an announcement first.');

  // Quota gate — same convention as queryEngine.answerQuery: check before the
  // call, increment only on success. The caller surfaces this like any parse
  // failure (generic error toast in CollectzCreate.handleParse).
  if (!usePremiumStore.getState().canUseAI()) {
    throw new Error('Monthly AI limit reached — resets on the 1st.');
  }

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const prompt = PROMPT.replace('%TODAY%', today);

  const res = await aiProxyFetch({
    provider: 'gemini',
    mode: 'generate',
    model: MODEL,
    source: 'smart-capture', // allowlisted in ai-proxy — usage_events attribution
    payload: {
      contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nMESSAGE:\n${trimmed}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    },
  });

  if (!res.ok) throw new Error('AI parse failed — try again.');

  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('AI parse failed — try again.');

  let parsed: Partial<CollectzParsedDraft>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI parse failed — try again.');
  }

  // Successful parse → count it against the monthly AI quota (queryEngine convention).
  usePremiumStore.getState().incrementAiCalls();

  // The model's JSON is untrusted — validate every enum before it reaches form
  // state. An off-enum value (the per-team wording tempts "per_team") would
  // otherwise un-highlight the scheme picker AND silently drop the parsed share
  // (doSave only writes default_share when scheme==='flat').
  const category =
    parsed.category && VALID_CATEGORIES.includes(parsed.category as CollectzParsedCategory)
      ? (parsed.category as CollectzParsedCategory)
      : null;
  const scheme =
    parsed.scheme && (VALID_SCHEMES as readonly string[]).includes(parsed.scheme)
      ? (parsed.scheme as CollectzParsedDraft['scheme'])
      : null;

  // Teams only count when BOTH count and size are sane positive integers — a
  // half-answer (count without size) can't drive the capacity=teams UI.
  const posInt = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null;
  let team_count = posInt(parsed.team_count);
  let team_size = posInt(parsed.team_size);
  if (team_count == null || team_size == null) {
    team_count = null;
    team_size = null;
  }

  return {
    title: parsed.title ?? null,
    category,
    event_at: parsed.event_at ?? null,
    event_end: parsed.event_end ?? null,
    venue: parsed.venue ?? null,
    details_text: parsed.details_text ?? null,
    rules_text: parsed.rules_text ?? null,
    scheme,
    total_amount: parsed.total_amount ?? null,
    default_share: parsed.default_share ?? null,
    pay_by: parsed.pay_by ?? null,
    team_count,
    team_size,
    roster: Array.isArray(parsed.roster)
      ? parsed.roster
          .filter((r) => r && typeof r.name === 'string' && r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            slot: r.slot === 'reserve' ? ('reserve' as const) : ('active' as const),
            // Keep only in-range team numbers (1..team_count); anything else → null.
            team:
              team_count != null && typeof r.team === 'number' && r.team >= 1 && r.team <= team_count
                ? Math.floor(r.team)
                : null,
          }))
      : [],
  };
}
