# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "librosa"]
# ///
"""Turn full songs (for example from Suno) into the game's seamless loops.

Usage:
  uv run music/import-suno.py menu=~/Downloads/a.mp3 solo-normal=~/Downloads/b.mp3 \\
      solo-hard=~/Downloads/c.mp3 solo-hyper=~/Downloads/e.mp3 battle=~/Downloads/d.mp3 [--dry-run]

For each song it measures the tempo and beat grid, picks the strongest section of exactly
BARS bars that starts on an energy jump, crossfades the seam with the music that follows the
section, matches loudness to the other tracks, encodes a gapless MP3 with lame, and updates
public/audio/manifest.json. `battle` writes battle-base.mp3 and battle-danger.mp3; without
stems, the danger layer is the upper band of the same section, so both stay sample-aligned.
The previous files stay in git: `git checkout public/audio` restores them.
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'public' / 'audio'
SR = 44100
BARS = {'menu': 16, 'solo-normal': 32, 'solo-hard': 32, 'solo-hyper': 32, 'battle': 32}
TARGET_RMS_DB = -12.3     # the level of the Neuron tracks
CEILING = 10 ** (-2.2 / 20)  # MP3 decoding overshoots by about 1 dB


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def onset_env(audio, hop=128):
    """Kick onsets plus full-band onsets: a soft kick alone can mislead the search."""
    mono = audio.mean(axis=1)
    kick = band(mono[:, None], high=180)[:, 0].astype(np.float32)
    env = None
    for signal in (kick, mono.astype(np.float32)):
        e = librosa.onset.onset_strength(y=signal, sr=SR, hop_length=hop)
        e = e / (np.percentile(e, 99) + 1e-9)
        env = e if env is None else env[:len(e)] + e[:len(env)]
    return env, SR / hop


def fourier_tempo(env, fps, lo, hi, step=0.01):
    """The tempo whose beat, eighth, and sixteenth frequencies carry the most onset energy."""
    seg = env - env.mean()
    t = np.arange(len(seg)) / fps
    bpms = np.arange(lo, hi, step)
    mag = sum(np.abs(np.exp(-2j * np.pi * np.outer(bpms * h / 60, t[::2])) @ seg[::2]) / h for h in (1, 2, 4))
    return float(bpms[int(np.argmax(mag))])


def tempo_curve(audio, bpm, window=16.0):
    """Tempo in overlapping windows, to find where a song holds a steady tempo."""
    env, fps = onset_env(audio)
    w = int(window * fps)
    return [(i / fps, fourier_tempo(env[i:i + w], fps, bpm - 6, bpm + 6, 0.05)) for i in range(0, len(env) - w, w // 4)]


def beat_grid(audio, guess=None, span=6.0):
    """Tempo (Fourier) and phase (on-beat minus off-beat onsets) of a steady stretch of music."""
    env, fps = onset_env(audio)
    if guess is None: guess = fourier_tempo(env, fps, 100, 180, 0.05)
    bpm = fourier_tempo(env, fps, guess - span, guess + span, 0.05)
    bpm = fourier_tempo(env, fps, bpm - 0.1, bpm + 0.1, 0.002)
    period = fps * 60 / bpm
    frames = np.arange(len(env))
    k = np.arange(int((len(env) - period) / period))
    phases = np.arange(0, period, 0.25)
    pos = phases[:, None] + k[None, :] * period
    # Busy arpeggios fill every grid; only the right phase keeps kicks on the beat, not between.
    contrast = np.interp(pos, frames, env).mean(axis=1) - np.interp(pos + period / 2, frames, env).mean(axis=1)
    offset = phases[int(np.argmax(contrast))] / fps
    period = 60 / bpm
    # Jitter: how far each grid beat is from the nearest detected onset.
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=int(SR / fps), units='time')
    grid = offset + period * np.arange(int((len(env) / fps - offset) / period))
    idx = np.clip(np.searchsorted(onsets, grid), 1, len(onsets) - 1)
    residual = np.minimum(np.abs(onsets[idx] - grid), np.abs(onsets[idx - 1] - grid))
    return onsets, period, offset, float(np.median(residual))


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def choose_section(audio, period, offset, bars, curve=()):
    beats_total = int((len(audio) / SR - offset) / period)
    beat_len = bars * 4
    hop = int(period * SR)
    energy = np.array([rms_db(audio[int((offset + i * period) * SR):int((offset + i * period) * SR) + hop])
                       for i in range(beats_total)])
    best, best_score = None, -1e9
    margin = 8  # beats of music must follow the section, for the crossfade
    for start in range(8, beats_total - beat_len - margin):
        window = energy[start:start + beat_len]
        jump = energy[start:start + 4].mean() - energy[start - 8:start].mean()
        # Loud, even sections that start on a jump; a seam whose two sides match.
        seam = abs(energy[start:start + 2].mean() - energy[start + beat_len - 2:start + beat_len].mean())
        t0, t1 = offset + start * period, offset + (start + beat_len) * period
        tempos = [bpm for t, bpm in curve if t0 - 4 <= t <= t1 - 12]
        # A drifting tempo makes a flam at the seam: stay where the song holds steady.
        drift = (max(tempos) - min(tempos)) if tempos else 0
        score = window.mean() - 0.5 * window.std() + 0.6 * max(0, jump) - 0.4 * seam - 8 * max(0, drift - 0.3)
        if score > best_score:
            best, best_score = start, score
    return best


def make_loop(audio, start_s, length, fade):
    a = audio[start_s:start_s + length].copy()
    tail = audio[start_s + length:start_s + length + fade]
    t = np.linspace(0, np.pi / 2, fade)[:, None]
    # Equal-power crossfade: the loop starts as the continuation of its own end.
    a[:fade] = a[:fade] * np.sin(t) + tail * np.cos(t)
    return a


def master(x, rms_target_db=TARGET_RMS_DB):
    x = x * 10 ** ((rms_target_db - rms_db(x)) / 20)
    # Soft knee above 80% of the ceiling; below it the signal is untouched.
    knee = CEILING * 0.8
    over = np.abs(x) > knee
    x[over] = np.sign(x[over]) * (knee + (CEILING - knee) * np.tanh((np.abs(x[over]) - knee) / (CEILING - knee)))
    return x


def band(x, low=None, high=None):
    # Circular FFT filter: the loop wraps, so the filter wraps with it and adds no seam.
    spec = np.fft.rfft(x, axis=0)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.ones_like(freqs)
    if low: gain *= 1 / (1 + (low / np.maximum(freqs, 1)) ** 4)
    if high: gain *= 1 / (1 + (np.maximum(freqs, 1) / high) ** 4)
    return np.fft.irfft(spec * gain[:, None], n=len(x), axis=0)


def encode(x, out, quality):
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / 'loop.wav'
        with wave.open(str(wav_path), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['lame', '--quiet', f'-V{quality}', '-q', '2', str(wav_path), str(out)], check=True)
    decoded = decode(out)
    peak = 20 * np.log10(np.abs(decoded).max())
    return len(decoded), peak


def main():
    jobs = dict(arg.split('=', 1) for arg in sys.argv[1:] if '=' in arg)
    dry = '--dry-run' in sys.argv
    manifest = json.loads((AUDIO / 'manifest.json').read_text())
    for name, src in jobs.items():
        if name not in BARS: sys.exit(f'Unknown track {name}; use {", ".join(BARS)}.')
        audio = decode(Path(src).expanduser())
        beats, period, offset, jitter = beat_grid(audio)
        bpm = 60 / period
        bars = BARS[name]
        curve = tempo_curve(audio, bpm)
        start = choose_section(audio, period, offset, bars, curve)
        # Suno tempo can drift a little over a song: fit the grid again inside the section.
        lo = max(0, round((offset + (start - 4) * period) * SR))
        hi = min(len(audio), round((offset + (start + bars * 4 + 4) * period) * SR))
        _, period, local, jitter = beat_grid(audio[lo:hi], guess=60 / period, span=6)
        first = lo / SR + local
        start_t = first + round((offset + start * period - first) / period) * period
        length = round(bars * 4 * period * SR)
        exact_bpm = bars * 4 * 60 * SR / length
        start_s = round(start_t * SR)
        bpm = 60 / period
        loop = make_loop(audio, start_s, length, fade=round(period * SR / 2))
        info = f'{name}: {bpm:.2f} BPM (grid jitter {jitter * 1000:.1f} ms), section at {start_s / SR:.2f} s, {length / SR:.3f} s'
        if dry: print(info); continue
        files = {name: loop} if name != 'battle' else {}
        if name == 'battle':
            base = master(loop)
            # The danger layer: the leads, hats, and bright synths of the same section, louder.
            danger = band(loop, low=1800)
            danger *= 10 ** ((-21 - rms_db(danger)) / 20)
            # Turn the layer down only where base plus danger would pass the ceiling,
            # in 256-sample blocks with a smooth gain between them.
            room = np.clip((CEILING * 0.97 - np.abs(base)) / (np.abs(danger) + 1e-9), 0, 1).min(axis=1)
            blocks = room[:len(room) // 256 * 256].reshape(-1, 256).min(axis=1)
            blocks = np.minimum(blocks, np.roll(blocks, 1)); blocks = np.minimum(blocks, np.roll(blocks, -1))
            gain = np.interp(np.arange(len(danger)), np.arange(len(blocks)) * 256 + 128, blocks)
            danger *= gain[:, None]
            files = {'battle-base': base, 'battle-danger': danger}
        else:
            files = {name: master(loop)}
        for key, data in files.items():
            n, peak = encode(data, AUDIO / f'{key}.mp3', 6 if key == 'battle-danger' else 4)
            manifest['music'][key] = {'file': f'{key}.mp3', 'bpm': round(exact_bpm, 6), 'bars': bars}
            print(f'{info} -> {key}.mp3 decoded {n / SR:.3f} s ({"exact" if n == length else f"{n - length:+d} samples"}), '
                  f'peak {peak:.2f} dBFS, RMS {rms_db(decode(AUDIO / f"{key}.mp3")):.2f} dBFS')
    if not dry:
        (AUDIO / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
