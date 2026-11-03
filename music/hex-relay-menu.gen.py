#!/usr/bin/env python3
"""HEX RELAY: Menu — Saccade. 120 BPM, A dorian, 16 bars, loops forever.

The calm one, behind the title screen. A soft kick on every beat, an open
A minor chord with its 9th, and the dorian lift to D. The arp is the theme
at first; a square lead enters over a borrowed F lydian chord, and its
answer ends on the 9th of D, which pulls back to A at the top of the loop.
The last bar breathes in: the bass stops, a reverse cymbal ends on the loop
point, and the reverb of the last bar rings into the first.

    Wake 4   kick, hats, pad, sub, filtered 8th arp
    Glide 4  + pulse bass, arp opens into 16ths
    Theme 4  + lead over Fmaj7(#11) and G, clap on 2 and 4
    Return 4 lead answer, Am - Em7 - D, pullback and swell into bar 1

Run from the neuron root: python3 projects/hex-relay-menu.gen.py
"""

import sys

sys.path.insert(0, 'tools')
sys.path.insert(0, 'projects')
from hex_relay_common import (Script, arp, at, drum_track, every, finish, foley, from_str, kit,  # noqa: E402
                              quarters)
from neuron_compose import motif, step_extras  # noqa: E402,F401

NAME = 'hex-relay-menu'
BPM = 120
KIT = f'samples/gen/{NAME}'
s = Script('HEX RELAY: Menu — Saccade (arcade electronica, A dorian)', bpm=BPM)

k = kit(s, KIT, kick=dict(pitch=52, sweep=22, decay=0.22, click=0.4, tone=4500, drive=0.2),
        clap=dict(tone=1900, decay=0.14), hat=dict(tone=9500, decay=0.03), ohat=dict(decay=0.22),
        perc=dict(pitch=1320, decay=0.05), seed=100)
shaker = s.drum('shaker', f'{KIT}/shaker.wav', preset='soft', variants=3, seed=110)
swell = foley(s, KIT, 'swell', 'swell', length=2.0)

# ── Drums ───────────────────────────────────────────────────────────────
drum_track(s, 'Kick', k['kick'], 0.5, time=1, vel=0.04, pitch=0)
drum_track(s, 'Hat', k['hat'], 0.5, pan=0.22, time=6, vel=0.18, pitch=30, decay=0.05)
drum_track(s, 'Shaker', shaker, 0.4, pan=-0.28, time=7, vel=0.25, pitch=20)
drum_track(s, 'Clap', k['clap'], 0.6, time=3)
drum_track(s, 'Blip', k['perc'], 0.35, pan=0.35, time=5)
drum_track(s, 'Swell', [swell], 0.42, time=0)
s.mix('Clap', send_a=0.25)
s.mix('Blip', send_b=0.4)
s.mix('Swell', send_a=0.2)

s.pat('Kick', quarters(1, 0.92))
hat = [0.0, 0.0, 0.8, 0.0] * 4
s.pat('Hat', hat)
shk = [0.5 if i % 4 == 0 else (0.25 if i % 2 else 0.35) for i in range(16)]
s.pat('Shaker', shk)
s.steps('Shaker', step_extras(shk, prob_ghost=0.75, seed=3))
s.pat('Clap', '.... x... .... x...')
s.pat('Blip', '.... .... .... ..5.')
s.pat('Swell', at(4, []))

# ── Harmony (A dorian) ──────────────────────────────────────────────────
Am = [52, 57, 59, 60]       # E3 A3 B3 C4: A minor with its 9th
D = [50, 57, 62, 64]        # D3 A3 D4 E4: the dorian IV as an open sus2
Fl = [53, 57, 59, 64]       # F3 A3 B3 E4: Fmaj7(#11), borrowed, once
G = [55, 57, 62]            # G3 A3 D4: G sus2
Em = [52, 59, 62]           # E3 B3 D4: Em7 without its 3rd
ROOT = {id(Am): 45, id(D): 50, id(Fl): 41, id(G): 43, id(Em): 40}
HARM = {
    'Wake': [(0, 3, Am), (3, 1, D)],
    'Glide': [(0, 3, Am), (3, 1, D)],
    'Theme': [(0, 2, Fl), (2, 2, G)],
    'Return': [(0, 2, Am), (2, 1, Em), (3, 1, D)],
}

for t in ('Pad', 'Arp', 'Lead', 'Bass', 'Sub'):
    s.synth_track(t)
    s.length(t, 4)
s.synth('Pad', wave='saw', wave_b='triangle', mix=0.55, detune_b=11, cutoff=1500, res=0.8, a=0.35, d=0.4, s=0.8, r=1.1,
        lfo_rate=0.25, lfo_depth=0.2, lfo_dest='cutoff')
s.synth('Arp', wave='square', wave_b='triangle', mix=0.35, cutoff=1500, res=1.6, a=0.002, d=0.16, s=0.0, r=0.1)
s.synth('Lead', wave='square', wave_b='saw', mix=0.25, detune_b=7, cutoff=2600, res=1.2, a=0.012, d=0.3, s=0.65, r=0.3,
        lfo_rate=5.5, lfo_depth=0.08, lfo_dest='cutoff')
s.synth('Bass', wave='square', wave_b='saw', mix=0.5, detune_b=5, cutoff=600, res=2.2, drive=0.25, a=0.002, d=0.16, s=0.35,
        r=0.06)
s.synth('Sub', wave='sine', cutoff=200, drive=0.08, a=0.005, d=0.2, s=0.9, r=0.12)
s.fx('Pad', 'highpass', cutoff=200, res=0.7)
s.fx('Arp', 'highpass', cutoff=350, res=0.7)

s.mix('Pad', vol=0.75, send_a=0.45)
s.mix('Arp', vol=0.85, pan=0.15, send_a=0.2, send_b=0.38)
s.mix('Lead', vol=0.8, pan=-0.08, send_a=0.3, send_b=0.22)
s.mix('Bass', vol=0.85)
s.mix('Sub', vol=0.42)
for t, a in (('Sub', 0.55), ('Bass', 0.45), ('Pad', 0.25), ('Arp', 0.12)):
    s.duck(t, 'Kick', amount=a, release=0.16)

s.fx_set('bus_a', 0, decay=2.6, damping=0.55, predelay=20, size=0.7)
s.fx_set('bus_b', 0, time=3, feedback=0.34)
s.fx('bus_b', 'lowpass', cutoff=5000, res=0.7)
s.master(vol=1.0, limit=-1.5)


def pad_notes(h):
    return [(b * 16, n, bars * 16, 0.55) for b, bars, ch in h for n in ch]


def sub_notes(h):
    return [(b * 16, ROOT[id(ch)] - 12, bars * 16 - 1, 0.8) for b, bars, ch in h]


def bass_notes(h, cell):
    """A pulse on the root an octave up from the sub, on the cell's steps."""
    out = []
    for b, bars, ch in h:
        r = ROOT[id(ch)]
        for bb in range(b, b + bars):
            for st, o, v in cell:
                out.append((bb * 16 + st, r + o, 1, v))
    return out


def up(h):
    return [(b, n, [x + 12 for x in ch]) for b, n, ch in h]


lead_theme = motif('0:A4:2 2:C5:2 4:E5:4 8:D5:2 10:C5:2 12:B4:4 '
                   '16:C5:2 18:E5:2 20:G5:6 28:E5:4 '
                   '32:B4:2 34:D5:2 36:F#5:4 40:E5:2 42:D5:2 44:B4:4 '
                   '48:D5:2 50:E5:2 52:A5:7 60:G5:2 62:F#5:2')
lead_answer = motif('0:E5:4 4:C5:2 6:D5:2 8:B4:6 16:A4:2 18:C5:2 20:E5:4 28:D5:4 '
                    '32:B4:4 36:G4:4 40:A4:4 48:F#4:4 52:E4:10')
lead_answer = [(st, n, d, 0.72 if i % 3 else 0.82) for i, (st, n, d, v) in enumerate(lead_answer)]
lead_theme = [(st, n, d, 0.8 if st % 8 == 0 else 0.68) for st, n, d, v in lead_theme]

PULSE_A = [(0, 0, 0.8), (6, 12, 0.5), (8, 0, 0.7), (14, 12, 0.5)]
PULSE_B = [(0, 0, 0.8), (3, 0, 0.4), (6, 12, 0.55), (8, 0, 0.7), (11, 7, 0.45), (14, 12, 0.55)]

SECTIONS = [('Wake', 4), ('Glide', 4), ('Theme', 4), ('Return', 4)]
for name, bars in SECTIONS:
    s.sec(name, bars)

for name, bars in SECTIONS:
    h = HARM[name]
    s.ovr(name, 'Pad', notes=pad_notes(h))
    # in Glide the sub sits out the last bar, so the Theme brings the low end back
    s.ovr(name, 'Sub', notes=sub_notes(h[:1] if name == 'Glide' else h))

# Wake: the arp alone carries the tune, an 8th line that climbs and falls
s.ovr('Wake', 'Arp', notes=arp(up(HARM['Wake']), [0, 2, 1, 3, 2, 4, 3, 1], 4, rate=2, dur=2), cutoff=(900, 1700))
s.mute('Wake', 'Bass')
s.mute('Wake', 'Lead')
s.mute('Wake', 'Clap')
s.ovr('Wake', 'Hat', pat=[0.0, 0.0, 0.6, 0.0] * 4, vol=0.4)
s.ovr('Wake', 'Pad', cutoff=(900, 1500))
s.ovr('Wake', 'Blip', pat=at(4, [62], 0.5))

# Glide: bass pulse enters, the arp doubles into 16ths and opens
s.ovr('Glide', 'Arp', notes=arp(up(HARM['Glide']), [0, 2, 4, 2, 1, 3, 5, 3], 4, rate=1, dur=1, vel=(0.8, 0.5)),
      cutoff=(1700, 2800))
s.ovr('Glide', 'Bass', notes=bass_notes(HARM['Glide'], PULSE_A))
s.mute('Glide', 'Lead')
s.mute('Glide', 'Clap')
s.ovr('Glide', 'Hat', pat=from_str('..8. ..8. ..8. ..83' * 4))

# Theme: the lead, over the borrowed F lydian; the arp steps down an octave, under it, in 8ths
s.ovr('Theme', 'Lead', notes=lead_theme)
s.ovr('Theme', 'Arp', notes=arp(HARM['Theme'], [3, 1, 2, 0], 4, rate=2, dur=1, vel=(0.6, 0.45)), cutoff=2200,
      vol=0.6)
s.ovr('Theme', 'Bass', notes=bass_notes(HARM['Theme'], PULSE_B))
s.ovr('Theme', 'Clap', pat=from_str('.... x... .... x...' * 3 + '.... x... .... x.5.'))
s.ovr('Theme', 'Pad', cutoff=1900)

# Return: the answer, lower and slower; the last bar breathes in to the loop
s.ovr('Return', 'Lead', notes=lead_answer)
s.ovr('Return', 'Arp', notes=arp(HARM['Return'], [0, 1, 2, 3, 4, 3, 2, 1], 4, rate=1, vel=(0.75, 0.5)),
      cutoff=(3200, 1800), vol=0.55)
s.ovr('Return', 'Bass', notes=[e for e in bass_notes(HARM['Return'], PULSE_A) if e[0] < 60])
s.ovr('Return', 'Clap', pat=from_str('.... x... .... x...' * 3 + '.... x... ..3. 4.6.'))
s.ovr('Return', 'Swell', pat=at(4, [48], 0.9))
s.ovr('Return', 'Shaker', pat=[v for _ in range(3) for v in shk] + from_str('5.3. 5.3. 5353 6789'))
s.ovr('Return', 'Kick', pat=quarters(4, 0.92))

finish(s, NAME, BPM)
