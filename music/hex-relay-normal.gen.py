#!/usr/bin/env python3
"""HEX RELAY: Solo Normal — Saccade. 140 BPM, E aeolian, 32 bars, loops forever.

The main game loop. A clear kick on every beat, a rolling square-and-saw
bass between the kicks, a 16th arp that runs like a cursor, and a lead hook
that waits eight bars before it speaks. The chords move in uneven breaths
(4+2+2, then 3+1+3+1); the colour chord, C major 7 with a sharp 11, comes
once, in the Shift.

    Run 8    kick, hats, rolling bass, arp, open chords (Em - C - D)
    Hook 8   + lead hook, clap on 2 and 4 (Em - G - C - D)
    Shift 4  the bass goes half-time, lead rests, arp in 8ths with delay (Am7 - Cmaj7#11)
    Build 4  sub and bass out, master highpass up, snare roll and riser (C - D)
    Peak 8   impact and crash, sub, the hook up an octave over Em - C - G - D;
             the last bar fills back into Run

Run from the neuron root: python3 projects/hex-relay-normal.gen.py
"""

import sys

sys.path.insert(0, 'tools')
sys.path.insert(0, 'projects')
from hex_relay_common import Script, arp, at, drum_track, finish, foley, from_str, kit, quarters, tile  # noqa: E402
from neuron_compose import Key, fill, motif, octave, roll_build, roll32_offsets, step_extras, transpose  # noqa: E402

NAME = 'hex-relay-normal'
BPM = 140
KIT = f'samples/gen/{NAME}'
key = Key('E', 'aeolian')
s = Script('HEX RELAY: Solo Normal — Saccade (arcade electronica, E aeolian)', bpm=BPM)

k = kit(s, KIT, kick=dict(pitch=55, sweep=26, decay=0.2, click=0.5, tone=5000, drive=0.3),
        clap=dict(tone=1700, decay=0.16), snare=dict(pitch=210, decay=0.1, snap=0.6),
        hat=dict(tone=10000, decay=0.028, metal=0.6), ohat=dict(decay=0.2, tone=9000),
        perc=dict(pitch=1760, decay=0.045), crash_len=1.8, seed=200)
impact = foley(s, KIT, 'impact', 'impact', length=2.5)
riser = foley(s, KIT, 'riser', 'riser', length=round(4 * 4 * 60 / BPM, 3))

# ── Drums ───────────────────────────────────────────────────────────────
drum_track(s, 'Kick', k['kick'], 0.55, time=1, vel=0.04, pitch=0)
drum_track(s, 'Clap', k['clap'], 0.62, time=3)
drum_track(s, 'Hat', k['hat'], 0.42, pan=0.2, time=5, vel=0.2, pitch=30, decay=0.045)
drum_track(s, 'OHat', k['ohat'], 0.3, pan=-0.22, time=3, decay=0.2)
drum_track(s, 'Blip', k['perc'], 0.3, pan=0.38, time=4)
drum_track(s, 'Roll', k['snare'], 0.5, pan=0.05, time=0)
drum_track(s, 'Roll32', k['snare'], 0.38, pan=-0.05, time=0)
drum_track(s, 'Crash', [k['crash']], 0.42, pan=-0.15, time=0)
drum_track(s, 'Impact', [impact], 0.7, time=0)
drum_track(s, 'Riser', [riser], 0.4, time=0)
s.mix('Clap', send_a=0.18)
s.mix('Blip', send_b=0.35)
s.mix('Roll', send_a=0.15)
s.mix('Roll32', send_a=0.15)
s.mix('Crash', send_a=0.2)
s.mix('Riser', send_a=0.3)
s.fx('Hat', 'highpass', cutoff=4000, res=0.7)
s.fx('OHat', 'highpass', cutoff=3000, res=0.7)

s.pat('Kick', quarters(1))
HAT = from_str('x.7. 8.7. x.7. 8.79')
s.pat('Hat', HAT)
s.steps('Hat', step_extras(HAT, seed=5))
s.pat('OHat', '..x. ..x. ..x. ..x.')
s.pat('Clap', '.... x... .... x...')
BLIP = from_str('...6 .... ..5. ...7 .... .6.. ...5 ..6.')
s.pat('Blip', BLIP)
s.length('Blip', 2)
for t in ('Roll', 'Crash', 'Impact', 'Riser'):
    s.pat(t, at(1, []))
s.pat('Roll32', at(4, []))
s.steps('Roll32', roll32_offsets(64))

# ── Harmony ─────────────────────────────────────────────────────────────
Em = (40, [52, 55, 59, 66])      # E G B F#: Em(add9)
C = (36, [48, 55, 59, 64])       # Cmaj7
D = (38, [50, 57, 62, 64])       # Dsus2
G = (43, [55, 59, 62, 64])       # G6
Am = (45, [52, 55, 57, 60])      # Am7
Cl = (36, [48, 55, 59, 66])      # Cmaj7(#11), the colour, once
HARM = {
    'Run': [(0, 4, Em), (4, 2, C), (6, 2, D)],
    'Hook': [(0, 3, Em), (3, 1, G), (4, 3, C), (7, 1, D)],
    'Shift': [(0, 2, Am), (2, 2, Cl)],
    'Build': [(0, 2, C), (2, 2, D)],
    'Peak': [(0, 2, Em), (2, 2, C), (4, 2, G), (6, 2, D)],
}
SECTIONS = [('Run', 8), ('Hook', 8), ('Shift', 4), ('Build', 4), ('Peak', 8)]

for t in ('Pad', 'Arp', 'Lead', 'Bass', 'Sub'):
    s.synth_track(t)
    s.length(t, 0)   # anchored: notes start with each section
s.synth('Pad', wave='saw', wave_b='saw', mix=0.5, detune_b=13, cutoff=1800, res=0.9, a=0.08, d=0.5, s=0.7, r=0.6)
s.synth('Arp', wave='square', cutoff=3200, res=1.8, a=0.001, d=0.11, s=0.0, r=0.06)
s.synth('Lead', wave='saw', wave_b='square', mix=0.45, detune_b=9, cutoff=3400, res=1.3, drive=0.15, a=0.006, d=0.25,
        s=0.7, r=0.22, lfo_rate=6, lfo_depth=0.06, lfo_dest='cutoff')
s.synth('Bass', wave='square', wave_b='saw', mix=0.55, detune_b=6, cutoff=850, res=2.6, drive=0.35, a=0.001, d=0.13,
        s=0.3, r=0.04)
s.synth('Sub', wave='sine', cutoff=180, drive=0.1, a=0.004, d=0.2, s=0.9, r=0.08)
s.fx('Pad', 'highpass', cutoff=260, res=0.7)
s.fx('Arp', 'highpass', cutoff=500, res=0.7)
s.fx('Bass', 'highpass', cutoff=60, res=0.7)

s.mix('Pad', vol=0.5, send_a=0.4)
s.mix('Arp', vol=0.62, pan=-0.12, send_a=0.12, send_b=0.3)
s.mix('Lead', vol=0.6, pan=0.06, send_a=0.25, send_b=0.18)
s.mix('Bass', vol=0.78)
s.mix('Sub', vol=0.36)
for t, a in (('Sub', 0.6), ('Bass', 0.55), ('Pad', 0.35), ('Arp', 0.15), ('Lead', 0.1)):
    s.duck(t, 'Kick', amount=a, release=0.13)

s.fx_set('bus_a', 0, decay=1.8, damping=0.5, predelay=15, size=0.6)
s.fx_set('bus_b', 0, time=3, feedback=0.3)
s.fx('bus_b', 'lowpass', cutoff=6000, res=0.7)
s.fx('master', 'highpass', cutoff=20, res=0.7)
s.master(vol=1.0, limit=-1.5)


def up(h, o=12):
    return [(b, n, [x + o for x in ch]) for b, n, (r, ch) in h]


def pad(h, stab=None):
    """Held chords, or a stab rhythm (steps in a bar) on each chord."""
    out = []
    for b, n, (r, ch) in h:
        if stab is None:
            out += [(b * 16, x, n * 16 - 1, 0.55) for x in ch]
        else:
            for bb in range(b, b + n):
                out += [(bb * 16 + st, x, d, v) for st, d, v in stab for x in ch]
    return out


def sub(h):
    return [(b * 16, r - 12, n * 16 - 1, 0.8) for b, n, (r, ch) in h]


def bass(h, cell, cut_last=0):
    out = []
    for b, n, (r, ch) in h:
        for bb in range(b, b + n):
            out += [(bb * 16 + st, r + o, d, v) for st, o, d, v in cell]
    if cut_last:
        end = max(b + n for b, n, _ in h) * 16
        out = [e for e in out if e[0] < end - cut_last]
    return out


ROLLING = [(0, 0, 1, 0.55), (2, 0, 1, 0.9), (3, 12, 1, 0.6), (6, 0, 1, 0.9), (7, 12, 1, 0.6),
           (10, 0, 1, 0.9), (11, 12, 1, 0.6), (14, 0, 1, 0.9), (15, 7, 1, 0.65)]
SYNC = [(0, 0, 2, 0.8), (3, 0, 1, 0.7), (6, 12, 1, 0.85), (8, 0, 1, 0.6), (10, 0, 1, 0.9), (11, 12, 1, 0.6),
        (13, 10, 1, 0.75), (14, 12, 2, 0.8)]
HALF = [(0, 0, 6, 0.85), (10, 12, 2, 0.7), (14, 7, 2, 0.6)]

# The hook: two bars of call, two of answer, over Em - G - C - D
HOOK = motif('0:B4:3 3:E5:3 6:F#5:2 8:G5:4 12:F#5:2 14:E5:2 16:D5:3 19:E5:3 22:B4:6 28:A4:2 30:B4:2 '
             '32:B4:3 35:E5:3 38:F#5:2 40:G5:2 42:A5:2 44:B5:4 48:A5:3 51:G5:3 54:D5:6 '
             '64:E5:3 67:G5:3 70:B5:2 72:A5:4 76:G5:2 78:E5:2 80:G5:6 86:F#5:2 88:E5:8 '
             '96:E5:3 99:D5:3 102:C5:2 104:B4:4 108:C5:2 110:D5:2 112:F#5:4 116:A5:4 120:F#5:2 122:E5:2 124:D5:4')
HOOK = [(st, n, d, 0.82 if st % 8 == 0 else 0.7) for st, n, d, v in HOOK]
CALL = [e for e in HOOK if e[0] < 32]
# Peak: the call over each chord of Em - C - G - D, up an octave on alternate notes
PEAK = (octave(CALL, 1, 'alt')
        + [(st + 32, n, d, v) for st, n, d, v in transpose(CALL, -2, key)]
        + [(st + 64, n, d, v) for st, n, d, v in octave(transpose(CALL, 2, key), 1, 'alt')]
        + [(st + 96, n, d, v) for st, n, d, v in transpose(CALL, 1, key) if st < 22] + [(118, 81, 10, 0.75)])

for name, bars in SECTIONS:
    s.sec(name, bars)
for name, bars in SECTIONS:
    h = HARM[name]
    if name != 'Build':
        s.ovr(name, 'Sub', notes=sub(h))

# Run: the floor of the track
s.ovr('Run', 'Pad', notes=pad(HARM['Run']), cutoff=(1300, 2600), vol=0.66)
s.ovr('Run', 'Bass', notes=bass(HARM['Run'], ROLLING))
s.ovr('Run', 'Arp', notes=arp(up(HARM['Run']), [0, 1, 2, 3, 2, 1], 8, vel=(0.85, 0.55)), cutoff=(2000, 3600), vol=0.75)
s.ovr('Run', 'Crash', pat=at(8, [0]))
s.mute('Run', 'Lead')
s.ovr('Run', 'Clap', pat=from_str('.... .... .... x...' * 7 + '.... x... .... x.55'))
s.ovr('Run', 'OHat', pat=from_str('.... .... .... ....' * 4 + '..x. ..x. ..x. ..x.' * 4))
s.ovr('Run', 'Hat', pat=fill(HAT * 8, 'roll'))

# Hook: the lead speaks; the chords turn to stabs so it has room
s.ovr('Hook', 'Lead', notes=[(st, n - 12, d, v) for st, n, d, v in HOOK], vol=0.7)
s.ovr('Hook', 'Pad', notes=pad(HARM['Hook'], stab=[(2, 1, 0.6), (6, 1, 0.45), (10, 2, 0.6)]), cutoff=2400, vol=0.42)
s.ovr('Hook', 'Bass', notes=bass(HARM['Hook'], SYNC))
s.ovr('Hook', 'Arp', notes=arp(up(HARM['Hook'], 24), [0, 2, 1, 3, None, 2, 1, None], 8, vel=(0.7, 0.45)), cutoff=2600,
      vol=0.42)
s.ovr('Hook', 'Crash', pat=at(8, [0], 0.7))
s.ovr('Hook', 'Hat', pat=fill(from_str('x.7. 8.7. x.7. 8.7.' * 3 + 'x.7. 8.7. x.77 8.79') * 2, 'stutter'))

# Shift: the floor falls away; the arp and its echo carry it
s.ovr('Shift', 'Bass', notes=bass(HARM['Shift'], HALF))
s.ovr('Shift', 'Pad', notes=pad(HARM['Shift']), cutoff=(2600, 1400), vol=0.7)
s.ovr('Shift', 'Arp', notes=arp(up(HARM['Shift']), [0, 3, 1, 4, 2, 5, 3, 1], 4, rate=2, dur=2, vel=(0.8, 0.6)),
      cutoff=(2400, 4200), send_b=0.5, vol=0.8)
s.mute('Shift', 'Lead')
s.mute('Shift', 'Clap')
s.ovr('Shift', 'Hat', pat=from_str('..7. ..7. ..7. ..7.'))
s.mute('Shift', 'OHat')
s.ovr('Shift', 'Blip', pat=from_str('...6 .... .... ...7 .... .... ...5 ....'))

# Build: take the low end and the chords' rest away; pull with a roll
p16, p32 = roll_build(4, gap_steps=3, start=0.3, seed=7)
s.ovr('Build', 'Roll', pat=p16, tune=(-4, 5))
s.ovr('Build', 'Roll32', pat=p32, tune=(-4, 5))
s.ovr('Build', 'Riser', pat=at(4, [0], 0.9))
s.mute('Build', 'Sub')
s.mute('Build', 'Bass')
s.mute('Build', 'Lead')
s.mute('Build', 'Clap')
s.mute('Build', 'OHat')
s.ovr('Build', 'Pad', notes=pad(HARM['Build'], stab=[(0, 2, 0.6), (8, 2, 0.5)]), cutoff=(800, 3000))
s.ovr('Build', 'Arp', notes=arp(up(HARM['Build'], 12), [0, 1, 2, 3, 4, 5, 6, 7], 4, vel=(0.8, 0.6)), cutoff=(1200, 5000))
s.ovr('Build', 'master', filter=(20, 320))
s.ovr('Build', 'Hat', pat=from_str('x.x. x.x. x.x. x.x.' * 3 + 'xxxx xxxx xxx. ....'))

# Peak: everything lands; the hook comes back an octave up over new chords
s.ovr('Peak', 'Impact', pat=at(8, [0]))
s.ovr('Peak', 'Crash', pat=at(8, [0, 64], 0.9))
s.ovr('Peak', 'Lead', notes=PEAK, vol=0.62)
s.ovr('Peak', 'Bass', notes=bass(HARM['Peak'], ROLLING, cut_last=2))
s.ovr('Peak', 'Pad', notes=pad(HARM['Peak'], stab=[(0, 3, 0.6), (6, 1, 0.45), (10, 3, 0.55)]), cutoff=2800, vol=0.45)
s.ovr('Peak', 'Arp', notes=arp(up(HARM['Peak'], 36), [0, 2, 1, 3], 8, rate=2, vel=(0.7, 0.5)), cutoff=5000,
      vol=0.3, send_b=0.45)
s.ovr('Peak', 'Clap', pat=from_str('.... x... .... x...' * 7 + '.... x... ..x. x.xx'))
s.ovr('Peak', 'Hat', pat=fill(from_str('x.7. 8.7. x.7. 8.79') * 8, 'roll'))
s.ovr('Peak', 'Roll', pat=at(8, [124, 125, 126, 127], 0.6))
s.ovr('Peak', 'Blip', pat=BLIP, vol=0.36)

# The kick keeps every beat, but its body and pickups change by section
s.ovr('Hook', 'Kick', pat=quarters(4, last='x... x... x... x..4'))
s.ovr('Shift', 'Kick', decay=0.6, tune=1)
s.ovr('Build', 'Kick', decay=(1.0, 0.45))
s.ovr('Peak', 'Kick', pat=quarters(2, last='x... x... x..3 x...'), tune=0.5)

finish(s, NAME, BPM)
