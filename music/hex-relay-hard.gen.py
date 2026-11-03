#!/usr/bin/env python3
"""HEX RELAY: Solo Hard — Saccade. 160 BPM, F# minor (aeolian, with a phrygian bII), 32 bars, loops forever.

The hard mode. Every beat has a kick, every backbeat a snare and a clap,
every 16th a hat. The bass gallops on the three 16ths between kicks. The
borrowed G major chord (the phrygian bII) gives the track its edge; it
comes in the Rush as a lean and in the Grind as the floor. A driven saw
lead speaks in the Strike and comes back an octave up in Max.

    Rush 8    full drums, galloping bass, 16th arp (F#m - G - F#m)
    Strike 8  + lead, alarm stabs answer it (F#m - E - D - C#sus4)
    Grind 4   bass half-time, toms, stabs on the offbeat (Bm7 - Gmaj7#11)
    Surge 4   sub and bass out, highpass, snare roll, riser (D - E)
    Max 8     impact, the lead an octave up over F#m - D - G - E;
              the last bar fills back into Rush

Run from the neuron root: python3 projects/hex-relay-hard.gen.py
"""

import sys

sys.path.insert(0, 'tools')
sys.path.insert(0, 'projects')
from hex_relay_common import Script, arp, at, drum_track, finish, foley, from_str, kit, quarters  # noqa: E402
from neuron_compose import Key, fill, motif, octave, roll_build, roll32_offsets, step_extras, transpose  # noqa: E402

NAME = 'hex-relay-hard'
BPM = 160
KIT = f'samples/gen/{NAME}'
key = Key('F#', 'aeolian')
s = Script('HEX RELAY: Solo Hard — Saccade (arcade electronica, F# minor)', bpm=BPM)

k = kit(s, KIT, kick=dict(pitch=58, sweep=30, pitch_decay=0.03, decay=0.18, click=0.6, tone=6000, drive=0.45),
        clap=dict(tone=2100, decay=0.12, bursts=3), snare=dict(pitch=230, decay=0.09, snap=0.7, drive=0.3),
        hat=dict(tone=11000, decay=0.022, metal=0.7, drive=0.2), ohat=dict(decay=0.16, tone=10000, metal=0.7),
        perc=dict(pitch=900, decay=0.06), crash_len=1.6, seed=300)
zap = s.drum('perc', f'{KIT}/zap.wav', preset='zap', variants=3, seed=310)
tom = s.drum('tom', f'{KIT}/tom.wav', preset='high', variants=3, seed=311, decay=0.22)
impact = foley(s, KIT, 'impact', 'impact', length=2.2)
riser = foley(s, KIT, 'riser', 'riser', length=round(4 * 4 * 60 / BPM, 3))

# ── Drums ───────────────────────────────────────────────────────────────
drum_track(s, 'Kick', k['kick'], 0.55, time=1, vel=0.04, pitch=0)
drum_track(s, 'Snare', k['snare'], 0.5, pan=0.03, time=2)
drum_track(s, 'Clap', k['clap'], 0.42, pan=-0.03, time=3)
drum_track(s, 'Hat', k['hat'], 0.42, pan=0.24, time=4, vel=0.22, pitch=35, decay=0.035)
drum_track(s, 'OHat', k['ohat'], 0.3, pan=-0.25, time=3, decay=0.16)
drum_track(s, 'Zap', zap, 0.28, pan=0.4, time=4)
drum_track(s, 'Tom', tom, 0.45, pan=-0.3, time=3)
drum_track(s, 'Roll', k['snare'], 0.4, time=0)
drum_track(s, 'Roll32', k['snare'], 0.3, time=0)
drum_track(s, 'Crash', [k['crash']], 0.42, pan=0.15, time=0)
drum_track(s, 'Impact', [impact], 0.7, time=0)
drum_track(s, 'Riser', [riser], 0.42, time=0)
s.mix('Snare', send_a=0.12)
s.mix('Clap', send_a=0.2)
s.mix('Zap', send_b=0.35)
s.mix('Tom', send_a=0.2)
s.mix('Crash', send_a=0.2)
s.mix('Riser', send_a=0.3)
s.fx('Hat', 'highpass', cutoff=5000, res=0.7)
s.fx('OHat', 'highpass', cutoff=3500, res=0.7)

s.pat('Kick', quarters(1))
HAT = from_str('x7a7 x7a7 x7a7 x7aa'.replace('a', '9'))
s.pat('Hat', HAT)
s.steps('Hat', step_extras(HAT, seed=9))
s.pat('OHat', '..x. ..x. ..x. ..x.')
s.pat('Snare', '.... x... .... x...')
s.pat('Clap', '.... x... .... x...')
ZAP = from_str('.... ...6 .... .... .... .... ..7. ...5')
s.pat('Zap', ZAP)
for t in ('Tom', 'Roll', 'Crash', 'Impact', 'Riser'):
    s.pat(t, at(1, []))
s.pat('Roll32', at(4, []))
s.steps('Roll32', roll32_offsets(64))

# ── Harmony ─────────────────────────────────────────────────────────────
Fm = (42, [49, 54, 57, 64])     # C# F# A E: F#m7, open
G = (43, [50, 55, 59, 66])      # D G B F#: Gmaj7, the phrygian bII
E = (40, [52, 56, 59, 66])      # E G# B F#: E add9
D = (38, [50, 54, 57, 64])      # D F# A E: D add9
Bm = (35, [47, 54, 57, 62])     # B F# A D: Bm7
Gl = (43, [50, 55, 61, 66])     # D G C# F#: Gmaj7(#11)
Cs = (37, [49, 54, 56, 61])     # C# F# G# C#: C#sus4
HARM = {
    'Rush': [(0, 4, Fm), (4, 2, G), (6, 2, Fm)],
    'Strike': [(0, 3, Fm), (3, 1, E), (4, 3, D), (7, 1, Cs)],
    'Grind': [(0, 2, Bm), (2, 2, Gl)],
    'Surge': [(0, 2, D), (2, 2, E)],
    'Max': [(0, 2, Fm), (2, 2, D), (4, 2, G), (6, 2, E)],
}
SECTIONS = [('Rush', 8), ('Strike', 8), ('Grind', 4), ('Surge', 4), ('Max', 8)]

for t in ('Stab', 'Arp', 'Lead', 'Bass', 'Sub'):
    s.synth_track(t)
    s.length(t, 0)   # anchored: notes start with each section
s.synth('Stab', wave='square', wave_b='saw', mix=0.5, detune_b=14, cutoff=2400, res=2.0, drive=0.2, a=0.001, d=0.14,
        s=0.15, r=0.12)
s.synth('Arp', wave='square', wave_b='square', mix=0.3, detune_b=8, cutoff=3600, res=2.2, a=0.001, d=0.08, s=0.0, r=0.05)
s.synth('Lead', wave='saw', wave_b='saw', mix=0.5, detune_b=12, cutoff=3800, res=1.5, drive=0.45, a=0.004, d=0.2, s=0.75,
        r=0.16, lfo_rate=6.5, lfo_depth=0.08, lfo_dest='cutoff')
s.synth('Bass', wave='saw', wave_b='square', mix=0.45, detune_b=7, cutoff=1000, res=3.0, drive=0.5, a=0.001, d=0.09,
        s=0.25, r=0.03)
s.synth('Sub', wave='sine', cutoff=170, drive=0.12, a=0.003, d=0.2, s=0.9, r=0.06)
s.fx('Stab', 'highpass', cutoff=300, res=0.7)
s.fx('Arp', 'highpass', cutoff=600, res=0.7)
s.fx('Bass', 'highpass', cutoff=70, res=0.7)

s.mix('Stab', vol=0.55, pan=0.1, send_a=0.25, send_b=0.25)
s.mix('Arp', vol=0.6, pan=-0.15, send_a=0.1, send_b=0.25)
s.mix('Lead', vol=0.55, send_a=0.22, send_b=0.15)
s.mix('Bass', vol=0.7)
s.mix('Sub', vol=0.34)
for t, a in (('Sub', 0.65), ('Bass', 0.6), ('Stab', 0.3), ('Arp', 0.15), ('Lead', 0.12)):
    s.duck(t, 'Kick', amount=a, release=0.11)

s.fx_set('bus_a', 0, decay=1.4, damping=0.45, predelay=10, size=0.55)
s.fx_set('bus_b', 0, time=3, feedback=0.28)
s.fx('bus_b', 'lowpass', cutoff=6500, res=0.7)
s.fx('master', 'highpass', cutoff=20, res=0.7)
s.master(vol=1.0, limit=-1.5)


def up(h, o=12):
    return [(b, n, [x + o for x in ch]) for b, n, (r, ch) in h]


def chords(h, stab, vel=1.0):
    out = []
    for b, n, (r, ch) in h:
        for bb in range(b, b + n):
            out += [(bb * 16 + st, x, d, round(v * vel, 2)) for st, d, v in stab for x in ch]
    return out


def sub(h):
    return [(b * 16, r - 12, n * 16 - 1, 0.8) for b, n, (r, ch) in h]


def bass(h, cell, cut_last=0):
    out = []
    for b, n, (r, ch) in h:
        for bb in range(b, b + n):
            out += [(bb * 16 + st, r + o, d, v) for st, o, d, v in cell]
    end = max(b + n for b, n, _ in h) * 16
    return [e for e in out if e[0] < end - cut_last]


GALLOP = [(st + b, o, 1, v) for b in (0, 4, 8, 12) for st, o, v in ((1, 0, 0.6), (2, 12, 0.9), (3, 0, 0.7))]
GALLOP_B = [(st + b, o, 1, v) for b, alt in ((0, 0), (4, 0), (8, 0), (12, 7))
            for st, o, v in ((1, 0, 0.6), (2, 12 if not alt else alt, 0.9), (3, 0, 0.7))]
HALF = [(0, 0, 4, 0.9), (6, 0, 1, 0.7), (7, 12, 1, 0.8), (10, 0, 2, 0.7), (14, 10, 2, 0.8)]
STAB_ANSWER = [(10, 1, 0.75), (11, 1, 0.55), (14, 2, 0.7)]
STAB_OFF = [(2, 1, 0.7), (6, 1, 0.55), (10, 1, 0.7), (14, 1, 0.55)]

STRIKE = motif('0:F#4:2 3:A4:2 6:C#5:3 10:B4:2 12:A4:2 14:B4:2 16:C#5:3 19:E5:3 22:C#5:2 24:B4:4 28:A4:2 30:G#4:2 '
               '32:F#4:2 35:A4:2 38:C#5:3 42:E5:2 44:F#5:4 48:E5:3 51:B4:3 54:G#4:4 58:B4:2 60:E5:4 '
               '64:D5:2 67:F#5:2 70:E5:3 74:D5:2 76:C#5:2 78:A4:2 80:B4:3 83:C#5:3 86:D5:2 88:E5:6 94:D5:2 '
               '96:C#5:2 99:D5:2 102:F#5:3 106:E5:2 108:D5:2 110:C#5:2 112:B4:4 116:C#5:4 120:F#5:2 122:G#5:6')
STRIKE = [(st, n, d, 0.85 if st % 8 == 0 else 0.72) for st, n, d, v in STRIKE]
CALL = [e for e in STRIKE if e[0] < 32]
OVER_G = motif('0:B4:2 3:D5:2 6:F#5:3 10:E5:2 12:D5:2 14:B4:2 16:D5:3 19:F#5:3 22:G5:2 24:F#5:4 28:D5:2 30:B4:2')
OVER_E = motif('0:G#4:2 3:B4:2 6:E5:3 10:F#5:2 12:G#5:4 16:F#5:3 19:E5:3 22:C#5:4 26:B4:2 28:C#5:4')
MAX = (octave(CALL, 1, 'alt')
       + [(st + 32, n, d, v) for st, n, d, v in octave(transpose(CALL, -2, key), 1, 'alt')]
       + [(st + 64, n, d, 0.85) for st, n, d, v in octave(OVER_G, 1, 'alt')]
       + [(st + 96, n, d, 0.85) for st, n, d, v in OVER_E])

for name, bars in SECTIONS:
    s.sec(name, bars)
for name, bars in SECTIONS:
    if name != 'Surge':
        s.ovr(name, 'Sub', notes=sub(HARM[name]))

# Rush
s.ovr('Rush', 'Bass', notes=bass(HARM['Rush'], GALLOP))
s.ovr('Rush', 'Arp', notes=arp(up(HARM['Rush']), [0, 1, 2, 3, 4, 3, 2, 1], 8, vel=(0.85, 0.55)), cutoff=(2200, 4200),
      vol=0.78)
s.ovr('Rush', 'Stab', notes=chords(HARM['Rush'], [(0, 2, 0.8), (7, 1, 0.5)]), cutoff=(1800, 3000), vol=0.7)
s.mute('Rush', 'Lead')
s.mute('Rush', 'Tom')
s.ovr('Rush', 'Crash', pat=at(8, [0]))
s.ovr('Rush', 'Hat', pat=fill(HAT * 8, 'roll'))
s.ovr('Rush', 'Kick', pat=quarters(4, last='x... x... x... x.4.'))

# Strike: the lead, answered by stabs
s.ovr('Strike', 'Lead', notes=STRIKE)
s.ovr('Strike', 'Bass', notes=bass(HARM['Strike'], GALLOP_B))
s.ovr('Strike', 'Stab', notes=chords(HARM['Strike'], STAB_ANSWER), cutoff=2600)
s.ovr('Strike', 'Arp', notes=arp(up(HARM['Strike'], 36), [0, 2, 1, 3], 8, rate=2, vel=(0.6, 0.45)), cutoff=5000,
      vol=0.26, send_b=0.4)
s.ovr('Strike', 'Crash', pat=at(8, [0], 0.7))
s.mute('Strike', 'Tom')
s.ovr('Strike', 'OHat', pat=from_str('..x. ..x. ..x. ..xx'))
s.ovr('Strike', 'Kick', pat=quarters(8, last='x... x... x..5 x...'))

# Grind: the floor goes half-time, toms and stabs push the offbeat
s.ovr('Grind', 'Bass', notes=bass(HARM['Grind'], HALF))
s.ovr('Grind', 'Stab', notes=chords(HARM['Grind'], STAB_OFF), cutoff=(1800, 3600), vol=0.62)
s.ovr('Grind', 'Arp', notes=arp(up(HARM['Grind']), [0, 4, 1, 5, 2, 6, 3, 7], 4, vel=(0.8, 0.6)), cutoff=(2600, 5200))
s.ovr('Grind', 'Tom', pat=from_str('.... .... ..6. .7.. .... .... ..6. 8.7.' * 2))
s.mute('Grind', 'Lead')
s.mute('Grind', 'Clap')
s.ovr('Grind', 'Snare', pat=from_str('.... .... .... .... .... .... x... ....' * 2))
s.ovr('Grind', 'Hat', pat=from_str('x.8. x.8. x.8. x.89'))
s.ovr('Grind', 'Kick', decay=0.6)

# Surge: build
p16, p32 = roll_build(4, gap_steps=2, start=0.35, seed=3)
s.ovr('Surge', 'Roll', pat=p16, tune=(-3, 7))
s.ovr('Surge', 'Roll32', pat=p32, tune=(-3, 7))
s.ovr('Surge', 'Riser', pat=at(4, [0], 0.9))
for t in ('Sub', 'Bass', 'Lead', 'Clap', 'OHat', 'Tom'):
    s.mute('Surge', t)
s.ovr('Surge', 'Snare', pat=from_str('.... x... .... x...' * 3 + '.... .... .... ....'))
s.ovr('Surge', 'Stab', notes=chords(HARM['Surge'], [(0, 1, 0.8), (3, 1, 0.6), (6, 1, 0.8), (8, 2, 0.7)]),
      cutoff=(1200, 4000))
s.ovr('Surge', 'Arp', notes=arp(up(HARM['Surge'], 12), [0, 1, 2, 3, 4, 5, 6, 7], 4, vel=(0.85, 0.6)),
      cutoff=(1500, 6000))
s.ovr('Surge', 'master', filter=(20, 520))
s.ovr('Surge', 'Kick', decay=(1.0, 0.4))

# Max
s.ovr('Max', 'Impact', pat=at(8, [0]))
s.ovr('Max', 'Crash', pat=at(8, [0, 64], 0.9))
s.ovr('Max', 'Lead', notes=MAX, vol=0.5)
s.ovr('Max', 'Bass', notes=bass(HARM['Max'], GALLOP_B, cut_last=3))
s.ovr('Max', 'Stab', notes=chords(HARM['Max'], STAB_ANSWER, 0.9), cutoff=3000, vol=0.5)
s.ovr('Max', 'Arp', notes=arp(up(HARM['Max'], 36), [0, 1, 2, 3, 2, 1], 8, vel=(0.6, 0.4)), cutoff=5500, vol=0.24,
      send_b=0.4)
s.ovr('Max', 'Tom', pat=at(8, [120, 122, 124, 126], 0.7))
s.ovr('Max', 'Snare', pat=from_str('.... x... .... x...' * 7 + '.... x... ..x. xxxx'))
s.ovr('Max', 'Hat', pat=fill(HAT * 8, 'stutter'))
s.ovr('Max', 'Zap', pat=ZAP, vol=0.34)
s.ovr('Max', 'Kick', pat=quarters(2, last='x... x... x..4 x...'), tune=0.5)

finish(s, NAME, BPM)
