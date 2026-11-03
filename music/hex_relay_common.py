"""Shared parts of the HEX RELAY soundtrack (artist: Saccade).

Each projects/hex-relay-<track>.gen.py imports this. It holds the sound
palette (drum kits made with `neuron drum` and tools/make_foley.py, synth
patches), the arp and fill helpers, and `finish()`, which writes the .nrn
script and the drum script, runs both, and leaves projects/hex-relay-<track>.json.

Run the generators from the neuron repository root.
"""

import os
import subprocess
import sys

sys.path.insert(0, 'tools')
from neuron_compose import Script, from_str, notes_str, pat_str, q  # noqa: E402,F401

NEURON = os.environ.get('NEURON_BIN', 'target/release/neuron')


def sh(cmd):
    env = dict(os.environ)
    env['PATH'] = os.path.abspath(os.path.dirname(NEURON)) + os.pathsep + env.get('PATH', '')
    r = subprocess.run(cmd, shell=True, env=env, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit(f'failed: {cmd}')
    return r.stdout


# ── Kit ─────────────────────────────────────────────────────────────────

def kit(s, d, kick=None, clap=None, snare=None, hat=None, ohat=None, perc=None, crash_len=1.6, seed=0):
    """Synthesize a drum kit for one song into samples/gen/<song>/.
    Each argument is a dict of drum params that makes this song's kit its own."""
    k = {}
    k['kick'] = s.drum('kick', f'{d}/kick.wav', preset='punchy', variants=3, seed=seed + 1, **(kick or {}))
    k['clap'] = s.drum('clap', f'{d}/clap.wav', preset='dry', variants=3, seed=seed + 2, **(clap or {}))
    k['snare'] = s.drum('snare', f'{d}/snare.wav', preset='tight', variants=4, seed=seed + 3, **(snare or {}))
    k['hat'] = s.drum('hat', f'{d}/hat.wav', preset='tight', variants=4, seed=seed + 4, **(hat or {}))
    k['ohat'] = s.drum('hat', f'{d}/ohat.wav', preset='open', variants=3, seed=seed + 5, **(ohat or {}))
    k['perc'] = s.drum('perc', f'{d}/blip.wav', preset='blip', variants=3, seed=seed + 6, **(perc or {}))
    k['crash'] = s.drum('hat', f'{d}/crash.wav', preset='metal', decay=crash_len, tone=6500, metal=0.8,
                        length=crash_len + 0.4, seed=seed + 7)
    return k


def foley(s, d, kind, name, **params):
    """A make_foley.py sound, run with the drum script."""
    out = f'{d}/{name}.wav'
    args = ' '.join(q(f'{k}={v}') for k, v in params.items())
    s.drums.append(f'python3 tools/make_foley.py {kind} -o {q(out)} {args}')
    return out


def drum_track(s, name, files, vol, pan=0.0, time=4, vel=0.12, pitch=15, decay=None):
    s.sampler_track(name, files[0])
    if len(files) > 1:
        s.sampler(name, pool=files[1:], mode='random')
    if decay:
        s.sampler(name, decay=decay)
    if time:
        s.groove(name, time=time, vel=vel, pitch=pitch)
    s.mix(name, vol=vol, pan=pan)


# ── Notes ───────────────────────────────────────────────────────────────

def arp(chords, order, bars, rate=1, dur=1, vel=(0.85, 0.6), accent=4, start=0):
    """An arp over a chord timeline.

    chords: [(start_bar, bars, [midi...])]; order: indices into each chord
    (sorted low to high; an index past the end goes an octave up).
    rate: steps between notes (1 = 16ths, 2 = 8ths). Notes on every
    `accent` steps get the first velocity, the rest the second."""
    out = []
    i = 0
    for st in range(start, bars * 16, rate):
        bar = st // 16
        ch = next((c for b, n, c in chords if b <= bar < b + n), None)
        if ch is None:
            continue
        ch = sorted(ch)
        idx = order[i % len(order)]
        i += 1
        if idx is None:
            continue
        o, j = divmod(idx, len(ch))
        out.append((st, ch[j] + 12 * o, dur, vel[0] if st % accent == 0 else vel[1]))
    return out


def shift(events, steps):
    return [(s + steps, n, d, v) for s, n, d, v in events]


def tile(events, cycle, times):
    return [(s + k * cycle, n, d, v) for k in range(times) for s, n, d, v in events]


def window(events, a, b):
    """Events with onsets in [a, b), re-based to a."""
    return [(s - a, n, min(d, b - s), v) for s, n, d, v in events if a <= s < b]


def quarters(bars, vel=1.0, last=None):
    """Four on the floor; `last` replaces the final bar (a fill)."""
    p = [vel if i % 4 == 0 else 0.0 for i in range(16 * bars)]
    if last:
        p[-16:] = from_str(last)
    return p


def every(n, vel, bars, phase=0):
    return [vel if (i - phase) % n == 0 else 0.0 for i in range(16 * bars)]


def at(bars, steps, vel=1.0):
    p = [0.0] * (16 * bars)
    for st in steps:
        p[st] = vel
    return p


# ── Build ───────────────────────────────────────────────────────────────

def finish(s, name, bpm):
    """Write and run the drum script and the .nrn, creating projects/<name>.json."""
    nrn = s.write(f'projects/{name}.nrn')
    drums = s.write_drums(f'projects/{name}-drums.sh')
    sh(f'sh {drums}')
    sh(f'{NEURON} new projects/{name}.json --bpm {bpm} --force')
    sh(f'{NEURON} -p projects/{name}.json run {nrn}')
    print(f'built projects/{name}.json')
