// DebtPromo audio — "Midnight Ledger" sound: driving 108 BPM Am bed + dark SFX set.
// Pure Node, deterministic, no deps. Usage: node scripts/generate-debt-audio.mjs
// Writes public/dsfx-*.wav + public/dmusic.wav
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (!existsSync(out)) mkdirSync(out, { recursive: true });

let seed = 424242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

const writeWav = (name, samples) => {
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

/* ---- dsfx-ping: notification ding (B5 → E6 two-tone), 0.22s — roll-call names ---- */
{
  const n = Math.floor(SR * 0.22);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = t < 0.09 ? 987.77 : 1318.51;
    s[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18) * 0.6;
  }
  writeWav('dsfx-ping.wav', s);
}

/* ---- dsfx-boom: sub thud 64→30Hz, 0.7s — the RM 140 slam beat-stop ---- */
{
  const n = Math.floor(SR * 0.7);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 64 * Math.exp(-t * 7) + 30;
    s[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5.5) * 0.95 + rnd() * Math.exp(-t * 60) * 0.1;
  }
  writeWav('dsfx-boom.wav', s);
}

/* ---- dsfx-whoosh: deep cinematic sweep down, 0.5s — act cuts ---- */
{
  const n = Math.floor(SR * 0.5);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * Math.pow(t, 0.55));
    s[i] = rnd() * env;
  }
  s = lowpass(s, (t) => 2600 * Math.pow(0.12, t / 0.5) + 140);
  writeWav('dsfx-whoosh.wav', s);
}

/* ---- dsfx-riser: airy sweep up into a beat, 0.9s ---- */
{
  const n = Math.floor(SR * 0.9);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.pow(t, 1.6) * (1 - Math.pow(t, 18)); // crescendo, gated at the very end
    s[i] = rnd() * env;
  }
  s = lowpass(s, (t) => 500 + 6500 * Math.pow(t / 0.9, 2));
  writeWav('dsfx-riser.wav', s);
}

/* ---- dsfx-tap: glassy UI click, 40ms ---- */
{
  const n = Math.floor(SR * 0.045);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    s[i] = (Math.sin(2 * Math.PI * 1900 * t) * 0.5 + Math.sin(2 * Math.PI * 2600 * t) * 0.3 + rnd() * 0.5) * Math.exp(-t * 120);
  }
  writeWav('dsfx-tap.wav', s);
}

/* ---- dsfx-pop: rounded bubble blip, 0.12s — chips/cards landing ---- */
{
  const n = Math.floor(SR * 0.12);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 300 * Math.exp(-t * 10) + 480;
    s[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 26);
  }
  writeWav('dsfx-pop.wav', s);
}

/* ---- dsfx-coin: metallic kaching, 0.5s — payments recorded ---- */
{
  const n = Math.floor(SR * 0.5);
  const s = new Float32Array(n);
  const partials = [2093, 2637, 3520, 4699];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 9) * Math.min(1, t / 0.004);
    let v = 0;
    for (let p = 0; p < partials.length; p++) v += Math.sin(2 * Math.PI * partials[p] * t) * (0.5 / (p + 1));
    s[i] = v * env;
  }
  writeWav('dsfx-coin.wav', s);
}

/* ---- dsfx-chime: low warm resolve (A3 E4 A4), 1.3s — settled ---- */
{
  const n = Math.floor(SR * 1.3);
  const s = new Float32Array(n);
  const notes = [
    { f: 220.0, at: 0 },
    { f: 329.63, at: 0.1 },
    { f: 440.0, at: 0.2 },
  ];
  for (const { f, at } of notes) {
    const start = Math.floor(at * SR);
    for (let i = start; i < n; i++) {
      const t = (i - start) / SR;
      const env = Math.exp(-t * 2.6) * Math.min(1, t / 0.01);
      s[i] += (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)) * env * 0.45;
    }
  }
  writeWav('dsfx-chime.wav', s);
}

/* ---- dsfx-burst: sparkle puff, 0.7s — settled particle burst ---- */
{
  const n = Math.floor(SR * 0.7);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 7) * Math.min(1, t / 0.006);
    s[i] = (rnd() * 0.4 + Math.sin(2 * Math.PI * (3200 + 2400 * t) * t) * 0.3) * env;
  }
  s = lowpass(s, 9000);
  writeWav('dsfx-burst.wav', s);
}

/* ---- dmusic: 108 BPM Am groove, 43s — driving kick, bass 8ths, 16th hats,
   bright pluck arp. Mixed to sit UNDER speech: low end + highs, quiet mids. ---- */
{
  const DUR = 43;
  const n = SR * DUR;
  const s = new Float32Array(n);
  const beat = 60 / 108; // 0.556s

  // Am → F → C → Em, 8 beats each, loop (close voicing, kept quiet)
  const chords = [
    [110.0, 164.81, 220.0, 261.63], // Am
    [87.31, 174.61, 220.0, 261.63], // F
    [130.81, 164.81, 196.0, 261.63], // C
    [82.41, 164.81, 196.0, 246.94], // Em
  ];
  const roots = [55.0, 43.65, 65.41, 41.2]; // A1 F1 C2 E1
  const CHORD_LEN = beat * 8;
  for (let c = 0; c < Math.ceil(DUR / CHORD_LEN); c++) {
    const start = Math.floor(c * CHORD_LEN * SR);
    const len = Math.floor(CHORD_LEN * SR);
    for (const f of chords[c % 4]) {
      for (const det of [0.998, 1.002]) {
        const ph = rnd() * Math.PI * 2;
        for (let i = 0; i < len && start + i < n; i++) {
          const t = i / SR;
          const attack = Math.min(1, t / 1.6);
          const release = Math.min(1, (CHORD_LEN - t) / 2.0);
          const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.23 * t + ph);
          s[start + i] +=
            (Math.sin(2 * Math.PI * f * det * t + ph) + 0.25 * Math.sin(4 * Math.PI * f * det * t + ph)) *
            attack * release * lfo * 0.035;
        }
      }
    }
  }

  // driving kick: every beat, deep 58→40Hz thump
  for (let b = 0; b * beat < DUR; b++) {
    const start = Math.floor(b * beat * SR);
    for (let i = 0; i < SR * 0.2 && start + i < n; i++) {
      const t = i / SR;
      const f = 58 * Math.exp(-t * 11) + 40;
      s[start + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 8) * 0.8;
    }
  }

  // bass 8ths: chord root pulse, on + off beat (enters 4s)
  for (let b = 0; b * beat < DUR; b++) {
    const tSec = b * beat;
    if (tSec < 4) continue;
    const root = roots[Math.floor(tSec / CHORD_LEN) % 4];
    for (const off of [0, 0.5]) {
      const start = Math.floor((tSec + off * beat) * SR);
      for (let i = 0; i < SR * 0.16 && start + i < n; i++) {
        const t = i / SR;
        s[start + i] += Math.sin(2 * Math.PI * root * t) * Math.exp(-t * 14) * (off ? 0.22 : 0.3);
      }
    }
  }

  // clap on beats 2 & 4
  for (let b = 1; b * beat < DUR; b += 2) {
    const start = Math.floor(b * beat * SR);
    for (let i = 0; i < SR * 0.09 && start + i < n; i++) {
      const t = i / SR;
      s[start + i] += rnd() * Math.exp(-t * 38) * 0.2;
    }
  }

  // hats: straight 16ths, quiet (enters 8s)
  for (let b = 0; b * beat < DUR; b++) {
    if (b * beat < 8) continue;
    for (let h = 0; h < 4; h++) {
      const off = Math.floor((b + h * 0.25) * beat * SR);
      for (let i = 0; i < SR * 0.02 && off + i < n; i++) {
        s[off + i] += rnd() * Math.exp((-i / SR) * 320) * (h % 2 ? 0.045 : 0.07);
      }
    }
  }

  // bright pluck arp: A C E G wandering, every beat, enters 2s
  const arp = [220.0, 261.63, 329.63, 392.0];
  for (let b = 0; b * beat < DUR; b++) {
    const tSec = b * beat;
    if (tSec < 2) continue;
    const f = arp[Math.abs(Math.floor(rnd() * 100)) % 4] * 2;
    const start = Math.floor(tSec * SR);
    for (let i = 0; i < SR * 0.3 && start + i < n; i++) {
      const t = i / SR;
      s[start + i] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 9) * 0.055;
    }
  }

  writeWav('dmusic.wav', lowpass(s, 5200));
}

console.log('Done.');
