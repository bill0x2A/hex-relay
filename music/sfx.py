"""HEX RELAY sound effects: short mono 16-bit WAVs at 22050 Hz.

Each effect layers one-shots from `neuron drum` and tools/make_foley.py
(written to samples/gen/hex-relay-sfx/ in the neuron repo) with a few
synthesized tones, then: resample to 22050 Hz (ffmpeg), trim any silence
at the start, fade the end, and normalize the peak (-3 dBFS; graze sits
lower on purpose, since it plays very often).

Called by build.py: sfx.build(out_dir, neuron_dir, neuron_bin, tmp_dir).
"""

import os
import subprocess

import numpy as np

SR = 44100
OUT_SR = 22050
NAMES = ['select', 'start', 'pickup', 'fire', 'warning', 'hit', 'shield', 'death', 'lock', 'win', 'heal', 'graze']
PEAK_DB = {n: -3.0 for n in NAMES}
PEAK_DB['graze'] = -9.0
PEAK_DB['select'] = -4.0

# neuron drum / make_foley sources: name -> command args (run in the neuron root)
SOURCES = {
    'blip': 'drum perc --preset blip pitch=1760 decay=0.035 seed=1',
    'zap_down': 'drum perc --preset zap pitch=1400 sweep=-24 decay=0.18 index=4 seed=2',
    'zap_up': 'drum perc --preset zap pitch=500 sweep=24 decay=0.16 index=3 seed=3',
    'glass': 'drum perc --preset glass pitch=2637 decay=0.25 seed=4',
    'bell': 'drum perc --preset bell pitch=1568 decay=0.45 seed=5',
    'metal': 'drum perc --preset metal pitch=740 decay=0.2 seed=6',
    'kick': 'drum kick --preset punchy pitch=55 decay=0.25 click=0.5 drive=0.4 seed=7',
    'thud': 'drum kick --preset 808 pitch=48 sweep=30 decay=0.3 drive=0.6 seed=8',
    'snare': 'drum snare --preset tight pitch=220 decay=0.12 drive=0.5 seed=9',
    'noise': 'drum noise --preset hiss color=6000 hp=800 length=1.0 seed=10',
    'rim': 'drum rim --preset click pitch=2200 decay=0.012 seed=11',
    'tick': 'drum perc --preset glass pitch=3520 decay=0.03 seed=12',
    'clap': 'drum clap --preset dry tone=1800 seed=13',
    'impact': 'foley impact length=1.0',
    'riser': 'foley riser length=0.6',
    'swell': 'foley swell length=0.5',
}


def _read(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def make_sources(neuron_dir, neuron):
    d = os.path.join('samples', 'gen', 'hex-relay-sfx')
    os.makedirs(os.path.join(neuron_dir, d), exist_ok=True)
    src = {}
    for name, cmd in SOURCES.items():
        out = os.path.join(d, f'{name}.wav')
        if cmd.startswith('foley '):
            kind, *args = cmd.split()[1:]
            argv = ['python3', 'tools/make_foley.py', kind, '-o', out] + args
        else:
            argv = [neuron] + cmd.split() + ['-o', out]
        subprocess.run(argv, cwd=neuron_dir, check=True, capture_output=True)
        x = _read(os.path.join(neuron_dir, out))
        src[name] = x / max(1e-9, np.abs(x).max())
    return src


# ── Synthesis helpers (44.1 kHz) ────────────────────────────────────────

def t_(dur):
    return np.arange(int(dur * SR)) / SR


def osc(freq, dur, wave='square', duty=0.5):
    """freq: Hz, or an array (a glide). Band-limited enough for short blips."""
    n = int(dur * SR)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.interp(np.arange(n), np.linspace(0, n - 1, len(freq)), freq)
    ph = np.cumsum(f) / SR
    frac = ph % 1.0
    if wave == 'square':
        return np.where(frac < duty, 1.0, -1.0)
    if wave == 'saw':
        return 2 * frac - 1
    if wave == 'tri':
        return 4 * np.abs(frac - 0.5) - 1
    return np.sin(2 * np.pi * ph)


def env(n, a=0.002, d=0.1, sustain=0.0, length=None):
    """Attack then exponential decay to `sustain`, over n samples."""
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = sustain + (1 - sustain) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
    return att * dec


def lowpass(x, cutoff):
    """One-pole lowpass (cutoff may be an array)."""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    z = 0.0
    for i in range(len(x)):
        z += a[i] * (x[i] - z)
        y[i] = z
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def crush(x, bits=6, hold=2):
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    return np.repeat(y[::hold], hold)[:len(x)]


def place(dst, src, at=0.0, gain=1.0):
    i = int(at * SR)
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n] * gain
    return dst


def buf(dur):
    return np.zeros(int(dur * SR))


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def blip(m, dur, wave='square', a=0.002, d=0.08, sustain=0.0, duty=0.5, cut=6000):
    x = osc(note(m), dur, wave, duty) * env(int(dur * SR), a, d, sustain)
    return lowpass(x, cut)


# ── The effects ─────────────────────────────────────────────────────────

def fx_select(S):
    x = buf(0.07)
    place(x, S['blip'][:int(0.06 * SR)], 0, 0.8)
    place(x, blip(93, 0.05, duty=0.25, d=0.015, cut=7000), 0, 0.35)    # A6, a short 25% pulse
    return x


def fx_start(S):
    x = buf(0.75)
    place(x, S['kick'], 0, 0.9)
    place(x, S['zap_up'], 0, 0.5)
    # a G sus chord stab, then the fifth an octave up: open, not a fanfare
    for m in (67, 72, 74, 79):
        place(x, blip(m, 0.32, 'saw', d=0.12, sustain=0.1, cut=4500), 0.0, 0.18)
    for m in (79, 86):
        place(x, blip(m, 0.4, 'square', d=0.16, duty=0.3, cut=6000), 0.18, 0.2)
    place(x, S['noise'][:int(0.3 * SR)] * env(int(0.3 * SR), 0.001, 0.06), 0, 0.15)
    return x


def fx_pickup(S):
    x = buf(0.32)
    place(x, blip(88, 0.07, duty=0.25, d=0.05, sustain=0.3), 0, 0.45)      # E6
    place(x, blip(95, 0.22, duty=0.25, d=0.09, sustain=0.0), 0.06, 0.5)    # B6
    place(x, S['glass'], 0.06, 0.35)
    return x


def fx_fire(S):
    dur = 0.38
    x = buf(dur)
    place(x, S['zap_down'], 0, 0.8)
    n = int(dur * SR)
    whoosh = S['noise'][:n] * env(n, 0.01, 0.1)
    whoosh = lowpass(highpass(whoosh, 600), np.geomspace(9000, 1200, n))
    place(x, whoosh, 0, 0.9)
    place(x, osc(np.geomspace(1800, 220, n), dur, 'saw') * env(n, 0.001, 0.07), 0, 0.22)
    return x


def fx_warning(S):
    dur = 0.42
    x = buf(dur)
    # the alarm of the battle danger stem: G and Db, a tritone, twice
    for i, m in enumerate((79, 85, 79, 85)):
        seg = 0.105
        tone = osc(note(m), seg, 'square', 0.5) + 0.5 * osc(note(m) * 1.004, seg, 'square', 0.5)
        tone *= env(len(tone), 0.003, 0.09, sustain=0.55) * (np.arange(len(tone)) < len(tone) - 80)
        place(x, lowpass(tone, 5000), i * seg, 0.3)
    return x


def fx_hit(S):
    dur = 0.34
    x = buf(dur)
    n = int(dur * SR)
    place(x, S['thud'], 0, 0.9)
    place(x, S['snare'], 0, 0.6)
    burst = S['noise'][:n] * env(n, 0.0005, 0.06)
    place(x, crush(np.tanh(3 * burst), 5, 3), 0, 0.6)
    place(x, crush(osc(np.geomspace(320, 80, n), dur, 'square') * env(n, 0.001, 0.08), 4, 4), 0, 0.35)
    return np.tanh(1.6 * x) / np.tanh(1.6)


def fx_shield(S):
    dur = 0.45
    x = buf(dur)
    place(x, S['metal'], 0, 0.6)
    place(x, S['bell'], 0, 0.45)
    place(x, S['glass'], 0.01, 0.3)
    n = int(dur * SR)
    shimmer = (osc(note(83), dur, 'tri') + osc(note(90) * 1.003, dur, 'tri')) * env(n, 0.004, 0.14)
    place(x, shimmer, 0, 0.12)
    return x


def fx_death(S):
    dur = 0.85
    x = buf(dur)
    n = int(dur * SR)
    fall = np.geomspace(880, 45, n)
    tone = osc(fall, dur, 'square', 0.4) * 0.6 + osc(fall * 1.5, dur, 'saw') * 0.3
    tone *= env(n, 0.002, 0.35)
    place(x, crush(lowpass(tone, np.geomspace(6000, 400, n)), 6, 2), 0, 0.55)
    place(x, S['impact'], 0, 0.8)
    place(x, S['noise'][:n] * env(n, 0.001, 0.12), 0, 0.2)
    return np.tanh(1.3 * x) / np.tanh(1.3)


def fx_lock(S):
    dur = 0.3
    x = buf(dur)
    place(x, S['clap'][:int(0.08 * SR)], 0, 0.35)
    place(x, S['rim'], 0, 0.6)
    place(x, S['kick'][:int(0.1 * SR)], 0, 0.4)
    for at in (0.02, 0.13):
        place(x, blip(81, 0.08, duty=0.5, d=0.05, sustain=0.6, cut=4000), at, 0.3)   # A5, two beeps
    return x


def fx_win(S):
    dur = 1.15
    x = buf(dur)
    # G - C - D - G, then a held D over G: rises and stays open (sus), not a cadence
    seq = [(0.0, 67), (0.1, 72), (0.2, 74), (0.3, 79)]
    for at, m in seq:
        place(x, blip(m, 0.16, duty=0.3, d=0.07, sustain=0.25, cut=6000), at, 0.32)
    for m, g in ((79, 0.22), (86, 0.24), (74, 0.14)):
        place(x, blip(m, 0.75, 'square', a=0.005, d=0.35, sustain=0.05, duty=0.35, cut=5000), 0.42, g)
    place(x, S['bell'], 0.42, 0.3)
    place(x, S['kick'][:int(0.2 * SR)], 0.42, 0.45)
    return x


def fx_heal(S):
    dur = 0.55
    x = buf(dur)
    for i, m in enumerate((76, 80, 83, 88, 92)):   # E major, rising: E5 G#5 B5 E6 G#6
        place(x, blip(m, 0.22, 'tri', a=0.004, d=0.09), i * 0.045, 0.3)
    place(x, S['glass'], 0.18, 0.25)
    place(x, S['swell'][-int(0.2 * SR):] if len(S['swell']) > int(0.2 * SR) else S['swell'], 0.0, 0.15)
    return x


def fx_graze(S):
    x = buf(0.045)
    place(x, S['tick'][:int(0.04 * SR)], 0, 0.7)
    place(x, blip(100, 0.03, 'sine', a=0.0005, d=0.008), 0, 0.3)   # E7, a soft sine glint
    return lowpass(x, 7000)


# ── Finish ──────────────────────────────────────────────────────────────

def finish(x, peak_db, path, tmp):
    import wave
    raw = os.path.join(tmp, os.path.basename(path) + '.f32')
    x.astype('<f4').tofile(raw)
    out = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw,
                          '-af', 'aresample=resampler=soxr:precision=28' if _has_soxr() else 'aresample',
                          '-ar', str(OUT_SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    y = np.frombuffer(out, dtype='<f4').astype(np.float64)
    # trim silence at the start: first sample above -50 dBFS of the peak
    thr = np.abs(y).max() * 10 ** (-50 / 20)
    y = y[int(np.argmax(np.abs(y) > thr)):]
    # fade the last 8 ms, then trim trailing near-silence
    f = min(len(y), int(0.008 * OUT_SR))
    y[-f:] *= np.linspace(1, 0, f)
    tail_thr = np.abs(y).max() * 10 ** (-60 / 20)
    last = len(y) - int(np.argmax(np.abs(y[::-1]) > tail_thr))
    y = y[:max(last, 1)]
    y *= 10 ** (peak_db / 20) / np.abs(y).max()
    pcm = np.clip(np.round(y * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(OUT_SR)
        w.writeframes(pcm.tobytes())
    return {'ms': round(1000 * len(y) / OUT_SR), 'bytes': os.path.getsize(path),
            'peak_db': round(20 * np.log10(np.abs(pcm).max() / 32768), 2),
            'rms_db': round(20 * np.log10(np.sqrt(np.mean((pcm / 32768.0) ** 2))), 2),
            'first_sample_abs': int(abs(int(pcm[0])))}


_SOXR = None


def _has_soxr():
    global _SOXR
    if _SOXR is None:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.01',
                            '-af', 'aresample=resampler=soxr', '-ar', '22050', '-f', 'null', '-'], capture_output=True)
        _SOXR = r.returncode == 0
    return _SOXR


def build(out_dir, neuron_dir, neuron, tmp):
    S = make_sources(neuron_dir, neuron)
    report = {}
    for name in NAMES:
        x = globals()[f'fx_{name}'](S)
        report[name] = finish(x, PEAK_DB[name], os.path.join(out_dir, f'{name}.wav'), tmp)
        assert report[name]['bytes'] < 60 * 1024, f'{name}.wav is over 60 KB'
    return report
