#!/usr/bin/env python3
"""Build the HEX RELAY soundtrack and sound effects into public/audio/.

Runs from anywhere. Needs the Neuron repo (env NEURON_DIR, default
/home/bill/code/neuron) with target/release/neuron built, plus python3 with
numpy, ffmpeg, and lame on PATH.

    python3 music/build.py            # everything
    python3 music/build.py menu sfx   # only some targets (track ids, or sfx)
    python3 music/build.py --no-gen   # reuse the neuron projects, render only

For each track: the generator in music/ (cwd = neuron root) writes
projects/hex-relay-<id>.json, neuron renders the arrangement (plus a 2 s
tail), the render is cut to exactly bars * 4 * 60 / bpm seconds and the tail
is added onto the start (so reverb and delay ring across the loop seam),
then lame encodes it. battle-danger is the solo render of the danger tracks
of the battle project, so it lines up with battle-base sample for sample.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'public', 'audio')
NEURON_DIR = os.environ.get('NEURON_DIR', '/home/bill/code/neuron')
NEURON = os.path.join(NEURON_DIR, 'target', 'release', 'neuron')
SR = 44100

# id: (file, bpm, bars, project, generator, solo tracks or None)
BATTLE_DANGER = ['DArp', 'DHat', 'DSub', 'DAlarm', 'DuckKey']
TRACKS = {
    'menu': ('menu.mp3', 120, 16, 'hex-relay-menu', 'hex-relay-menu.gen.py', None),
    'solo-normal': ('solo-normal.mp3', 140, 32, 'hex-relay-normal', 'hex-relay-normal.gen.py', None),
    'solo-hard': ('solo-hard.mp3', 160, 32, 'hex-relay-hard', 'hex-relay-hard.gen.py', None),
    'battle-base': ('battle-base.mp3', 150, 32, 'hex-relay-battle', 'hex-relay-battle.gen.py', 'base'),
    'battle-danger': ('battle-danger.mp3', 150, 32, 'hex-relay-battle', None, 'danger'),
}
LAME = ['lame', '--silent', '-q', '0', '--noreplaygain']
# VBR quality per track (about 140-160 kbps); the danger stem is mostly hats and
# high arp, which VBR spends more bits on, so it gets a lower setting
LAME_V = {'battle-danger': '6'}
SUM_CEILING_DB = -1.0    # base + danger together, PCM (decoded stays below 0 dBFS)
PEAK_CEILING_DB = -2.2   # PCM ceiling; MP3 decoding overshoots by up to ~1 dB


def run(cmd, cwd=None, **kw):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit(f'failed: {cmd if isinstance(cmd, str) else " ".join(cmd)}')
    return r.stdout + r.stderr


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


# ── Audio I/O ──────────────────────────────────────────────────────────

def read_audio(path, channels=2, rate=SR):
    """Any audio file -> float32 array (frames, channels), via ffmpeg."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(channels), '-ar', str(rate), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, channels).copy()


def write_wav16(path, x, rate=SR, seed=0):
    """float (frames, ch) -> 16-bit PCM WAV with TPDF dither."""
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    rng = np.random.default_rng(seed)
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    pcm = np.clip(np.round((x + d) * 32767.0), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


# ── Music ──────────────────────────────────────────────────────────────

def project_tracks(project):
    with open(os.path.join(NEURON_DIR, 'projects', f'{project}.json')) as f:
        return [t['name'] for t in json.load(f)['tracks']]


def generate(gen):
    """Run a generator from music/ with cwd = the neuron root."""
    env = dict(os.environ, NEURON_BIN=NEURON)
    print(run([sys.executable, os.path.join(HERE, gen)], cwd=NEURON_DIR, env=env).strip())


def render(project, solo, out):
    cmd = [NEURON, '-p', f'projects/{project}.json', 'render', '-o', out]
    if solo:
        cmd += ['--solo', ','.join(solo)]
    log = run(cmd, cwd=NEURON_DIR)
    for line in log.splitlines():
        if 'WARNING' in line:
            print('   ', line)
    return log


def loop_wrap(x, length):
    """Cut to `length` frames and add what rings past the cut onto the start."""
    if len(x) < length:
        x = np.concatenate([x, np.zeros((length - len(x), x.shape[1]), x.dtype)])
    body = x[:length].copy()
    tail = x[length:]
    n = min(len(tail), length)
    body[:n] += tail[:n]
    return body


def rms_db(a):
    return db(np.sqrt(np.mean(a.astype(np.float64) ** 2)))


def smooth_gain(g, look_ms=2.0, release_ms=60.0):
    """Gain curve -> limiter gain: a lookahead window (instant attack),
    smooth release, and a short average so it never clicks."""
    w = max(1, int(look_ms * SR / 1000))
    win = np.lib.stride_tricks.sliding_window_view(np.pad(g, (w, w), constant_values=1.0), 2 * w + 1)
    gm = win.min(axis=1)
    rel = 1 - np.exp(-1.0 / (release_ms * SR / 1000))
    out = np.empty_like(gm)
    prev = 1.0
    for i in range(len(gm)):
        prev = gm[i] if gm[i] < prev else prev + (gm[i] - prev) * rel
        out[i] = prev
    return np.convolve(np.pad(out, (w, w), mode='edge'), np.ones(w) / w, mode='same')[w:-w]


def limit_head(y, n, ceiling):
    """A lookahead peak limiter over the first n frames (where the tail was
    added), returning to unity gain by frame n."""
    n = min(n, len(y))
    g = np.minimum(1.0, ceiling / np.maximum(np.abs(y[:n]).max(axis=1), 1e-9))
    if g.min() >= 1.0:
        return y
    out = smooth_gain(g)
    k = min(n, int(0.05 * SR))   # return to unity gain over the last 50 ms
    out[-k:] += np.linspace(0, 1, k) * (1 - out[-k:])
    y = y.copy()
    y[:n] *= out[:, None]
    return y


def duck_against(stem, base, ceiling):
    """Turn the stem down only where base + stem would pass the ceiling, so
    the two played together at full gain stay below it."""
    room = np.maximum(ceiling - np.abs(base), 0.0)
    need = np.abs(stem)
    g = np.where(np.abs(base) + need > ceiling, room / np.maximum(need, 1e-9), 1.0).min(axis=1)
    g = np.clip(g, 0.0, 1.0)
    return stem * smooth_gain(g)[:, None], float(g.min())


def seam_check(x, bar):
    """Play the loop twice and look at the joint. Returns a dict of numbers.

    The 50 ms after the joint holds the downbeat of bar 1, so it is louder
    than the 50 ms before it, as at every bar line. For reference the check
    also gives the same before/after difference at each bar line inside the
    file (median and max)."""
    n = int(0.05 * SR)
    pre, post = x[-n:], x[:n]
    rms = rms_db
    inner = [rms(x[b:b + n]) - rms(x[b - n:b]) for b in range(bar, len(x) - n, bar)]
    two = np.concatenate([x[-SR:], x[:SR]])
    d = np.abs(np.diff(two, axis=0)).max(axis=1)
    jump = float(d[SR - 1])                      # the step from the last sample to the first
    local = float(np.percentile(d[SR - n:SR + n], 99.5))
    return {
        'rms_before_db': round(rms(pre), 2), 'rms_after_db': round(rms(post), 2),
        'rms_diff_db': round(rms(post) - rms(pre), 2),
        'joint_step': round(jump, 4), 'local_p99_5_step': round(local, 4),
        'max_step_file': round(float(np.abs(np.diff(x, axis=0)).max()), 4),
        'bar_lines_rms_diff_median_db': round(float(np.median(inner)), 2),
        'bar_lines_rms_diff_max_db': round(float(np.max(inner)), 2),
    }


def stats(x):
    return {'peak_db': round(db(np.abs(x).max()), 2), 'rms_db': round(db(np.sqrt(np.mean(x.astype(np.float64) ** 2))), 2)}


PCM = {}


def make_pcm(tid, gen_done, tmp):
    """Render, wrap, and limit one track -> float frames (cached)."""
    if tid in PCM:
        return PCM[tid]
    file, bpm, bars, project, gen, solo = TRACKS[tid]
    if gen and project not in gen_done:
        generate(gen)
        gen_done.add(project)
    if solo == 'danger':
        solo_list = BATTLE_DANGER
    elif solo == 'base':
        solo_list = [t for t in project_tracks(project) if t not in BATTLE_DANGER or t == 'DuckKey']
    else:
        solo_list = None
    wav = os.path.join(tmp, f'{tid}-render.wav')
    render(project, solo_list, wav)
    x = read_audio(wav)
    assert bars * 4 * 60 * SR % bpm == 0, 'loop length is not a whole number of samples'
    length = bars * 4 * 60 * SR // bpm
    y = loop_wrap(x, length)
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    # the tail lands on the downbeat of bar 1 and can push it over the ceiling:
    # limit the wrapped head only, so the rest of the mix keeps its level
    y = limit_head(y, len(x) - length + int(0.2 * SR), ceiling)
    peak = np.abs(y).max()
    if peak > ceiling:
        y *= ceiling / peak
    if solo == 'danger':
        base = make_pcm('battle-base', gen_done, tmp)
        y, gmin = duck_against(y, base, 10 ** (SUM_CEILING_DB / 20))
        print(f'    danger stem ducked against the base where the sum passes {SUM_CEILING_DB} dBFS '
              f'(deepest {db(gmin):.1f} dB)')
    PCM[tid] = y
    return y


def build_track(tid, gen_done, tmp):
    file, bpm, bars, project, gen, solo = TRACKS[tid]
    y = make_pcm(tid, gen_done, tmp)
    length = len(y)
    pcm = os.path.join(tmp, f'{tid}.wav')
    write_wav16(pcm, y, seed=len(tid))
    mp3 = os.path.join(OUT, file)
    run(LAME + ['-V', LAME_V.get(tid, '4'), pcm, mp3])
    dec = read_audio(mp3)
    info = {'file': file, 'bpm': bpm, 'bars': bars, 'frames': len(dec), 'expected_frames': length,
            'seconds': round(len(dec) / SR, 4), 'bytes': os.path.getsize(mp3), **stats(dec),
            'seam': seam_check(dec, length // bars)}
    DECODED[tid] = dec
    if tid == 'battle-danger' and 'battle-base' in DECODED:
        both = DECODED['battle-base'] + dec
        info['sum_with_base'] = {**stats(both), 'seam': seam_check(both, length // bars)}
    return info


DECODED = {}


# ── Manifest ───────────────────────────────────────────────────────────

def manifest(sfx_names):
    m = {'music': {tid: {'file': f, 'bpm': bpm, 'bars': bars} for tid, (f, bpm, bars, *_rest) in TRACKS.items()},
         'sfx': {n: f'{n}.wav' for n in sfx_names}}
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(m, f, indent=2)
        f.write('\n')


def main(argv):
    gen = '--no-gen' not in argv
    targets = [a for a in argv if not a.startswith('--')] or list(TRACKS) + ['sfx']
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(NEURON):
        raise SystemExit(f'neuron binary not found at {NEURON}: run `cargo build --release` in {NEURON_DIR}')
    for tool in ('ffmpeg', 'lame'):
        if not shutil.which(tool):
            raise SystemExit(f'{tool} not found on PATH')
    report = {}
    gen_done = set() if gen else {v[3] for v in TRACKS.values()}
    sys.path.insert(0, HERE)
    with tempfile.TemporaryDirectory() as tmp:
        for tid in TRACKS:
            if tid in targets:
                print(f'== {tid}')
                report[tid] = build_track(tid, gen_done, tmp)
                print('  ', json.dumps(report[tid]))
        if 'sfx' in targets:
            import sfx
            print('== sfx')
            report['sfx'] = sfx.build(OUT, NEURON_DIR, NEURON, tmp)
            for k, v in report['sfx'].items():
                print(f'   {k:8} {json.dumps(v)}')
    from sfx import NAMES
    manifest(NAMES)
    path = os.path.join(HERE, 'build-report.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(report)
    with open(path, 'w') as f:
        json.dump(old, f, indent=2)
        f.write('\n')
    print('wrote', os.path.join(OUT, 'manifest.json'))


if __name__ == '__main__':
    main(sys.argv[1:])
