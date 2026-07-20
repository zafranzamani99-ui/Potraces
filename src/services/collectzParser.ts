// Collectz — AI paste-parse for WhatsApp session announcements.
//
// Organizers receive/write announcements like "Futsal Khamis 16/7/2026, 9pm-11pm,
// MG2 Bangi, RM180, RM45/team, roster…" in WhatsApp. Pasting that text here
// prefills the CollectzCreate form. Zero proxy changes: the prompt is built
// client-side and sent through aiProxyFetch like every other AI call.
import { aiProxyFetch } from './aiProxy';

export interface CollectzParsedDraft {
  title: string | null;
  event_at: string | null; // ISO string
  venue: string | null;
  details_text: string | null;
  rules_text: string | null;
  scheme: 'flat' | 'equal' | 'custom' | null;
  total_amount: number | null;
  default_share: number | null;
  pay_by: string | null; // ISO string
  roster: Array<{ name: string; slot: 'active' | 'reserve' }>;
}

const MODEL = 'gemini-3.1-flash-lite';

const PROMPT = `You parse Malaysian WhatsApp group announcements for paid group activities
(futsal, badminton, makan, trips, gifts — anything) into structured JSON.

The messages are informal, often Manglish. Examples of what they look like:
- "Futsal Khamis 16/7/2026, Masa: 9pm-11pm, Tempat: MG2 Bangi, Harga Court: RM180,
   bayar ikut team RM45 satu team, TEAM 1: 1. Mael 2. Syafiq …"
- "Badminton Social Fun Game, 17 July 2026 Friday, 11.00pm-1.00am, Setapak Badminton
   Centre, RM 17, No. Court: 1 and 2, 1. MT 2. Pakcik … Waiting list: 1. Mus …
   payment sebelum jam 6.00 ptg, cancel selepas didenda half payment"

Extract STRICT JSON (no markdown, no commentary) with this exact shape:
{
  "title": string | null,          // short event title, e.g. "Futsal Khamis 16/7/2026"
  "event_at": string | null,       // ISO 8601 start datetime, local +08:00 if no zone given.
                                   // Resolve relative dates against TODAY: %TODAY%.
                                   // Malaysian dates are usually d/m/yyyy.
  "venue": string | null,          // place only, e.g. "MG2 Bangi"
  "details_text": string | null,   // court numbers, play style, attire — non-payment extras.
                                   // Join multiple lines with "\\n". null if none.
  "rules_text": string | null,     // PAYMENT rules only: deadlines, cancel policy,
                                   // who pays whom. "\\n"-joined. null if none.
  "scheme": "flat" | "equal" | "custom" | null,
                                   // flat = fixed price per person ("RM17", "RM 17/player").
                                   // custom = per-team/per-group amounts ("RM45 satu team")
                                   // or mixed amounts. equal = only a total to be divided.
  "total_amount": number | null,   // overall cost if stated (e.g. court RM180)
  "default_share": number | null,  // per-person price for flat; per-group price for custom
  "pay_by": string | null,         // ISO 8601 payment deadline if stated ("sebelum jam 6
                                   // ptg" on event day → that date at 18:00 +08:00)
  "roster": [ { "name": string, "slot": "active" | "reserve" } ]
                                   // Every named person. "Waiting list"/"reserve"/"WL"
                                   // names are slot="reserve". For TEAM lists, include
                                   // every member. Strip leading numbers, emojis, and
                                   // weird whitespace. Keep display names as written.
}

Rules:
- Numbers like "RM180" / "RM 17" → 180 / 17. Never invent amounts.
- If the message is not a group-activity announcement, return every field null
  and an empty roster.
- Output JSON only.`;

/** Parse a pasted WhatsApp announcement into a create-form draft. */
export async function parseCollectzAnnouncement(text: string): Promise<CollectzParsedDraft> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste an announcement first.');

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const prompt = PROMPT.replace('%TODAY%', today);

  const res = await aiProxyFetch({
    provider: 'gemini',
    mode: 'generate',
    model: MODEL,
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

  return {
    title: parsed.title ?? null,
    event_at: parsed.event_at ?? null,
    venue: parsed.venue ?? null,
    details_text: parsed.details_text ?? null,
    rules_text: parsed.rules_text ?? null,
    scheme: parsed.scheme ?? null,
    total_amount: parsed.total_amount ?? null,
    default_share: parsed.default_share ?? null,
    pay_by: parsed.pay_by ?? null,
    roster: Array.isArray(parsed.roster)
      ? parsed.roster
          .filter((r) => r && typeof r.name === 'string' && r.name.trim())
          .map((r) => ({ name: r.name.trim(), slot: r.slot === 'reserve' ? ('reserve' as const) : ('active' as const) }))
      : [],
  };
}
