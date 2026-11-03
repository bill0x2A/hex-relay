# Hex Relay — glossary

Use these terms in code, docs, and UI. One word for one meaning.

## World

- **Arena** — one field of walls around the center hexagon. It has its own walls, wall speed, spin, and random stream. Classic rounds have one shared arena. Battle rounds have one arena for each player.
- **Orbit** — the circle the triangles move on (`ORBIT`, radius 86).
- **Sector** — one of the angular slices of an arena (six for a hexagon). A wall covers a set of sectors (`mask`).
- **Shape** — the number of sides of an arena: 6, 5, or 4. A **shape change** happens only when the field is empty.
- **Wall** — one ring segment set that moves in toward the center. It has a `radius`, a `thickness`, and a `mask`.
- **Row** — one step of a pattern. A row makes one wall, or no wall (a pause).
- **Pattern** — a named, hand-written list of rows (spiral, ladder, alternating C, zig-zag, tunnel). The spawner turns and mirrors each pattern at random.
- **Spin** — the turn of the camera around the center. It belongs to the arena, so an attack can change it. Spin does not change collisions.
- **Speed step** — a jump in wall speed at a milestone (every 10 s).
- **Milestone** — a named survival time. Solo marks 60 s as **cleared**; the run continues.

## Player

- **Triangle** — the player marker on the orbit.
- **Front hit** — a wall reaches the triangle from outside. This costs one hit point.
- **Side contact** — the triangle moves into the side of a wall. The wall stops the movement. It costs nothing.
- **Hit point (HP)** — classic mode: 1. Battle mode: 3.
- **Invulnerable** — a short time after a hit when walls pass through the triangle.
- **Graze** — a wall passes the orbit very near the triangle and does not hit it. Grazes fill the **graze meter**. A full meter gives an item.

## Battle

- **Battle** — a 1v1 round mode (2 players). Each player has an arena with the same seed.
- **Pickup** — an item token that moves in with the walls, in a sector. The triangle collects it when the token reaches the orbit in the triangle's sector.
- **Item** — what a pickup gives. A player holds one item at a time (the **slot**).
- **Fire** — the button that uses the held item.
- **Attack** — an item that makes the opponent's arena harder for a short time.
- **Boost** — an item that helps your own arena or gives an **out** (an escape from a bad position).
- **Incoming** — an attack in the opponent's queue, before it takes effect. The opponent sees a **warning** during this time.
- **Counter** — when you fire an attack while an attack is incoming to you, it cancels the incoming attack instead.
- **Lock** — an attack that stops the triangle. The target breaks it early with a **quick-time event (QTE)**: press left and right in turn.
- **Sudden death** — after 120 s, speed steps come every 5 s.

## Game

- **Mode** — classic (solo, local duel, online room) or battle (local battle, online battle).
- **Entry** — one item of the menu selector (for example SOLO · HARD).
- **Difficulty** — normal, hard, or hyper.
- **Round** — one game from start to result. A **room** holds many rounds.
