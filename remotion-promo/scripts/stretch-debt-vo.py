#!/usr/bin/env python3
"""Time-stretch DebtPromo VO clips ×1.10 (pitch-preserving, librosa WSOLA).
Reads public/dvo-XX.mp3 → writes public/dvo-XX.wav (originals kept).
Then re-measures speech bounds of the stretched files."""
import subprocess
import sys

import librosa
import numpy as np
import soundfile as sf

IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']
RATE = 1.10  # 10% faster

for cid in IDS:
    src = f'public/dvo-{cid}.mp3'
    tmp = f'/tmp/dvo_{cid}_in.wav'
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', src, tmp],
                   check=True, capture_output=True)
    y, sr = librosa.load(tmp, sr=44100, mono=True)
    out = librosa.effects.time_stretch(y, rate=RATE)
    sf.write(f'public/dvo-{cid}.wav', out, sr)

    win = int(sr * 0.02)
    rms = np.array([np.sqrt(np.mean(out[i:i + win] ** 2)) for i in range(0, len(out) - win, win)])
    thr = rms.max() * 0.12
    idx = np.where(rms > thr)[0]
    first, last = idx[0], idx[-1]
    print(f'dvo-{cid}.wav: file {len(out) / sr:.2f}s | speech {first * 0.02:.2f}s → {last * 0.02:.2f}s '
          f'(talk {(last - first) * 0.02:.2f}s)')
print('done')
