# Validation

Run on 2026-11-03 on Manjaro Linux with Node.js 26.10.0 and Google Chrome (headless).

- `npm run check`: passed (server, client, engine, offline build script).
- `npm test`: 30 of 30 passed, including shape changes. This includes real HTTP and WebSocket tests on loopback, battle rooms, the fire message, and lean snapshots.
- A bot survived 60 s on all 40 seeds of each difficulty (normal, hard, hyper), through every shape change. This shows that every pattern has a way through on 6, 5, and 4 sides.
- A HYPER autoplay run was checked by eye in headless Chrome: hexagon, pentagon, and square stages draw correctly.
- In 30 bot battles (two bots with reduced reach), every round ended between 160 s and 182 s, after sudden death. People will lose much sooner.
- `scripts/browser-smoke.py` (Python Playwright through `uv run --with playwright`, with the system Chrome): 8 of 8 checks passed, no page errors. It covers the arena menu, settings, solo start, pause, death and restart, the local duel draw, local split-screen battle, battle against the CPU, an online battle room with two clients, and the 390 px phone layout.
- Audio, checked in headless Chrome: all 12 effects and 5 music files decode. The MP3 loops decode to exactly bars × 4 × 60 / bpm seconds. Both battle stems start together. The offline file plays its embedded audio from `file://`.
- Battle snapshot size: at most about 4 KB before the lean format; the server now leaves out the random state and future rows.

Not checked here: Windows and macOS browsers, real gamepads, real touch hardware, internet latency, and high-refresh displays. The difficulty numbers come from bot runs, not from human play; tune `DIFFICULTY` in `public/engine.mjs` after playtests.
