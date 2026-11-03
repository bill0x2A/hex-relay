# HEX RELAY

**Stay in the gap. Then make your rival's gap smaller.**

An arcade survival game inspired by Super Hexagon, with a 1v1 battle mode. Rotate a triangle around a hexagon and dodge the walls that close in. In battle, take small risks to collect items, then fire them to make your rival's arena harder or your own easier. This is an original implementation with its own visuals and music; it includes no Super Hexagon assets, music, or source code.

## Run it

Install **Node.js 22 or newer** from [nodejs.org](https://nodejs.org/). Open the game in a current Chrome, Edge, Firefox, or Safari browser. The host needs Node; other players only need a browser.

There is **no install or build step**. No npm dependencies, engine, compiler, account, CDN, or asset download is required.

```sh
git clone https://github.com/bill0x2A/hex-relay.git
cd hex-relay
node server.mjs
```

Open **http://localhost:8080**. Keep the terminal open; press Ctrl+C to stop the server.

You can also use the launchers, which start the server and open your browser:

| Platform | Launcher |
| --- | --- |
| Windows | Double-click `start.cmd` |
| macOS | Double-click `start.command` (or run `sh start.command` in Terminal) |
| Linux | Run `./start.sh` (or `sh start.sh`) |

`npm start` is equivalent to `node server.mjs`; `npm install` is unnecessary. If macOS prevents opening a downloaded command file, run `sh start.command` in Terminal. If executable permissions were lost during extraction, use the `sh` commands above.

## Play

The menu is the arena. **← / →** choose a mode, **Space** or **Enter** starts, **Escape** goes back. On a touch screen, tap the sides to choose and the middle to start.

| Mode | Players | Controls |
| --- | --- | --- |
| Solo · Normal / Hard / Hyper | 1 | ← / → or A / D |
| Battle · vs CPU | 1 | ← / → or A / D, fire ↑ / W / Space |
| Battle · local 1v1 | 2, split screen | P1: A / D, fire W. P2: ← / →, fire ↑ |
| Duel · local classic | 2, one arena | P1: A / D. P2: ← / → |
| Online | 2–8 classic, 2 battle | ← / → or A / D, fire ↑ / W / Space |

Standard gamepads work: left stick or D-pad to turn, A (or D-pad up) to fire. Touch devices get left, right, and fire buttons.

- **Front hits and side contact.** A wall that reaches the triangle from outside is a hit. The side of a wall only stops the triangle.
- **Patterns.** Walls come in hand-written patterns (spirals, ladders, alternating gaps, zig-zags, tunnels), turned and mirrored at random. Spacing follows the wall speed, so every pattern always has a way through.
- **Solo** is endless. Speed steps up every 10 seconds, and 60 seconds marks the run as cleared. Bests are stored for each difficulty in your browser. A run starts at once; Space restarts immediately after a crash.
- **Spin.** The arena turns, reverses, and bursts. A slow tilt and a beat pulse follow the music.
- **Shapes.** On hard and hyper, the center changes between a hexagon, a pentagon, and a square. A change waits until the field is empty.
- **Difficulty.** Normal, hard, and hyper. Online hosts choose it in the lobby. `?autoplay` lets the bot fly solo runs as a demo.
- **P** pauses local play. Switching tabs also pauses it. Online rounds continue when your tab is hidden.
- **Sound** is off at first (M toggles it). The motion button stops the spin, tilt, pulse, and trails; reduced-motion OS preferences are respected by default.

## Battle

Battle is 1v1. Each player has an arena with the same seed, so both start with the same walls, and 3 hit points. After a hit, the triangle is invulnerable for a moment.

- **Pickups** glow in the gaps, usually in the gap that is not on the easy route. Pass through one to fill your item slot. Close calls (**grazes**) also fill a meter that gives an item.
- **Fire** uses the item. Attacks wait 1.2 s as **incoming** while the target sees a warning. Fire an attack of your own during the warning to **counter** it.
- The player who is behind gets better items more often.
- After 120 s, **sudden death**: the speed steps up every 5 s and the spacing tightens until someone falls.

| Item | Effect |
| --- | --- |
| SQUEEZE | The rival's next 6 rows have one gap |
| SURGE | The rival's walls move 35% faster for 5 s |
| SPIN | The rival's arena spins back, fast, for 5 s |
| MIRROR | The rival's controls are reversed for 4 s |
| FOG | The rival sees only the walls near the center for 5 s |
| LOCK | The rival cannot move for 1.5 s; pressing left and right in turn 6 times breaks it |
| BRICKS | Three heavy rows go into the rival's arena |
| SHIELD | Absorbs your next hit |
| SLOW | Your walls move 30% slower for 5 s |
| CLEAR | Removes the walls near your center: an escape from a bad spot |
| HEAL | +1 hit point (only when you are behind) |

## Multiplayer on your network

1. Run the server on one computer. It prints both a localhost address and your local network address, for example `http://192.168.1.50:8080`.
2. Other players on the **same network** open that network address in a browser. `localhost` always refers to the player's own computer.
3. Choose **Online → Create Room**. Share the five-character code or use **Copy Invite**.
4. Other players choose Online, enter the code, and join. The host starts with at least two players.

Allow Node through the host computer's firewall on your trusted network if asked. Wi-Fi client isolation or guest networks can prevent devices from reaching one another. Two browser tabs on the same computer are also sufficient to try networking.

Classic rooms support up to eight players. The host chooses classic or battle and the difficulty in the lobby; a battle room holds two players. Players can join between rounds. If a host leaves, ownership passes to another player. If only one connected player remains during a round, the round ends and they win. An empty room is removed. A disconnect requires rejoining; there is no session recovery. Room codes are convenient invites, not passwords.

Copying an invite may be unavailable on plain HTTP LAN addresses because some browsers restrict clipboard access. The game then displays the server address and code to share manually.

## Playing across the internet

Players need the **same reachable server**. This repository does not provision hosting or a public matchmaking service.

Run `node server.mjs` on a host that supports persistent Node processes and WebSockets. Expose the chosen TCP port or put an HTTPS reverse proxy in front of it; the browser automatically uses secure WebSockets on HTTPS. A reverse proxy must preserve the browser's `Host` header and forward WebSocket Upgrade headers. The server checks the WebSocket Origin against Host.

The server binds to `0.0.0.0:8080` by default. For localhost-only use or another port:

```sh
# Linux / macOS
HOST=127.0.0.1 PORT=9000 node server.mjs
```

```powershell
# Windows PowerShell
$env:HOST = "127.0.0.1"
$env:PORT = "9000"
node server.mjs
```

For home-hosted internet play, router port forwarding and an appropriate firewall rule are needed. Carrier-grade NAT can prevent this. A VPN shared by the players is another option. Public hosting should provide TLS and connection limits appropriate to its audience.

## Performance and architecture

- Plain Canvas 2D renderer driven by `requestAnimationFrame`, with no artificial frame-rate cap. It follows the display/browser refresh rate (including 120/144/165 Hz), subject to hardware, browser, and power settings.
- The same deterministic simulation runs at **120 Hz** locally and on the server. Network snapshots are sent at **30 Hz**; they leave out the random state and the future rows, and round numbers to four decimals. The server is authoritative for movement, collisions, round results, and wins.
- Local rendering interpolates between simulation steps. Local movement prediction makes your online triangle respond immediately. Corrections converge toward the server state; remote players and walls extrapolate briefly between snapshots. Poor latency can still cause corrections and apparent late collisions.
- Canvas resolution is capped at 2× device pixel ratio. Obstacles, trails, and simulation catch-up work are bounded. Background tabs stop drawing; online input expires if packets stop arriving.
- Default rendering avoids full-screen color flashes. Reduced motion is available, but the game still contains fast-moving high-contrast geometry.
- All files are served locally. There is no telemetry, database, external font, or production package dependency. Without the audio files, the game falls back to a synthesized beat. Rooms and wins are held in memory and reset when the server restarts.

The server includes a compact WebSocket implementation using Node built-ins. It handles masked/fragmented text frames, ping/pong, message size limits, rate limits, slow consumers, stale input, and origin checks. Static serving uses a strict asset allowlist. Maximum capacity is 64 rooms / 512 connected clients; these are protective limits, not a benchmark or concurrency guarantee.

```
public/engine.mjs   shared simulation: arenas, patterns, collisions, items, a bot
public/client.mjs   Canvas rendering, arena menu, input, audio, network prediction
public/index.html   interface
public/style.css    styles
public/audio/       music and sound effects (built by music/build.py)
server.mjs          static HTTP server, WebSocket transport, room authority
music/              music sources and the build script (uses ../neuron)
test/               built-in Node tests
scripts/            launcher, offline build, browser validation
CONTEXT.md          glossary of game terms
docs/PLAN.md        design decisions and phases
```

## Development and validation

```sh
npm run check
npm test
npm run build:offline   # rebuilds PLAY-OFFLINE.html from public/ (add -- --no-audio for a small file)
```

`PLAY-OFFLINE.html` is generated. Edit the files in `public/`, then rebuild it.

Tests use the built-in Node test runner, including real HTTP and WebSocket connections on loopback. They cover deterministic generation (classic and battle), collision geometry, side contact, hit points, shields, incoming attacks and counters, locks, pickups, a bot that proves every pattern has a way through, simultaneous crashes, countdowns, movement, end conditions, static serving, room lifecycle, input validation, host transfer, disconnect scoring, fragmented frames, and cross-origin rejection. A restricted sandbox must allow local network sockets for server tests.

An optional browser check is supplied in `scripts/browser-smoke.py`. It uses Python Playwright and an installed Chromium **only for development verification**; these are not game dependencies. See `VALIDATION.md` for the checks actually run and platform limits.

## License

MIT. Super Hexagon is the work of its respective creators; this project is an independent inspired game.
