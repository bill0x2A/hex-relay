# HEX RELAY music and sound effects

Composed with [Neuron](/home/bill/code/neuron) by the artist Saccade (Claude Opus 5.5).
`build.py` writes everything in `public/audio/`; the game reads `public/audio/manifest.json`.

## Files

| File | What it is |
|---|---|
| `menu.mp3` | Title screen. 120 BPM, 16 bars (32 s), A dorian, calm |
| `solo-normal.mp3` | Solo game. 140 BPM, 32 bars (54.857 s), E minor |
| `solo-hard.mp3` | Solo hard mode. 160 BPM, 32 bars (48 s), F# minor, more intense |
| `battle-base.mp3` | Battle mode. 150 BPM, 32 bars (51.2 s), C minor |
| `battle-danger.mp3` | Stem for battle: same length and tempo, layered on top of `battle-base` (fade it in at 1 hit point or when an attack is incoming). High arp, open hats, sub pressure, alarm. No kick |
| `*.wav` | Sound effects: mono, 16-bit, 22050 Hz, start on the first sample |

Every music file is a seamless loop of exactly `bars * 4 * 60 / bpm` seconds
(sample-exact at 44.1 kHz; LAME gapless header, so decoders drop the encoder
delay). The reverb and delay tail of the last bar is wrapped onto the start.
Start `battle-danger` at the same time as `battle-base` and loop both; they
line up sample for sample. The danger stem is turned down wherever the two
together would pass -1 dBFS, so base + danger at full gain does not clip.

Sound effects: `select` (menu tick), `start` (round start), `pickup`, `fire`,
`warning` (incoming attack, 0.4 s), `hit`, `shield`, `death` (0.85 s, falling),
`lock` (controls locked), `win` (rising phrase), `heal`, `graze` (very short;
its peak is -9 dBFS rather than -3, since it plays often).

## Rebuild

Needs the Neuron repo with `target/release/neuron` built (`cargo build --release`),
python3 with numpy, `ffmpeg`, and `lame`.

```
python3 music/build.py                  # all music, sfx, and the manifest
python3 music/build.py solo-hard sfx    # only some targets
python3 music/build.py --no-gen         # render the existing neuron projects, do not regenerate
NEURON_DIR=/path/to/neuron python3 music/build.py
```

For each track, the generator here (`hex-relay-*.gen.py`, with `hex_relay_common.py`)
runs with the Neuron root as its working directory. It synthesizes the drum kit into
`samples/gen/hex-relay-<track>/` and writes `projects/hex-relay-<track>.json`. Then
neuron renders it, the render is cut and wrapped into a loop, and lame encodes it. The
sfx (`sfx.py`) put their one-shots in `samples/gen/hex-relay-sfx/`.

`build-report.json` holds the numbers of the last build: length, size, peak, RMS, and the
seam check (the decoded MP3 played twice: RMS of 50 ms either side of the joint, the
sample step at the joint against the local 99.5th percentile, and the same RMS
difference at every bar line inside the file for reference).

The same generators are in the Neuron repo at `projects/`. Edit one copy and copy it to the
other (`build.py` runs the copies here).

## Songs from another source (for example Suno)

`import-suno.py` turns full songs into the game's loops. It finds the tempo and beat grid, picks a strong section of exact length where the tempo is steady (Suno songs often speed up slowly), crossfades the seam, matches the loudness, encodes gapless MP3s, and updates `public/audio/manifest.json`.

```sh
uv run music/import-suno.py menu=~/Downloads/squarewavegroove.mp3 solo-normal=~/Downloads/arcadesurvival.mp3 \
  solo-hard=~/Downloads/untitled.mp3 solo-hyper=~/Downloads/hyper.mp3 battle=~/Downloads/versusfight.mp3
```

Add `--dry-run` to see the tempo and section without writing files. `battle` writes both battle files; with no stems, the danger layer is the upper band of the same section. `solo-hyper` is optional: without it, HYPER plays the hard track. `git checkout public/audio` restores the Neuron tracks.
