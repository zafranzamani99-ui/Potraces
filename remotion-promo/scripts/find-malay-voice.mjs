// Search ElevenLabs shared voice library for a Malaysian voice, add it to the
// account's voice lab, and save VOICE_ID into remotion-promo/.env.
// Usage: node scripts/find-malay-voice.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
if (!KEY) { console.error('Missing ELEVENLABS_API_KEY'); process.exit(1); }
const H = { 'xi-api-key': KEY };

const search = async (q) => {
  const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=30&search=${encodeURIComponent(q)}`, { headers: H });
  if (!r.ok) { console.error(`search "${q}" failed: ${r.status}`); return []; }
  return (await r.json()).voices ?? [];
};

let voices = [...(await search('malaysian')), ...(await search('malay'))];
// prefer voices explicitly tagged with a Malay accent/language
const score = (v) => {
  const acc = `${v.accent ?? ''} ${v.language ?? ''} ${v.name ?? ''} ${v.description ?? ''}`.toLowerCase();
  let s = 0;
  if (acc.includes('malaysian')) s += 4;
  if (acc.includes('malay')) s += 2;
  if ((v.language ?? '').toLowerCase().startsWith('ms')) s += 3;
  s += Math.min(2, (v.cloned_by_count ?? 0) / 500); // mild popularity signal
  return s;
};
voices.sort((a, b) => score(b) - score(a));
const seen = new Set();
voices = voices.filter((v) => !seen.has(v.voice_id) && seen.add(v.voice_id));

if (!voices.length) {
  console.error('No Malay/Malaysian voices found in the shared library.');
  process.exit(1);
}
console.log('Top candidates:');
for (const v of voices.slice(0, 5)) {
  console.log(`  ${v.name}  [${v.gender ?? '?'} · ${v.accent ?? v.language ?? '?'}]  score=${score(v).toFixed(1)}`);
}

const pick = voices[0];
const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${pick.public_owner_id}/${pick.voice_id}`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ new_name: pick.name }),
});
let voiceId = pick.voice_id;
if (add.ok) {
  voiceId = (await add.json()).voice_id ?? voiceId;
  console.log(`Added "${pick.name}" to your voice lab.`);
} else {
  const msg = await add.text();
  // already added is fine — reuse the id
  console.log(`Add note (${add.status}): ${msg.slice(0, 120)}`);
}

// persist VOICE_ID in remotion-promo/.env
const envFile = join(root, '.env');
let env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
env = env.replace(/^VOICE_ID=.*$/m, '').trimEnd() + `\nVOICE_ID=${voiceId}\n`;
writeFileSync(envFile, env);
console.log(`VOICE_ID=${voiceId} saved to .env  → chosen: ${pick.name} (${pick.gender ?? '?'}, ${pick.accent ?? '?'})`);
