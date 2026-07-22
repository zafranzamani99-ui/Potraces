// Generate ElevenLabs voiceover clips for the Collectz promo.
// Usage: put ELEVENLABS_API_KEY (and optionally VOICE_ID) in remotion-promo/.env, then: npm run vo
// Writes public/vo-XX.mp3. Timing lives in src/VO.tsx, not here.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// tiny .env reader so this works on any Node 18+ (no dotenv dependency).
// checks remotion-promo/.env first, then the repo-root .env (one level up).
for (const envPath of [join(root, '.env'), join(root, '..', '.env')]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // default: Adam (multilingual). Override in .env.
if (!KEY) {
  console.error('Missing ELEVENLABS_API_KEY. Create remotion-promo/.env with:\n  ELEVENLABS_API_KEY=sk_...\n  VOICE_ID=<optional voice id>');
  process.exit(1);
}

// One clip per caption — long lines SPLIT so no clip outruns its beat.
// v8 narrative: organize the whole event here, not just the kutip.
const SEGMENTS = [
  { id: '01', text: 'Nak organize social game?' },
  { id: '02', text: 'Futsal, badminton, makan-makan, trip.' },
  { id: '03', text: 'Setup Collectz dalam Potraces.' },
  { id: '04', text: 'Paste chat WhatsApp, sambung isi form.' },
  { id: '05', text: 'Share link, advertise game kau.' },
  { id: '06', text: 'Member bukak link, letak nama.' },
  { id: '07', text: 'Pilih team sendiri.' },
  { id: '08', text: 'Scan QR, bayar bila-bila.' },
  { id: '09', text: 'Upload bukti bayaran.' },
  { id: '10', text: 'Kau confirm je, habis cerita.' },
  { id: '11', text: 'Tak payah pening dekat WhatsApp lagi.' },
  { id: '12', text: 'Collectz. Organize, share, settle.' },
];

const outDir = join(root, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Try Malay-capable v3 first, then graceful fallbacks.
const ATTEMPTS = [
  { model_id: 'eleven_v3', language_code: 'ms', voice_settings: { stability: 0.5 } },
  { model_id: 'eleven_v3', voice_settings: { stability: 0.5 } },
  { model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 } },
];

const tts = async (text) => {
  for (const attempt of ATTEMPTS) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, ...attempt }),
    });
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), model: attempt.model_id };
    if (res.status >= 500) throw new Error(`ElevenLabs ${res.status}`);
    // 4xx → model/param unsupported, try next
  }
  throw new Error('all model attempts failed');
};

// optional CLI filter: `node scripts/generate-vo.mjs 04 07` regenerates only those ids
const only = process.argv.slice(2);
for (const seg of SEGMENTS.filter((s) => !only.length || only.includes(s.id))) {
  const { buf, model } = await tts(seg.text);
  writeFileSync(join(outDir, `vo-${seg.id}.mp3`), buf);
  console.log(`✓ vo-${seg.id}.mp3  [${model}]  "${seg.text}"`);
}
console.log('Done. Now flip WITH_VO in src/CollectzPromo.tsx and re-render.');
