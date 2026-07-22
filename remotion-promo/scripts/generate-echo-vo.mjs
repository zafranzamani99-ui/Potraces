// Echo VO — a DIFFERENT, playful persona (female, youthful) via ElevenLabs.
// Searches the shared library for "Nurin" (Friendly/Youthful/Cheerful), adds her,
// saves ECHO_VOICE_ID to .env, then generates evo-XX.mp3 (playful rojak).
// npm run echo-vo   [ids...]  (optional id filter, e.g. `node scripts/generate-echo-vo.mjs 03`)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const p of [join(root, '.env'), join(root, '..', '.env')]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Missing ELEVENLABS_API_KEY'); process.exit(1); }
const H = { 'xi-api-key': KEY };

// resolve a MALAYSIAN male voice (prefer Zain — newsroom, clear MY pronunciation)
let VOICE = process.env.ECHO_VOICE_ID;
if (!VOICE) {
  const r1 = await fetch('https://api.elevenlabs.io/v1/shared-voices?page_size=40&search=Zain', { headers: H });
  const r2 = await fetch('https://api.elevenlabs.io/v1/shared-voices?page_size=40&search=malaysian male', { headers: H });
  const voices = [...(r1.ok ? (await r1.json()).voices ?? [] : []), ...(r2.ok ? (await r2.json()).voices ?? [] : [])].filter((v) => v.gender === 'male');
  const score = (v) => {
    const s = `${v.name} ${v.description ?? ''} ${v.accent ?? ''}`.toLowerCase();
    return (s.includes('zain') ? 4 : 0) + (s.includes('newsroom') ? 3 : 0) + (s.includes('narrat') ? 1 : 0) + ((v.accent ?? '').toLowerCase().includes('malaysian') ? 5 : 0) + ((v.accent ?? '').toLowerCase().includes('malay') ? 2 : 0) - (s.includes('indonesian') ? 6 : 0);
  };
  voices.sort((a, b) => score(b) - score(a));
  const pick = voices[0];
  if (!pick) { console.error('No male voice found; set ECHO_VOICE_ID in .env manually.'); process.exit(1); }
  const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${pick.public_owner_id}/${pick.voice_id}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ new_name: pick.name }) });
  VOICE = add.ok ? (await add.json()).voice_id ?? pick.voice_id : pick.voice_id;
  let env = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
  env = env.replace(/^ECHO_VOICE_ID=.*$/m, '').trimEnd() + `\nECHO_VOICE_ID=${VOICE}\n`;
  writeFileSync(join(root, '.env'), env);
  console.log(`Echo voice: ${pick.name} (${pick.gender}, ${pick.accent}) → ECHO_VOICE_ID=${VOICE}`);
}

// playful rojak persona — no "Manglish" word, uses "rojak" literally
// NOTE: "Eko" is the PHONETIC spelling of the brand "Echo" so the Malay voice
// says "EK-oh", not "eh-cho". On-screen text still reads "Echo".
const SEGMENTS = [
  { id: '01', text: 'Eh, malas nak track duit satu-satu?' },
  { id: '02', text: 'Gunalah Eko dalam Potraces.' },
  { id: '03', text: 'Taip je. Eko dah sedia, kau confirm.' },
  { id: '04', text: 'Split bill? Sekali jadi, semua orang punya bahagian.' },
  { id: '05', text: 'Tanya apa-apa pasal duit kau.' },
  { id: '06', text: 'Cakap ke, tulis ke, snap resit ke — Eko baca semua.' },
  { id: '07', text: 'Tapi Eko tak simpan sendiri tau.' },
  { id: '08', text: 'Kau confirm dulu, baru dia simpan.' },
  { id: '09', text: 'Eko. Cakap rojak je.' },
];

const outDir = join(root, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
// high stability + zero style = maximally consistent to the voice's base (same-person timbre)
const attempts = [
  { model_id: 'eleven_v3', language_code: 'ms', voice_settings: { stability: 0.85, style: 0 } },
  { model_id: 'eleven_v3', voice_settings: { stability: 0.85, style: 0 } },
  { model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.85, similarity_boost: 0.9, style: 0 } },
];
const only = process.argv.slice(2);
for (const seg of SEGMENTS.filter((s) => !only.length || only.includes(s.id))) {
  let done = false;
  for (const a of attempts) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: seg.text, ...a }) });
    if (res.ok) { writeFileSync(join(outDir, `evo-${seg.id}.mp3`), Buffer.from(await res.arrayBuffer())); console.log(`✓ evo-${seg.id}.mp3 [${a.model_id}] "${seg.text}"`); done = true; break; }
    if (res.status >= 500) { console.error(`evo-${seg.id} ${res.status}`); process.exit(1); }
  }
  if (!done) { console.error(`evo-${seg.id} all attempts failed`); process.exit(1); }
}
console.log('Done.');
