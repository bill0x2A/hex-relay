# Plan: base-game feel, battle mode, and an arena menu

Terms are in `CONTEXT.md`.

## Decisions (2026-11-03)

- One arena for each player in battle. All arenas use the same seed.
- A fire button uses the held item.
- Battle gives 3 hit points.
- 1v1 is the first target. Battle rooms hold exactly 2 players.
- Items work like kart-racer items: one slot, random from a weighted table, and the player who is behind gets better items.
- The menu is the arena. Left and right select an entry. Space or Enter starts.
- The music comes from Neuron (`../neuron`). `music/build.py` rebuilds it into `public/audio/`.

## Phase 1 — base (done)

- `git init` on branch `main`, `CONTEXT.md`, this plan. The tool blocked the first commit and `git remote add origin` in this session, so Bill makes those two steps.
- `scripts/build-offline.mjs` builds `PLAY-OFFLINE.html` from `public/`.

## Phase 2 — base-game feel (done)

- Side contact blocks movement. Only a front hit costs a hit point.
- A pattern library with wall thickness and spacing. Rows spawn by distance, not by time.
- Arena spin with reversals and bursts, in the simulation.
- Speed steps every 10 s. Solo is endless; 60 s marks the run as cleared.
- Instant restart: no countdown in solo and local play.
- Death effect: a short freeze and a camera zoom.
- Beat pulse of the camera, from the music clock.

## Phase 3 — engine refactor (done)

- `state.arenas[]` and `player.arena`. Classic: one arena. Battle: one for each player.
- Deterministic events with a fixed tick. Tests prove that the same seed and inputs give the same result.

## Phase 4 — battle, local (done)

- Pickups, items, fire, incoming queue, warning, counter, hit points, invulnerability, graze meter, lock with QTE.
- Split screen for local battle.

### Items

| Item | Kind | Effect |
|---|---|---|
| SQUEEZE | attack | The next 6 rows of the target have one gap. |
| SURGE | attack | Target walls move 35% faster for 5 s. |
| SPIN | attack | Target spin reverses and speeds up for 5 s. |
| MIRROR | attack | Target controls are reversed for 4 s. |
| FOG | attack | The target sees only walls near the center for 5 s. |
| LOCK | attack | The target cannot move for 1.5 s, or until they press left and right 6 times. |
| BRICKS | attack | Three thick rows go into the target's arena. |
| SHIELD | boost | Absorbs the next front hit. |
| SLOW | boost | Your walls move 30% slower for 5 s. |
| CLEAR | boost (out) | Removes every wall in your arena near the center. |
| HEAL | boost | +1 hit point, to the maximum of 3. Only when you are behind. |

Attacks wait 1.2 s as incoming. Firing an attack while one is incoming to you is a counter.

## Phase 5 — battle, online (done)

- Room mode: classic or battle. Battle needs 2 players.
- `fire` message from the client. The server applies items in the simulation.
- The client predicts lock and mirror for its own triangle.

## Phase 6 — menu, music, and balance (done)

- Full-screen arena menu with entries: SOLO · NORMAL, SOLO · HARD, SOLO · HYPER, BATTLE · VS CPU, BATTLE · LOCAL 1V1, DUEL · LOCAL CLASSIC, ONLINE. (BATTLE · VS CPU was added so one person can practice battle.)
- The online entry shows a small panel for name and room code. The lobby shows players as triangles.
- Death and results show in the arena. Space restarts.
- Music: one track for each entry, a battle stem that fades in at danger, and sound effects. The synthesized beat stays as a fallback.
- Sudden death after 120 s in battle.

## Added to close the gap list (2026-11-03)

- **Shape changes.** An arena has 4, 5, or 6 sides. Hard cycles 6 → 5 → 6 → 4 every 25 s; HYPER cycles 6 → 5 → 4 → 5 → 6 → 4 every 15 s. A change waits for the end of a pattern and an empty field.
- **A third difficulty, HYPER**, in solo and in online rooms.

## Open

- Balance from human playtests. The numbers come from bot runs; tune `DIFFICULTY` in `public/engine.mjs`.
