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

## Difficulty pass (2026-11-04)

Bill cleared 180 s of HYPER on the first try. His best on the hardest level of the reference game is 46 s.

- **Faster walls now give less time.** Before, the row gap grew with the speed, so the time for each row never changed. Now the margin goes from `margin` to `marginEnd` over the speed steps.
- **No free rest between patterns.** A pause row kept the old route but reset the free sectors, so the next row got a worst-case gap. The pause also shrinks: NORMAL 30 px, HARD 10 px, HYPER 0.
- **Rows that force a turn.** `pairs` and `zigzag` had a sector that stayed open. New patterns: `whirl` (long one-wide spiral), `swing` (gap jumps to the far side), `hop` (gap moves two sectors), `rattle` (fast left and right).
- **Fair corners.** A wall reaches the orbit sooner at the middle of a side than at a corner. The gap now adds this distance, about 38 px on a square. The old slack hid this error.
- **Faster base speed and spin.** NORMAL 165, HARD 220, HYPER 290 px/s. Spin reversals and bursts come more often on harder levels.

| | speed | margin | slack | pause | spin |
|---|---|---|---|---|---|
| NORMAL | 165 | 1.45 → 1.22 | 0.06 s | 30 px | 0.6 |
| HARD | 220 | 1.2 → 1.06 | 0.04 s | 10 px | 1.0 |
| HYPER | 290 | 1.08 → 1.0 | 0.025 s | 0 | 1.5 |

## Chunky patterns, corkscrew, smooth shapes (2026-11-04)

- **Chunky patterns.** `slabs` (half the arena in one thick block, then the other half), `chunks` (big blocks of random depth; each covers the last gap), `corridor` (a thick bending corridor with a one-wide gap).
- **Corkscrew.** A solid spiral arm of chain rows, two or three full turns. Hold one direction: side contact against the arm sets the pace. It lasts about 4 to 5 s on HYPER.
- **5% harder.** Speed +5%, margin and slack −5%, spin +5%. HYPER ends at margin 1, because a lower margin makes rows impossible. So on HYPER the 5% comes from speed, spin, and the start margin.
- **Smooth shape changes.** `geometry(arena)` gives each sector a start angle and a width. In a morph, each sector edge moves from its old angle to its new angle in 0.6 s. A sector that goes away shrinks to zero width, and a new sector grows from zero width. 4 ↔ 6 moves two sectors on opposite sides. The morph runs after the last old row passes the orbit, and before the first new row arrives. The first new row gives a turn from any sector.

## Open

- Balance from human playtests. The numbers come from bot runs; tune `DIFFICULTY` in `public/engine.mjs`.
