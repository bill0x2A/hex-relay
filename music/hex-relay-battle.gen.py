#!/usr/bin/env python3
"""HEX RELAY: Battle — Saccade. 150 BPM, C minor (aeolian, with a phrygian bII), 32 bars, loops forever.

The 1v1 track. Two leads play the two players: a square on the left and a
saw on the right trade two-bar phrases in the Clash, and in the Duel each
takes the other's phrase over new chords. Under them, a kick on every beat,
an octave-jumping bass, and Cm - Db (the phrygian lean) at the floor.

    Arena 8   kick, hats, bass, 16th arp, stabs (Cm - Db - Cm)
    Clash 8   + the two leads trade phrases, clap on 2 and 4 (Cm - Ab - Fm - Gsus)
    Feint 4   bass half-time, arp feature with delay (Abmaj7#11 - Bbsus2)
    Charge 4  sub and bass out, highpass, snare roll, riser (Ab - Bb)
    Duel 8    impact, both leads over Cm - Ab - Db - Bb; fills back into Arena

The danger stem (tracks D*) is in the same project and follows the same
harmony. It is rendered alone with `render --solo DArp,DHat,DSub,DAlarm,DuckKey`
(DuckKey is a silent kick that the danger tracks duck to), and the base
with every other track plus DuckKey. The game fades the stem in on top.

    DArp    a high 16th square arp on the chord tones, two octaves up
    DHat    open hats on the offbeats, 16th ticks
    DSub    sub pressure: offbeat 8th pulses on the 5th above the root
    DAlarm  a two-tone alarm (G and Db) every two bars

Run from the neuron root: python3 projects/hex-relay-battle.gen.py
"""

import sys

sys.path.insert(0, 'tools')
sys.path.insert(0, 'projects')
from hex_relay_common import Script, arp, at, drum_track, finish, foley, from_str, kit, quarters  # noqa: E402
from neuron_compose import Key, fill, motif, octave, roll_build, roll32_offsets, step_extras, transpose  # noqa: E402

NAME = 'hex-relay-battle'
BPM = 150
KIT = f'samples/gen/{NAME}'
key = Key('C', 'aeolian')
s = Script('HEX RELAY: Battle — Saccade (arcade electronica, C minor)', bpm=BPM)

k = kit(s, KIT, kick=dict(pitch=52, sweep=28, decay=0.24, click=0.45, tone=4200, drive=0.35),
        clap=dict(tone=1500, decay=0.15, bursts=5), snare=dict(pitch=200, decay=0.11, snap=0.55, drive=0.2),
        hat=dict(tone=9000, decay=0.03, metal=0.55), ohat=dict(decay=0.26, tone=8500, metal=0.6),
        perc=dict(pitch=1175, decay=0.05), crash_len=1.8, seed=400)
cow = s.drum('perc', f'{KIT}/metal.wav', preset='metal', variants=3, seed=410, decay=0.08)
impact = foley(s, KIT, 'impact', 'impact', length=2.4)
riser = foley(s, KIT, 'riser', 'riser', length=round(4 * 4 * 60 / BPM, 3))
dhat = s.drum('hat', f'{KIT}/dhat.wav', preset='open', variants=3, seed=420, decay=0.12, tone=11000, metal=0.75)
dtick = s.drum('hat', f'{KIT}/dtick.wav', preset='tight', variants=3, seed=421, decay=0.015, tone=12000)

# ── Drums ───────────────────────────────────────────────────────────────
drum_track(s, 'Kick', k['kick'], 0.55, time=1, vel=0.04, pitch=0)
drum_track(s, 'Clap', k['clap'], 0.6, time=3)
drum_track(s, 'Snare', k['snare'], 0.42, pan=0.04, time=2)
drum_track(s, 'Hat', k['hat'], 0.42, pan=0.2, time=5, vel=0.2, pitch=30, decay=0.04)
drum_track(s, 'OHat', k['ohat'], 0.26, pan=-0.2, time=3, decay=0.22)
drum_track(s, 'Metal', cow, 0.26, pan=-0.38, time=5)
drum_track(s, 'Roll', k['snare'], 0.4, time=0)
drum_track(s, 'Roll32', k['snare'], 0.3, time=0)
drum_track(s, 'Crash', [k['crash']], 0.42, pan=0.12, time=0)
drum_track(s, 'Impact', [impact], 0.7, time=0)
drum_track(s, 'Riser', [riser], 0.4, time=0)
s.mix('Clap', send_a=0.2)
s.mix('Metal', send_b=0.35)
s.mix('Crash', send_a=0.2)
s.mix('Riser', send_a=0.3)
s.fx('Hat', 'highpass', cutoff=4000, res=0.7)
s.fx('OHat', 'highpass', cutoff=3000, res=0.7)

s.pat('Kick', quarters(1))
HAT = from_str('x.8. 9.8. x.8. 9.89')
s.pat('Hat', HAT)
s.steps('Hat', step_extras(HAT, seed=11))
s.pat('OHat', '..x. ..x. ..x. ..x.')
s.pat('Clap', '.... x... .... x...')
s.pat('Snare', at(1, []))
METAL = from_str('...6 .... .... ..5. .... ..6. ...5 ....')
s.pat('Metal', METAL)
for t in ('Roll', 'Crash', 'Impact', 'Riser'):
    s.pat(t, at(1, []))
s.pat('Roll32', at(4, []))
s.steps('Roll32', roll32_offsets(64))

# ── Harmony ─────────────────────────────────────────────────────────────
Cm = (36, [48, 55, 58, 63])     # C G Bb Eb: Cm7, open
Db = (37, [49, 56, 60, 65])     # Db Ab C F: Dbmaj7, the phrygian bII
Ab = (44, [51, 56, 58, 60])     # Eb Ab Bb C: Ab add9
Fm = (41, [53, 56, 60, 63])     # F Ab C Eb: Fm7
Gs = (43, [50, 55, 60, 65])     # D G C F: G7sus4
Al = (44, [50, 55, 56, 60])     # D G Ab C: Abmaj7(#11)
Bb = (46, [53, 58, 60, 65])     # F Bb C F: Bbsus2
HARM = {
    'Arena': [(0, 4, Cm), (4, 2, Db), (6, 2, Cm)],
    'Clash': [(0, 3, Cm), (3, 1, Ab), (4, 3, Fm), (7, 1, Gs)],
    'Feint': [(0, 2, Al), (2, 2, Bb)],
    'Charge': [(0, 2, Ab), (2, 2, Bb)],
    'Duel': [(0, 2, Cm), (2, 2, Ab), (4, 2, Db), (6, 2, Bb)],
}
SECTIONS = [('Arena', 8), ('Clash', 8), ('Feint', 4), ('Charge', 4), ('Duel', 8)]

for t in ('Stab', 'Arp', 'LeadA', 'LeadB', 'Bass', 'Sub'):
    s.synth_track(t)
    s.length(t, 0)   # anchored: notes start with each section
s.synth('Stab', wave='saw', wave_b='saw', mix=0.5, detune_b=15, cutoff=2000, res=1.8, drive=0.15, a=0.002, d=0.2,
        s=0.25, r=0.18)
s.synth('Arp', wave='square', wave_b='triangle', mix=0.25, cutoff=3000, res=2.0, a=0.001, d=0.1, s=0.0, r=0.06)
s.synth('LeadA', wave='square', wave_b='square', mix=0.35, detune_b=10, cutoff=3200, res=1.2, drive=0.1, a=0.005,
        d=0.25, s=0.7, r=0.2, lfo_rate=6, lfo_depth=0.07, lfo_dest='cutoff')
s.synth('LeadB', wave='saw', wave_b='saw', mix=0.5, detune_b=11, cutoff=3000, res=1.4, drive=0.3, a=0.005, d=0.25,
        s=0.7, r=0.2, lfo_rate=5, lfo_depth=0.07, lfo_dest='cutoff')
s.synth('Bass', wave='square', wave_b='saw', mix=0.5, detune_b=6, cutoff=900, res=2.6, drive=0.4, a=0.001, d=0.12,
        s=0.3, r=0.04)
s.synth('Sub', wave='sine', cutoff=180, drive=0.1, a=0.004, d=0.2, s=0.9, r=0.08)
s.fx('Stab', 'highpass', cutoff=280, res=0.7)
s.fx('Arp', 'highpass', cutoff=450, res=0.7)
s.fx('Bass', 'highpass', cutoff=60, res=0.7)

s.mix('Stab', vol=0.55, pan=0.05, send_a=0.3, send_b=0.2)
s.mix('Arp', vol=0.65, pan=0.12, send_a=0.12, send_b=0.3)
s.mix('LeadA', vol=0.55, pan=-0.3, send_a=0.22, send_b=0.18)
s.mix('LeadB', vol=0.5, pan=0.3, send_a=0.22, send_b=0.18)
s.mix('Bass', vol=0.75)
s.mix('Sub', vol=0.36)
for t, a in (('Sub', 0.6), ('Bass', 0.55), ('Stab', 0.3), ('Arp', 0.15), ('LeadA', 0.1), ('LeadB', 0.1)):
    s.duck(t, 'Kick', amount=a, release=0.12)

# ── Danger stem ─────────────────────────────────────────────────────────
drum_track(s, 'DuckKey', k['kick'][:1], 0.0, time=0)
s.pat('DuckKey', quarters(1))
drum_track(s, 'DHat', dhat, 0.4, pan=0.3, time=4, vel=0.15, pitch=25, decay=0.12)
s.sampler('DHat', pool=dhat[1:] + dtick, mode='random')
DHAT = from_str('.3x3 .3x3 .3x3 .3x4')
s.pat('DHat', DHAT)
s.fx('DHat', 'highpass', cutoff=5000, res=0.7)
s.synth_track('DArp')
s.synth_track('DSub')
s.synth_track('DAlarm')
for t in ('DArp', 'DSub', 'DAlarm'):
    s.length(t, 0)
s.synth('DArp', wave='square', wave_b='saw', mix=0.2, cutoff=4200, res=2.4, a=0.001, d=0.07, s=0.0, r=0.04)
s.synth('DSub', wave='sine', wave_b='triangle', mix=0.25, cutoff=220, drive=0.35, a=0.003, d=0.12, s=0.5, r=0.05)
s.synth('DAlarm', wave='square', wave_b='square', mix=0.5, detune_b=25, cutoff=3000, res=3.0, drive=0.2, a=0.003, d=0.2,
        s=0.6, r=0.08, lfo_rate=12, lfo_depth=0.35, lfo_dest='amplitude')
s.fx('DArp', 'highpass', cutoff=900, res=0.7)
s.mix('DArp', vol=0.6, pan=-0.25, send_b=0.3)
s.mix('DSub', vol=0.3)
s.mix('DAlarm', vol=0.36, pan=0.15, send_a=0.25, send_b=0.25)
for t, a in (('DSub', 0.7), ('DArp', 0.45), ('DAlarm', 0.3)):
    s.duck(t, 'DuckKey', amount=a, release=0.1)
s.duck('DHat', 'DuckKey', amount=0.4, release=0.08)

s.fx_set('bus_a', 0, decay=1.8, damping=0.5, predelay=15, size=0.6)
s.fx_set('bus_b', 0, time=3, feedback=0.32)
s.fx('bus_b', 'lowpass', cutoff=6000, res=0.7)
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


def subroot(r):
    return r if r <= 40 else r - 12


def sub(h):
    return [(b * 16, subroot(r), n * 16 - 1, 0.8) for b, n, (r, ch) in h]


def bass(h, cell, cut_last=0):
    out = []
    for b, n, (r, ch) in h:
        for bb in range(b, b + n):
            out += [(bb * 16 + st, subroot(r) + 12 + o, d, v) for st, o, d, v in cell]
    end = max(b + n for b, n, _ in h) * 16
    return [e for e in out if e[0] < end - cut_last]


OCTAVE = [(0, -12, 1, 0.6), (2, 0, 1, 0.9), (4, -12, 1, 0.5), (6, 0, 1, 0.85), (7, 0, 1, 0.5), (10, 0, 1, 0.9),
          (11, -12, 1, 0.6), (13, 0, 1, 0.7), (14, 3, 1, 0.8)]
OCTAVE_B = [(0, -12, 1, 0.6), (2, 0, 1, 0.9), (3, 0, 1, 0.5), (6, 0, 1, 0.85), (8, -12, 1, 0.5), (10, 0, 1, 0.9),
            (12, 7, 1, 0.7), (14, 10, 1, 0.8), (15, 12, 1, 0.6)]
HALF = [(0, -12, 6, 0.85), (8, 0, 2, 0.7), (11, 0, 1, 0.6), (14, 7, 2, 0.7)]
STABS = [(0, 2, 0.75), (6, 1, 0.5), (10, 2, 0.65)]
ANSWER = [(10, 1, 0.7), (14, 2, 0.6)]

A1 = motif('0:G4:2 2:C5:2 4:Eb5:3 7:D5:1 8:C5:2 10:Bb4:2 12:C5:4 16:Eb5:2 18:F5:2 20:G5:4 24:F5:2 26:Eb5:2 28:D5:4')
B1 = motif('0:C5:2 2:Bb4:2 4:G4:4 8:Bb4:2 10:C5:2 12:Eb5:4 16:Eb5:3 19:C5:3 22:Ab4:4 26:Bb4:2 28:C5:4')
A2 = motif('0:F4:2 2:Ab4:2 4:C5:3 7:Bb4:1 8:Ab4:2 10:G4:2 12:Ab4:4 16:C5:2 18:Eb5:2 20:F5:4 24:Eb5:2 26:C5:2 28:Ab4:4')
B2 = motif('0:Ab4:2 2:G4:2 4:F4:4 8:Ab4:2 10:C5:2 12:F5:4 16:F5:3 19:D5:3 22:C5:4 26:D5:2 28:G5:4')
OVER_DB = motif('0:Db5:2 2:F5:2 4:Ab5:3 7:G5:1 8:F5:2 10:Eb5:2 12:F5:4 16:Ab5:2 18:Bb5:2 20:C6:4 24:Bb5:2 26:Ab5:2 '
                '28:F5:4')
OVER_BB = motif('0:D5:2 2:F5:2 4:Bb5:3 7:C6:1 8:Bb5:2 10:F5:2 12:D5:4 16:F5:2 18:G5:2 20:Bb5:4 24:C6:2 26:D6:2 '
                '28:G5:4')


def vel(m, a=0.85, b=0.72):
    return [(st, n, d, a if st % 8 == 0 else b) for st, n, d, v in m]


def at_bar(m, bar):
    return [(st + bar * 16, n, d, v) for st, n, d, v in m]


CLASH_A = vel(A1) + at_bar(vel(A2), 4)
CLASH_B = at_bar(vel(B1), 2) + at_bar(vel(B2), 6)
# Duel: each player takes the other's phrase, over new chords
DUEL_A = vel(octave(A1, 1, 'alt')) + at_bar(vel(OVER_DB), 4)
DUEL_B = at_bar(vel(transpose(B1, -2, key)), 2) + at_bar(vel(OVER_BB), 6)

for name, bars in SECTIONS:
    s.sec(name, bars)
for name, bars in SECTIONS:
    if name != 'Charge':
        s.ovr(name, 'Sub', notes=sub(HARM[name]))

# Arena
s.ovr('Arena', 'Bass', notes=bass(HARM['Arena'], OCTAVE))
s.ovr('Arena', 'Arp', notes=arp(up(HARM['Arena']), [0, 2, 1, 3, 2, 4, 3, 1], 8, vel=(0.85, 0.55)),
      cutoff=(1800, 3600), vol=0.75)
s.ovr('Arena', 'Stab', notes=chords(HARM['Arena'], STABS), cutoff=(1400, 2600), vol=0.62)
s.mute('Arena', 'LeadA')
s.mute('Arena', 'LeadB')
s.ovr('Arena', 'Crash', pat=at(8, [0]))
s.ovr('Arena', 'Clap', pat=from_str('.... .... .... x...' * 7 + '.... x... .... x.55'))
s.ovr('Arena', 'Hat', pat=fill(HAT * 8, 'roll'))
s.ovr('Arena', 'Kick', pat=quarters(4, last='x... x... x... x.4.'))

# Clash: the two players trade phrases
s.ovr('Clash', 'LeadA', notes=CLASH_A)
s.ovr('Clash', 'LeadB', notes=CLASH_B)
s.ovr('Clash', 'Bass', notes=bass(HARM['Clash'], OCTAVE_B))
s.ovr('Clash', 'Stab', notes=chords(HARM['Clash'], ANSWER), cutoff=2400)
s.ovr('Clash', 'Arp', notes=arp(up(HARM['Clash'], 0), [0, 2, 1, 3], 8, rate=2, vel=(0.6, 0.45)),
      cutoff=2000, vol=0.45)
s.ovr('Clash', 'Crash', pat=at(8, [0], 0.7))
s.ovr('Clash', 'Snare', pat=from_str('.... .... .... ....' * 7 + '.... .... ..5. 6789'))
s.ovr('Clash', 'Kick', pat=quarters(8, last='x... x... x..5 x...'))

# Feint: half-time floor, the arp and its echo carry it
s.ovr('Feint', 'Bass', notes=bass(HARM['Feint'], HALF))
s.ovr('Feint', 'Stab', notes=chords(HARM['Feint'], [(0, 14, 0.55)]), cutoff=(2400, 1200), vol=0.6)
s.ovr('Feint', 'Arp', notes=arp(up(HARM['Feint']), [0, 3, 1, 4, 2, 5, 3, 6], 4, vel=(0.85, 0.6)),
      cutoff=(2200, 4800), send_b=0.5, vol=0.8)
for t in ('LeadA', 'LeadB', 'Clap', 'OHat'):
    s.mute('Feint', t)
s.ovr('Feint', 'Hat', pat=from_str('..8. ..8. ..8. ..8.'))
s.ovr('Feint', 'Metal', pat=from_str('...6 .... .... ...7 .... ..5. .... ....'))
s.ovr('Feint', 'Kick', decay=0.6, tune=1)

# Charge: build
p16, p32 = roll_build(4, gap_steps=3, start=0.3, seed=5)
s.ovr('Charge', 'Roll', pat=p16, tune=(-4, 6))
s.ovr('Charge', 'Roll32', pat=p32, tune=(-4, 6))
s.ovr('Charge', 'Riser', pat=at(4, [0], 0.9))
for t in ('Sub', 'Bass', 'LeadA', 'LeadB', 'Clap', 'OHat'):
    s.mute('Charge', t)
s.ovr('Charge', 'Stab', notes=chords(HARM['Charge'], [(0, 2, 0.7), (8, 2, 0.6)]), cutoff=(900, 3200))
s.ovr('Charge', 'Arp', notes=arp(up(HARM['Charge'], 12), [0, 1, 2, 3, 4, 5, 6, 7], 4, vel=(0.8, 0.6)),
      cutoff=(1300, 5200))
s.ovr('Charge', 'master', filter=(20, 450))
s.ovr('Charge', 'Hat', pat=from_str('x.x. x.x. x.x. x.x.' * 3 + 'xxxx xxxx xxx. ....'))
s.ovr('Charge', 'Kick', decay=(1.0, 0.45))

# Duel
s.ovr('Duel', 'Impact', pat=at(8, [0]))
s.ovr('Duel', 'Crash', pat=at(8, [0, 64], 0.9))
s.ovr('Duel', 'LeadA', notes=DUEL_A)
s.ovr('Duel', 'LeadB', notes=DUEL_B)
s.ovr('Duel', 'Bass', notes=bass(HARM['Duel'], OCTAVE, cut_last=2))
s.ovr('Duel', 'Stab', notes=chords(HARM['Duel'], STABS, 0.9), cutoff=2800, vol=0.5)
s.mute('Duel', 'Arp')
s.ovr('Duel', 'Snare', pat=from_str('.... x... .... x...' * 7 + '.... x... ..x. xxxx'))
s.ovr('Duel', 'Hat', pat=fill(HAT * 8, 'stutter'))
s.ovr('Duel', 'Metal', pat=METAL, vol=0.32)
s.ovr('Duel', 'Kick', pat=quarters(2, last='x... x... x..4 x...'), tune=0.5)

# Danger stem, per section: the arp follows the chords two octaves up
DARP = {'Arena': [0, 3, 1, 3, 2, 3, 1, 3], 'Clash': [0, 2, 3, 2, 1, 2, 3, 4], 'Feint': [3, 2, 1, 0, 1, 2, 3, 4],
        'Charge': [0, 1, 2, 3, 4, 5, 6, 7], 'Duel': [4, 3, 1, 3, 2, 3, 0, 3]}
for name, bars in SECTIONS:
    h = HARM[name]
    # the arp and the alarm take turns: the arp rests while the alarm sounds
    s.ovr(name, 'DArp', notes=[e for e in arp(up(h, 24), DARP[name], bars, vel=(0.8, 0.5))
                               if not (e[0] // 16 % 2 == 1 and e[0] % 16 >= 8)])
    # the pressure pulses on the 5th above the sub's root, so it never cancels the sub
    s.ovr(name, 'DSub', notes=[(b * 16 + st, subroot(r) + 7, 2, 0.85 if st % 4 == 2 else 0.6)
                               for b0, n, (r, ch) in h for b in range(b0, b0 + n) for st in (2, 6, 10, 14)])
    # the alarm: G and Db, an alarm's tritone, on the second bar of every two
    s.ovr(name, 'DAlarm', notes=[(b * 16 + st, n, 2, 0.8) for b in range(1, bars, 2)
                                 for st, n in ((8, 79), (10, 85), (12, 79), (14, 85))])
s.ovr('Charge', 'DSub', gain=(-12, 0))
s.ovr('Feint', 'DHat', pat=from_str('..x. ..x. ..x. ..x.'))

finish(s, NAME, BPM)
