// Generate the "Why Potraces" essay VO — ElevenLabs Daud M (eleven_v3, Malay).
// Usage: ELEVENLABS_API_KEY (+ VOICE_ID/DAUD_VOICE_ID) in remotion-promo/.env
//   node scripts/generate-why-vo.mjs [ids...]   → writes public/wvo-XX.mp3
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
const VOICE = process.env.WHY_VOICE_ID || '1wuUVbmqPGK24IaC0QTh'; // Zain — Malay Newsroom Narrator
if (!KEY || !VOICE) {
  console.error('Need ELEVENLABS_API_KEY in remotion-promo/.env');
  process.exit(1);
}

// Documentary essay — problem → suspension → Potraces as the answer.
const SEGMENTS = [
  { id: '01', text: 'Setiap hari, enam belas orang Malaysia diisytiharkan muflis.' },
  { id: '02', text: 'Dan punca nombor satu? Bukan bisnes gagal. Pinjaman peribadi.' },
  { id: '03', text: 'Yang paling muda, baru dua puluh lima tahun. Lima puluh tiga ribu orang bawah tiga puluh — tanggung hutang RM 1.9 bilion.' },
  { id: '04', text: 'BNPL pula? Bayar nanti, rasa macam bukan duit. Lima perpuluhan satu juta pengguna — kebanyakannya gaji bawah lima ribu.' },
  { id: '05', text: 'Enam puluh satu peratus, tak mampu keluar seribu ringgit bila kecemasan.' },
  { id: '06', text: 'Gaji dua ribu lima ratus, kad kredit lima, enam keping. Nak kahwin pun, buat personal loan.' },
  { id: '07', text: 'Dan sembilan puluh peratus anak muda, dah jauh ketinggalan simpanan persaraan.' },
  { id: '08', text: 'Sebenarnya, masalahnya bukan gaji kecil.' },
  { id: '09', text: 'Masalahnya, kita tak nampak duit tu pergi mana.' },
  { id: '10', text: 'Sebab tu Potraces wujud.' },
  { id: '11', text: 'Snap resit, AI baca siap-siap. Cakap je — dia rekod.' },
  { id: '12', text: 'Hutang kawan, split bill, subscription share — semua track. Ingat barang, harga, orang.' },
  { id: '13', text: 'Bukan sebab kau lemah. Sistem yang buat kau lupa. Potraces ingatkan.' },
  { id: '14', text: 'Track dulu. Baru berani belanja.' },
];

const outDir = join(root, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

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
  }
  throw new Error('all model attempts failed');
};

const only = process.argv.slice(2);
for (const seg of SEGMENTS.filter((s) => !only.length || only.includes(s.id))) {
  const { buf, model } = await tts(seg.text);
  writeFileSync(join(outDir, `wvo-${seg.id}.mp3`), buf);
  console.log(`✓ wvo-${seg.id}.mp3  [${model}]  "${seg.text}"`);
}
console.log('Done.');
