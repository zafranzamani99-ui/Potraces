// Echo v2 SFX — SHARP / serious. High-passed transients, glassy dings, tight impacts.
// Same filenames as v1 so EchoSound cues stay valid. npm run echo-sfx
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (!existsSync(out)) mkdirSync(out, { recursive: true });

let seed = 90210;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

const writeWav = (name, s) => {
  let peak = 1e-9;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const g = 0.708 / peak;
  const b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * g * 32767))), 44 + i * 2);
  writeFileSync(join(out, name), b);
  console.log(`✓ ${name} (${(s.length / SR).toFixed(2)}s)`);
};
const lowpass = (s, fc) => { const o = new Float32Array(s.length); let y = 0; for (let i = 0; i < s.length; i++) { const c = typeof fc === 'function' ? fc(i / SR) : fc; const a = 1 - Math.exp((-2 * Math.PI * c) / SR); y += a * (s[i] - y); o[i] = y; } return o; };
const highpass = (s, fc) => { const lp = lowpass(s, fc); const o = new Float32Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s[i] - lp[i]; return o; };

/* SHARP type click ~14ms — high-passed transient */
{ const n = (SR * 0.014) | 0; let s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = rnd() * Math.exp((-i / SR) * 500); writeWav('echo-type.wav', highpass(s, 2500)); }

/* SHARP swish ~0.16s — bright airy sweep */
{ const n = (SR * 0.16) | 0; let s = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / n; s[i] = rnd() * Math.sin(Math.PI * Math.pow(t, 0.55)); } writeWav('echo-send.wav', highpass(lowpass(s, (t) => 3000 + 9000 * (t / 0.16)), 1600)); }

/* SHARP chip tick ~0.09s — glassy up-blip */
{ const n = (SR * 0.09) | 0; const s = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; const f = 1400 + 1400 * (t / 0.09); s[i] = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 40); } writeWav('echo-chip.wav', s); }

/* SHARP confirm — crystal ding (C7 + G7), fast attack, 0.4s */
{ const n = (SR * 0.4) | 0; const s = new Float32Array(n); const notes = [[2093, 0], [3136, 0.05]]; for (const [f, at] of notes) { const st = (at * SR) | 0; for (let i = st; i < n; i++) { const t = (i - st) / SR; s[i] += (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 7) * 0.5; } } writeWav('echo-confirm.wav', s); }

/* thunder — sharp CRACK + low rumble tail, 0.8s (lightning strike) */
{ const n = (SR * 0.8) | 0; let s = new Float32Array(n);
  const crack = (SR * 0.05) | 0; for (let i = 0; i < crack; i++) s[i] += rnd() * Math.exp((-i / SR) * 180) * 1.0;
  for (let i = 0; i < n; i++) { const t = i / SR; s[i] += Math.sin(2 * Math.PI * (55 + 30 * Math.exp(-t * 6)) * t) * Math.exp(-t * 3.5) * 0.7; s[i] += rnd() * Math.exp(-t * 4) * 0.2; }
  writeWav('echo-thunder.wav', lowpass(s, (t) => 8000 * Math.exp(-t * 5) + 400)); }

/* ignite — tight impact: sub thump + sharp crack, 0.5s */
{ const n = (SR * 0.5) | 0; let s = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; s[i] = Math.sin(2 * Math.PI * (70 * Math.exp(-t * 18) + 38) * t) * Math.exp(-t * 10) * 0.9; }
  const crack = (SR * 0.03) | 0; for (let i = 0; i < crack; i++) s[i] += rnd() * Math.exp((-i / SR) * 320) * 0.8;
  writeWav('echo-ignite.wav', s); }

/* music — 100 BPM warm/modern melodic bed: C–G–Am–F pad + gentle arpeggio + soft kick, 34s.
 * Distinct from Collectz (92 BPM Fmaj7-Am7-Dm7-Bbmaj7): different tempo, key, progression, + an arp. */
{
  const DUR = 34, n = SR * DUR, s = new Float32Array(n), beat = 60 / 100; // 0.6s
  const chords = [
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 392.0],  // G
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
  ];
  const roots = [130.81, 98.0, 110.0, 87.31]; // C3 G2 A2 F2
  const BAR = 4;                // beats per chord
  const barSamp = BAR * beat * SR;
  const nBars = Math.ceil(DUR / (BAR * beat));
  for (let b = 0; b < nBars; b++) {
    const ch = chords[b % 4], root = roots[b % 4];
    const start = Math.floor(b * barSamp);
    // warm pad (two slightly detuned voices per note)
    for (const f of ch) for (const det of [0.9985, 1.0015]) {
      const ph = rnd() * Math.PI;
      for (let i = 0; i < barSamp && start + i < n; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.5) * Math.min(1, (BAR * beat - t) / 0.9);
        s[start + i] += Math.sin(2 * Math.PI * f * det * t + ph) * env * 0.05;
      }
    }
    // soft bass, re-plucked each beat
    for (let i = 0; i < barSamp && start + i < n; i++) {
      const t = i / SR;
      s[start + i] += Math.sin(2 * Math.PI * root * t) * Math.exp(-((t % beat)) * 3) * 0.17;
    }
    // gentle plucky arpeggio (8th notes, up an octave) — the modern movement
    for (let e = 0; e < BAR * 2; e++) {
      const note = ch[e % ch.length] * 2;
      const es = start + Math.floor((e * beat) / 2 * SR);
      for (let i = 0; i < SR * 0.3 && es + i < n; i++) {
        const t = i / SR;
        s[es + i] += Math.sin(2 * Math.PI * note * t) * Math.exp(-t * 6) * 0.055;
      }
    }
  }
  // soft kick + light shaker
  for (let bt = 0; bt * beat < DUR; bt++) {
    const k = Math.floor(bt * beat * SR);
    for (let i = 0; i < SR * 0.1 && k + i < n; i++) { const t = i / SR; s[k + i] += Math.sin(2 * Math.PI * (80 * Math.exp(-t * 30) + 40) * t) * Math.exp(-t * 22) * 0.3; }
    const h = Math.floor((bt + 0.5) * beat * SR);
    for (let i = 0; i < SR * 0.03 && h + i < n; i++) s[h + i] += rnd() * Math.exp(-(i / SR) * 260) * 0.05;
  }
  writeWav('echo-music.wav', lowpass(s, 7000));
}
console.log('Done.');
