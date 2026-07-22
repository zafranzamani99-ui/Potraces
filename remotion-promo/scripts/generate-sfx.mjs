// Synthesize the promo's SFX + music bed as WAVs — pure Node, no deps, deterministic.
// Usage: npm run sfx   → writes public/sfx-*.wav + public/music.wav
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (!existsSync(out)) mkdirSync(out, { recursive: true });

// deterministic noise
let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

const writeWav = (name, samples) => {
  // normalize to -3 dB
  let peak = 1e-9;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = 0.7079 / peak;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain * 32767))), 44 + i * 2);
  }
  writeFileSync(join(out, name), buf);
  console.log(`✓ ${name}  (${(samples.length / SR).toFixed(2)}s)`);
};

// one-pole lowpass
const lowpass = (samples, cutoffAt) => {
  const outArr = new Float32Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    const fc = typeof cutoffAt === 'function' ? cutoffAt(i / SR) : cutoffAt;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (samples[i] - y);
    outArr[i] = y;
  }
  return outArr;
};

/* ---- whoosh: noise sweep, 0.42s — scene cuts ---- */
{
  const n = Math.floor(SR * 0.42);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * Math.pow(t, 0.7)); // fast in, longer out
    s[i] = rnd() * env;
  }
  s = lowpass(s, (t) => 300 + 5200 * Math.sin(Math.PI * Math.min(1, t / 0.42)));
  writeWav('sfx-whoosh.wav', s);
}

/* ---- pop: little UI blip, 0.10s — form fields filling ---- */
{
  const n = Math.floor(SR * 0.1);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 620 * Math.exp(-t * 14) + 160;
    const env = Math.exp(-t * 38);
    s[i] = Math.sin(2 * Math.PI * f * t * (1 + 6 * t)) * env;
  }
  writeWav('sfx-pop.wav', s);
}

/* ---- tick: 25ms soft click — taps ---- */
{
  const n = Math.floor(SR * 0.03);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = rnd() * Math.exp((-i / SR) * 160);
  s = lowpass(s, 6000);
  writeWav('sfx-tick.wav', s);
}

/* ---- chime: warm 3-note success (F5 A5 C6), 1.1s ---- */
{
  const n = Math.floor(SR * 1.1);
  const s = new Float32Array(n);
  const notes = [
    { f: 698.46, at: 0 },
    { f: 880.0, at: 0.09 },
    { f: 1046.5, at: 0.18 },
  ];
  for (const { f, at } of notes) {
    const start = Math.floor(at * SR);
    for (let i = start; i < n; i++) {
      const t = (i - start) / SR;
      const env = Math.exp(-t * 3.4) * Math.min(1, t / 0.008);
      s[i] += (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * env * 0.5;
    }
  }
  writeWav('sfx-chime.wav', s);
}

/* ---- music bed: 24s warm pad + soft pulse @ 92 BPM ---- */
{
  const DUR = 34;
  const n = SR * DUR;
  const s = new Float32Array(n);
  const beat = 60 / 92; // 0.652s

  // Fmaj7 → Am7 → Dm7 → Bbmaj7, 6s each, looping
  const chords = [
    [174.61, 220.0, 261.63, 329.63],
    [220.0, 261.63, 329.63, 392.0],
    [146.83, 174.61, 220.0, 261.63],
    [116.54, 146.83, 174.61, 220.0],
  ];
  const CHORD_LEN = 6;
  for (let c = 0; c < Math.ceil(DUR / CHORD_LEN); c++) {
    const start = c * CHORD_LEN * SR;
    const len = CHORD_LEN * SR;
    for (const f of chords[c % 4]) {
      // two detuned voices per note
      for (const det of [0.9985, 1.0015]) {
        const ph = rnd() * Math.PI;
        for (let i = 0; i < len && start + i < n; i++) {
          const t = i / SR;
          const attack = Math.min(1, t / 1.4);
          const release = Math.min(1, (CHORD_LEN - t) / 1.8);
          const env = attack * release;
          s[start + i] +=
            (Math.sin(2 * Math.PI * f * det * t + ph) + 0.3 * Math.sin(4 * Math.PI * f * det * t + ph)) *
            env * 0.055;
        }
      }
    }
  }

  // soft kick each beat + softer offbeat tick
  for (let b = 0; b * beat < DUR; b++) {
    const start = Math.floor(b * beat * SR);
    for (let i = 0; i < SR * 0.13 && start + i < n; i++) {
      const t = i / SR;
      const f = 95 * Math.exp(-t * 26) + 44;
      s[start + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 22) * 0.5;
    }
    const off = Math.floor((b + 0.5) * beat * SR);
    for (let i = 0; i < SR * 0.02 && off + i < n; i++) {
      s[off + i] += rnd() * Math.exp((-i / SR) * 240) * 0.05;
    }
  }

  writeWav('music.wav', lowpass(s, 4200));
}

console.log('Done.');
