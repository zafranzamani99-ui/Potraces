// Generate Malay neural VO for the Debt promo via edge-tts (ms-MY-OsmanNeural).
// Usage: node scripts/generate-debt-vo.mjs [ids...]   — writes public/dvo-XX.mp3
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = join(root, '.venv', 'bin', 'edge-tts');
const VOICE = process.env.DEBT_VOICE || 'ms-MY-OsmanNeural';
const RATE = process.env.DEBT_RATE || '+6%';
const PITCH = process.env.DEBT_PITCH || '-2Hz';

// One clip per beat — rojak, short, punchy.
const SEGMENTS = [
  { id: '01', text: 'Pay you back later.' },
  { id: '02', text: 'Janji manis je lebih.' },
  { id: '03', text: 'Sekarang, semua masuk Potraces.' },
  { id: '04', text: 'Siapa hutang kau, berapa, bila — semua kat sini.' },
  { id: '05', text: 'Bayar sikit-sikit pun kira.' },
  { id: '06', text: 'Sebal nak kejar? Remind je. Terus WhatsApp.' },
  { id: '07', text: 'Makan sama-sama? Sekali split, terus jadi hutang masing-masing.' },
  { id: '08', text: 'Netflix share? Generate debts, kutip tiap-tiap bulan.' },
  { id: '09', text: 'Settled. Takde awkward dah.' },
  { id: '10', text: 'Potraces. Track, split, settle.' },
];

const outDir = join(root, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
for (const seg of SEGMENTS.filter((s) => !only.length || only.includes(s.id))) {
  const out = join(outDir, `dvo-${seg.id}.mp3`);
  execFileSync(EDGE, ['--voice', VOICE, `--rate=${RATE}`, `--pitch=${PITCH}`, '--text', seg.text, '--write-media', out], { stdio: 'pipe' });
  console.log(`✓ dvo-${seg.id}.mp3  "${seg.text}"`);
}
// marker file so the render pipeline knows VO exists
writeFileSync(join(outDir, 'dvo-manifest.json'), JSON.stringify({ voice: VOICE, rate: RATE, pitch: PITCH, segments: SEGMENTS.map((s) => s.id) }, null, 2));
console.log('Done.');
