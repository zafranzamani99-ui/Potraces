// Generate the Debt promo VO with ElevenLabs — Malaysian male "Daud M" (eleven_v3).
// Usage: ELEVENLABS_API_KEY (+ VOICE_ID for Daud M) in remotion-promo/.env or repo-root .env
//   node scripts/generate-debt-vo-el.mjs [ids...]   → writes public/dvo-XX.mp3
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const envPath of [join(root, '.env'), join(root, '..', '.env')]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.DAUD_VOICE_ID || process.env.VOICE_ID;
if (!KEY || !VOICE) {
  console.error('Need ELEVENLABS_API_KEY and DAUD_VOICE_ID (or VOICE_ID) in remotion-promo/.env');
  process.exit(1);
}

// Paper v4 script — hook is a 3-person roll-call (one clip per row, frame-
// synced); "Track semua hutang." answers the slam; the turn is ONE flowing
// clip (user preferred its intonation arc over 3 flat isolated reads).
// `vs` merges over the attempt's voice_settings (expressive for feature lines).
const SEGMENTS = [
  { id: '01', text: 'Aiman, 30 ringgit.' },
  { id: '02', text: 'Zikri, makan.' },
  { id: '03', text: 'Mohsin, 50 ringgit.' },
  { id: '04', text: 'Track semua hutang satu tempat.', vs: { stability: 0.5, style: 0.3 } },
  { id: '05', text: 'Ingat barang. Ingat harga. Ingat orang sekali.', vs: { stability: 0.5, style: 0.3 } },
  { id: '06', text: 'Makan keluar? Snap je resit tu.' },
  { id: '07', text: 'AI baca semua. Total, items, siap kira.' },
  { id: '08', text: 'Split ikut kepala ke, sama rata — semua boleh.' },
  { id: '13', text: 'Terus jadi hutang masing-masing.' },
  { id: '09', text: 'Malas nak kejar boleh, tapi jangan malas nak track — nanti halal je hutang tu.' },
  { id: '10', text: 'Remind dari sini — terus masuk WhatsApp, siap QR bayaran.' },
  { id: '14', text: 'Dia bayar — terus collected.' },
  { id: '11', text: 'Share sama-sama Netflix? Track kat sini jugak.' },
  { id: '12', text: 'Hutang. Track dulu. Settle.' },
  /* v7 — problem → promote → tour (expenses · centralized · echo) */
  { id: '16', text: 'Enam belas muflis setiap hari.' },
  { id: '17', text: 'Lima puluh tiga ribu anak muda berhutang.' },
  { id: '18', text: 'Lima perpuluhan satu juta rakyat Malaysia terjebak BNPL.' },
  { id: '19', text: 'Enam puluh satu peratus tak mampu keluar seribu ringgit bila kecemasan.' },
  { id: '20', text: 'Sebab tu kena ada Potraces.' },
  { id: '21', text: 'Setiap sen, terekod.' },
  { id: '22', text: 'Hutang, goals, savings, commitments, bank, e-wallet, semua satu tempat.' },
  { id: '23', text: 'Ada AI dalam — tanya Echo. Dia kira, kau decide.' },
  { id: '24', text: 'Potraces. Track dulu.' },
  { id: '26', text: 'Log expenses? Tiga cara mudah. Backtap, auto log Apple Pay, share screenshot atau resit.' },
  { id: '27', text: 'Resit? Simpan untuk tax relief.' },
  { id: '25', text: 'iPhone, kahwin, trip Japan, notes pun — semua sekali.' },
];

const outDir = join(root, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const ATTEMPTS = [
  { model_id: 'eleven_v3', language_code: 'ms', voice_settings: { stability: 0.62 } },
  { model_id: 'eleven_v3', voice_settings: { stability: 0.62 } },
  { model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.62, similarity_boost: 0.75, style: 0.2 } },
];

const tts = async (text, vs) => {
  for (const attempt of ATTEMPTS) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        ...attempt,
        voice_settings: { ...attempt.voice_settings, ...(vs || {}) },
      }),
    });
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), model: attempt.model_id };
    if (res.status >= 500) throw new Error(`ElevenLabs ${res.status}`);
  }
  throw new Error('all model attempts failed');
};

const only = process.argv.slice(2);
for (const seg of SEGMENTS.filter((s) => !only.length || only.includes(s.id))) {
  const { buf, model } = await tts(seg.text, seg.vs);
  writeFileSync(join(outDir, `dvo-${seg.id}.mp3`), buf);
  console.log(`✓ dvo-${seg.id}.mp3  [${model}]  "${seg.text}"`);
}
console.log('Done.');
