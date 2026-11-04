// Shared deterministic simulation. Rendering never decides networked collisions.
export const TAU = Math.PI * 2;
export const SECTOR = TAU / 6;
export const ORBIT = 86;
export const TURN_SPEED = 4.8;
export const STEP = 1 / 120;
export const SPAWN_RADIUS = 720;
export const CLEAR_TIME = 60;
export const SUDDEN_DEATH = 120;
export const MAX_HP = 3;
export const INCOMING_DELAY = 1.2;
export const LOCK_PRESSES = 6;
export const COLORS = ['#d4ff57', '#bda1ff', '#5de5ef', '#ff947a', '#ff83bb', '#82ffa6', '#ffc65c', '#89aaff'];
export const ITEMS = {
  squeeze: { kind: 'attack', label: 'SQUEEZE' },
  surge: { kind: 'attack', label: 'SURGE' },
  spin: { kind: 'attack', label: 'SPIN' },
  mirror: { kind: 'attack', label: 'MIRROR' },
  fog: { kind: 'attack', label: 'FOG' },
  lock: { kind: 'attack', label: 'LOCK' },
  bricks: { kind: 'attack', label: 'BRICKS' },
  shield: { kind: 'boost', label: 'SHIELD' },
  slow: { kind: 'boost', label: 'SLOW' },
  clear: { kind: 'boost', label: 'CLEAR' },
  heal: { kind: 'boost', label: 'HEAL' },
};
// margin: time for a row as a multiple of the turn it needs (1 = exactly enough from the worst
// position). It goes from margin to marginEnd over the speed steps, so faster walls also give less time.
// slack: extra seconds for each row. pause: distance between patterns. flip: seconds between spin reversals.
const DIFFICULTY = {
  // A margin below 1 makes a row impossible from the worst position, so HYPER ends at 1.
  normal: { speed: 173, step: 0.06, margin: 1.38, marginEnd: 1.16, slack: 0.057, pause: 28, spin: 0.63, flip: [3, 6], burst: 0.3,
    pool: ['walk', 'walk', 'spiral', 'ladder', 'zigzag', 'pairs', 'alternate', 'single', 'slabs', 'chunks', 'corkscrew'] },
  hard: { speed: 231, step: 0.07, margin: 1.14, marginEnd: 1.01, slack: 0.038, pause: 9, spin: 1.05, flip: [2.5, 5], burst: 0.4,
    pool: ['single', 'spiral', 'ladder', 'zigzag', 'alternate', 'tunnel', 'whirl', 'swing', 'hop', 'walk',
      'slabs', 'chunks', 'corridor', 'corkscrew'],
    shapes: [6, 5, 6, 4], shapeEvery: 25 },
  hyper: { speed: 305, step: 0.07, margin: 1.03, marginEnd: 1.0, slack: 0.024, pause: 0, spin: 1.58, flip: [1.5, 3.5], burst: 0.5,
    pool: ['whirl', 'swing', 'single', 'tunnel', 'hop', 'alternate', 'ladder', 'rattle', 'corkscrew', 'corkscrew',
      'chunks', 'corridor', 'slabs', 'chunks'],
    shapes: [6, 5, 4, 5, 6, 4], shapeEvery: 15 },
};
export const DIFFICULTIES = Object.keys(DIFFICULTY);
const sectorSize = n => TAU / n;
const sectorTime = n => sectorSize(n) / TURN_SPEED;
const full = n => (1 << n) - 1;
// Distance from the center to the middle of a side, for a corner radius of 1.
export const apothem = (g = 6) => typeof g === 'number' ? Math.cos(Math.PI / g)
  : Math.min(...g.size.filter(x => x > 0).map(x => Math.cos(x / 2)));
export const MORPH_TIME = 0.6;
const EFFECT_TIME = { surge: 5, spin: 5, mirror: 4, fog: 5, lock: 1.5, slow: 5 };

export const wrap = a => ((a % TAU) + TAU) % TAU;
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Lane layout. A number n means n equal lanes. During a shape change, geometry() gives an object:
// { n, start, size }, where each lane edge moves from its old angle to its new angle. A lane that goes
// away shrinks to zero width; a new lane grows from zero width.
export function geometry(arena) {
  const m = arena.morph;
  if (!m) return arena.sides || 6;
  const n = Math.max(m.from, m.to), p = m.p * m.p * (3 - 2 * m.p);
  // Edge i of `count` equal lanes, with zero-width lanes at m.lanes when count < n.
  const edge = (count, i) => (count < n ? i - m.lanes.filter(z => z < i).length : i) * TAU / count;
  const b = [];
  for (let i = 0; i <= n; i++) b.push(edge(m.from, i) + (edge(m.to, i) - edge(m.from, i)) * p);
  return { n, start: b.slice(0, n), size: b.slice(1).map((x, i) => x - b[i]) };
}
export const laneCount = g => typeof g === 'number' ? g : g.n;
export const laneLayout = g => typeof g === 'number'
  ? { n: g, start: Array.from({ length: g }, (_, i) => i * TAU / g), size: Array(g).fill(TAU / g) } : g;
export const laneMid = (g, i) => typeof g === 'number' ? (i + 0.5) * TAU / g : g.start[i] + g.size[i] / 2;
export const laneApothem = (g, i) => typeof g === 'number' ? Math.cos(Math.PI / g) : Math.cos(g.size[i] / 2);
export function sectorOf(angle, g = 6) {
  if (typeof g === 'number') return Math.floor(wrap(angle) / sectorSize(g)) % g;
  const a = wrap(angle);
  for (let i = 0; i < g.n; i++) if (a < g.start[i] + g.size[i]) return i;
  return g.n - 1;
}
// Distance to the polygon edge at this angle, for a corner radius of 1.
export function hexFactor(angle, g = 6) {
  if (typeof g === 'number') {
    const size = sectorSize(g);
    return Math.cos(Math.PI / g) / Math.cos(wrap(angle) % size - size / 2);
  }
  const i = sectorOf(angle, g), half = g.size[i] / 2;
  return Math.cos(half) / Math.cos(wrap(angle) - g.start[i] - half);
}
// Put a lane into a mask at k (blocked when both neighbours are blocked), or take lane k out.
function insertBit(mask, k, n) {
  const low = mask & ((1 << k) - 1), high = (mask >> k) << (k + 1);
  const left = mask & (1 << ((k - 1 + n) % n)), right = mask & (1 << (k % n));
  return low | high | (left && right ? 1 << k : 0);
}
const removeBit = (mask, k) => (mask & ((1 << k) - 1)) | ((mask >> (k + 1)) << k);
// lanes: the zero-width lanes, ascending, as indexes in the larger layout.
function addLanes(mask, lanes, n) { for (const z of lanes) mask = insertBit(mask, z, n++); return mask; }
function dropLanes(mask, lanes) { for (const z of [...lanes].reverse()) mask = removeBit(mask, z); return mask; }
function addLaneIndex(i, lanes) { for (const z of lanes) if (i >= z) i++; return i; }
// The side count that new rows use: the target during a shape change.
const spawnSides = arena => arena.morph ? arena.morph.to : arena.sides;
function random(o, key = 'rng') {
  let x = o[key] | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  o[key] = x >>> 0;
  return o[key] / 4294967296;
}
const pick = (o, list, key) => list[Math.floor(random(o, key) * list.length)];
const gapMask = (n, ...gaps) => full(n) ^ gaps.reduce((m, g) => m | (1 << (((g % n) + n) % n)), 0);
const freeOf = (n, mask) => full(n) & ~mask;
function rotateMask(n, mask, by, mirror) {
  let out = 0;
  for (let i = 0; i < n; i++) if (mask & (1 << i)) out |= 1 << (((mirror ? n - i : i) + by) % n);
  return out;
}
// Sectors a triangle must cross to reach any free sector of the next row from the worst free
// sector of the last one. Sectors in `solid` are impassable on the way (a tunnel wall).
function movesBetween(n, fromFree, toFree, solid = 0) {
  let worst = 0;
  for (let a = 0; a < n; a++) {
    if (!(fromFree & (1 << a))) continue;
    let best = n;
    for (let b = 0; b < n; b++) {
      if (!(toFree & (1 << b))) continue;
      for (const dir of [1, -1]) {
        let steps = 0, s = a, ok = true;
        while (s !== b) { s = (s + dir + n) % n; steps++; if (solid & (1 << s) && s !== b) { ok = false; break; } }
        if (ok) best = Math.min(best, steps);
      }
    }
    worst = Math.max(worst, best === n ? Math.floor(n / 2) : best);
  }
  return worst;
}

// Pattern rows: { mask, thick, solid?, extra? }. extra is a second wall at the same radius.
const PATTERNS = {
  walk(o, n) {
    const rows = []; let g = Math.floor(random(o) * n); const dir = random(o) < 0.5 ? 1 : -1;
    for (let i = 0; i < 6; i++) { rows.push({ mask: gapMask(n, g, g + 1), thick: 28 }); g += dir * (random(o) < 0.8 ? 1 : 2); }
    return rows;
  },
  single(o, n) {
    const rows = []; let g = Math.floor(random(o) * n);
    for (let i = 0; i < 6; i++) { rows.push({ mask: gapMask(n, g), thick: 26 }); g += random(o) < 0.5 ? 1 : -1; }
    return rows;
  },
  spiral(o, n) {
    const rows = [], dir = random(o) < 0.5 ? 1 : -1, count = 8 + Math.floor(random(o) * 5);
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i * dir, i * dir + 1), thick: 16 });
    return rows;
  },
  ladder(o, n) {
    // Alternate sectors only work on an even number of sides.
    if (n % 2) return PATTERNS.zigzag(o, n);
    const rows = [], count = 5 + Math.floor(random(o) * 4);
    let even = 0;
    for (let i = 0; i < n; i += 2) even |= 1 << i;
    for (let i = 0; i < count; i++) rows.push({ mask: i % 2 ? even << 1 : even, thick: 22 });
    return rows;
  },
  zigzag(o, n) {
    const rows = [], count = 6 + Math.floor(random(o) * 3);
    // Two-wide gaps two sectors apart: no sector stays open from one row to the next.
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, 2 * (i % 2), 2 * (i % 2) + 1), thick: 24 });
    return rows;
  },
  pairs(o, n) {
    const h = Math.floor(n / 2);
    return [0, 1, 0, 1, 0].map(g => ({ mask: gapMask(n, g, g + h), thick: 30 }));
  },
  // A long one-wide spiral of thin walls: the triangle turns without a stop.
  whirl(o, n) {
    const rows = [], dir = random(o) < 0.5 ? 1 : -1, count = 10 + Math.floor(random(o) * 7);
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i * dir), thick: 14 });
    return rows;
  },
  // One gap that jumps to the far side on each row.
  swing(o, n) {
    const rows = [], h = Math.floor(n / 2), count = 4 + Math.floor(random(o) * 3);
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i % 2 ? h : 0), thick: 20 });
    return rows;
  },
  // One gap that moves two sectors on each row, sometimes back.
  hop(o, n) {
    const rows = []; let g = 0, dir = random(o) < 0.5 ? 1 : -1;
    for (let i = 0; i < 6; i++) { rows.push({ mask: gapMask(n, g), thick: 18 }); if (random(o) < 0.25) dir = -dir; g += 2 * dir; }
    return rows;
  },
  // Chunky patterns: big blocks instead of lines.
  // Half the arena in one thick slab, then the other half.
  slabs(o, n) {
    const rows = [], h = Math.floor(n / 2), count = 3 + Math.floor(random(o) * 2);
    let half = 0;
    for (let i = 0; i < h; i++) half |= 1 << i;
    for (let i = 0; i < count; i++) rows.push({ mask: i % 2 ? rotateMask(n, half, h) : half, thick: 90 + Math.floor(random(o) * 50) });
    return rows;
  },
  // Big blocks of random depth. Each block covers the last gap, so every row needs a turn.
  chunks(o, n) {
    const rows = [], open = n >= 6 && random(o) < 0.5 ? 3 : 2;
    let block = 0, at = 0;
    for (let k = 0; k < n - open; k++) block |= 1 << k;
    for (let i = 0; i < 5; i++) {
      rows.push({ mask: rotateMask(n, block, at), thick: 50 + Math.floor(random(o) * 90) });
      at += open + Math.floor(random(o) * (n - 2 * open + 1));
    }
    return rows;
  },
  // A thick corridor with a one-wide gap that bends one sector at a time.
  corridor(o, n) {
    const rows = [], dir = random(o) < 0.5 ? 1 : -1; let g = 0;
    for (let i = 0; i < 4; i++) { rows.push({ mask: gapMask(n, g), thick: 110 }); g += random(o) < 0.7 ? dir : -dir; }
    return rows;
  },
  // A solid spiral arm: turn the same way, without a stop, for two or three full turns.
  // chain rows touch; the triangle makes each turn while the row before it passes.
  corkscrew(o, n) {
    const rows = [], dir = random(o) < 0.5 ? 1 : -1, count = n * 2 + Math.floor(random(o) * (n + 1));
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i * dir, i * dir + dir), thick: 0, chain: 1 });
    return rows;
  },
  // One gap that steps left and right between two sectors, fast.
  rattle(o, n) {
    const rows = [], count = 6 + Math.floor(random(o) * 4);
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i % 2), thick: 12 });
    return rows;
  },
  alternate(o, n) {
    const rows = [], count = 4 + Math.floor(random(o) * 3), h = Math.floor(n / 2);
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i % 2 ? h : 0, i % 2 ? h + 1 : 1), thick: 34 });
    return rows;
  },
  tunnel(o, n) {
    const count = 4 + Math.floor(random(o) * 2), rows = [];
    for (let i = 0; i < count; i++) rows.push({ mask: gapMask(n, i % 2 ? n - 1 : 1), thick: 22, solid: 1 });
    rows[0].extra = { mask: 1, thick: 0 };
    return rows;
  },
};

function createArena(seed, difficulty, index = 0) {
  return {
    rng: seed, itemRng: (Math.imul(seed ^ 0x9e3779b9, index * 2 + 1) ^ (index * 0x85ebca6b)) >>> 0 || 7, difficulty,
    walls: [], pickups: [], queue: [], wallId: 0, rows: 0, nextPickup: 7,
    tailRadius: SPAWN_RADIUS - 360, tailFree: 63, solid: 0, chain: 0, sides: 6, morph: null, shapeIndex: 0,
    nextShape: DIFFICULTY[difficulty].shapes ? DIFFICULTY[difficulty].shapeEvery : Infinity,
    rotation: 0, spin: DIFFICULTY[difficulty].spin, spinTimer: 4, burstUntil: -1,
    speed: DIFFICULTY[difficulty].speed, surgeUntil: -1, slowUntil: -1, spinUntil: -1, fogUntil: -1, squeeze: 0,
  };
}
export function createRound(players, seed = 1, difficulty = 'normal', countdown = 3, mode = 'classic') {
  seed = seed >>> 0 || 1;
  difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
  const battle = mode === 'battle';
  const arenas = battle ? players.map((_, i) => createArena(seed, difficulty, i)) : [createArena(seed, difficulty)];
  return {
    seed, difficulty, mode: battle ? 'battle' : 'classic',
    t: -countdown, phase: countdown ? 'countdown' : 'playing', arenas,
    players: players.map((p, i) => ({
      id: p.id, name: p.name, color: p.color || COLORS[i % 8], arena: battle ? i : 0,
      angle: Math.PI / 2, alive: true, hp: battle ? MAX_HP : 1, invulnUntil: -1, shield: false,
      item: null, graze: 0, incoming: [], mirrorUntil: -1, lockUntil: -1, lockCount: 0, lockLast: 0, lastDir: 0,
      survived: 0, disconnected: false, cleared: false,
    })),
    events: [], eventSeq: 0, winners: [], reason: '', finishedAt: null,
  };
}
function emit(s, type, data = {}) {
  s.events.push({ seq: ++s.eventSeq, t: Math.max(0, s.t), type, ...data });
  if (s.events.length > 24) s.events.shift();
}
export function speedSteps(s) {
  const t = Math.max(0, s.t);
  let steps = Math.min(Math.floor(t / 10), 10);
  if (s.players.length > 1 && t >= SUDDEN_DEATH) steps += Math.floor((t - SUDDEN_DEATH) / 5) + 1;
  return steps;
}
export function arenaSpeed(s, arena) {
  const plan = DIFFICULTY[arena.difficulty];
  let speed = plan.speed * (1 + plan.step * speedSteps(s));
  if (arena.surgeUntil > s.t) speed *= 1.35;
  if (arena.slowUntil > s.t) speed *= 0.7;
  return speed;
}
// After sudden death the spacing shrinks below what a perfect player needs, so rounds end.
function margin(s, arena) {
  const plan = DIFFICULTY[arena.difficulty];
  const base = plan.margin + (plan.marginEnd - plan.margin) * Math.min(1, speedSteps(s) / 10);
  if (s.players.length < 2 || s.t < SUDDEN_DEATH) return base;
  return Math.max(0.55, base - (s.t - SUDDEN_DEATH) * 0.025);
}
function nextRow(arena) {
  const n = spawnSides(arena);
  if (!arena.queue.length) {
    const name = pick(arena, DIFFICULTY[arena.difficulty].pool);
    const by = Math.floor(random(arena) * n), mirror = random(arena) < 0.5;
    arena.pattern = name;
    for (const row of PATTERNS[name](arena, n)) {
      const out = { ...row, mask: rotateMask(n, row.mask, by, mirror) };
      if (row.solid) out.solid = rotateMask(n, row.solid, by, mirror);
      if (row.extra) out.extra = { ...row.extra, mask: rotateMask(n, row.extra.mask, by, mirror) };
      arena.queue.push(out);
    }
    arena.queue.push({ mask: 0, thick: 0, pause: DIFFICULTY[arena.difficulty].pause });
  }
  return arena.queue.shift();
}
// A shape change starts at the end of a pattern. The lanes change while no wall is at the orbit: after
// the last old row passes and before the first new row arrives. No wall is taken away.
function updateShape(s, arena) {
  const plan = DIFFICULTY[arena.difficulty];
  if (arena.morph || s.t < arena.nextShape || arena.queue.some(r => r.mask)) return;
  arena.shapeIndex = (arena.shapeIndex + 1) % plan.shapes.length;
  const from = arena.sides, to = plan.shapes[arena.shapeIndex];
  if (to === from) { arena.nextShape = s.t + plan.shapeEvery; return; }
  // The lanes that grow or go away, on opposite sides when there are two.
  const big = Math.max(from, to), first = Math.floor(random(arena) * big), lanes = [first];
  if (Math.abs(to - from) > 1) lanes.push((first + Math.floor(big / 2)) % big);
  lanes.sort((a, b) => a - b);
  // New lanes go in now with zero width, so nothing moves yet.
  if (to > from) { for (const w of arena.walls) w.mask = addLanes(w.mask, lanes, from); arena.sides = to; }
  const len = MORPH_TIME * arena.speed;
  arena.morph = { lanes, from, to, p: 0, marker: arena.tailRadius, len };
  arena.nextShape = s.t + plan.shapeEvery;
  arena.pickups = []; arena.queue = []; arena.solid = 0; arena.chain = 0;
  // The first new row may need a turn from anywhere, so the spawner counts every lane as a start.
  arena.tailFree = full(to); arena.tailRadius += len;
}
function stepMorph(s, arena, speed, dt) {
  const m = arena.morph;
  m.marker -= speed * dt;
  m.p = Math.min(1, Math.max(0, (ORBIT - 5 - m.marker) / m.len));
  if (m.p < 1) return;
  if (m.to < m.from) {
    for (const w of arena.walls) w.mask = dropLanes(w.mask, m.lanes);
    arena.pickups = arena.pickups.filter(k => !m.lanes.includes(k.sector))
      .map(k => ({ ...k, sector: k.sector - m.lanes.filter(z => z < k.sector).length }));
    arena.sides = m.to;
  }
  arena.morph = null;
  emit(s, 'shape', { arena: s.arenas.indexOf(arena), sides: arena.sides });
}
function spawnRows(s, arena, speed) {
  const battle = s.mode === 'battle';
  if (arena.nextShape !== Infinity) updateShape(s, arena);
  while (arena.tailRadius < SPAWN_RADIUS) {
    // Read the side count for each row: a shape change can start inside this loop.
    const n = spawnSides(arena), row = nextRow(arena);
    // While a lane goes away, new rows still need a bit for it until it has zero width.
    const shrinking = arena.morph && arena.morph.to < arena.morph.from;
    const fit = shrinking ? m => addLanes(m, arena.morph.lanes, n) : m => m;
    if (!row.mask) {
      // A pause keeps tailFree: the triangle is still in a gap of the last row.
      arena.tailRadius += row.pause || 0; arena.solid = 0; arena.chain = 0;
      if (arena.nextShape !== Infinity && s.t >= arena.nextShape) updateShape(s, arena);
      continue;
    }
    let mask = row.mask, chain = row.chain;
    if (arena.squeeze > 0) {
      chain = 0;
      const free = freeOf(n, mask); let keep = 0;
      for (let i = 0; i < n; i++) if (free & (1 << i)) { keep = i; break; }
      mask = gapMask(n, keep); arena.squeeze--;
    }
    const free = freeOf(n, mask);
    const moves = movesBetween(n, arena.tailFree, free, row.solid || 0);
    // A wall reaches the orbit sooner at the middle of a side than at a corner, where the turn crosses:
    // on a square that costs about 38 px, on a hexagon about 14 px.
    const slack = DIFFICULTY[arena.difficulty].slack, edge = 14 + (ORBIT + 5) * (1 / apothem(n) - 1);
    const turn = (sectorTime(n) * margin(s, arena) + slack) * speed;
    // In a chain the turn into this row happens while the last row passes: its gap is free in both.
    // A chain turn crosses only the corner it leaves by, so it needs no corner distance.
    const gap = chain && arena.chain && moves <= 1 ? 14 : edge + (moves * sectorTime(n) * margin(s, arena) + slack) * speed;
    const radius = arena.tailRadius + gap, thick = chain ? turn : row.thick;
    arena.walls.push({ id: arena.wallId++, radius, thickness: thick, mask: fit(mask), grazed: false });
    if (row.extra) {
      // A tunnel wall covers the whole pattern, from its first row to its last.
      let length = 0, last = gap, tf = free;
      for (const next of arena.queue) {
        if (!next.mask) break;
        const nf = freeOf(n, next.mask);
        last = edge + (movesBetween(n, tf, nf, next.solid || 0) * sectorTime(n) * margin(s, arena) + slack) * speed;
        length += row.thick + last; tf = nf;
      }
      arena.walls.push({ id: arena.wallId++, radius, thickness: length + row.thick, mask: fit(row.extra.mask), grazed: true });
    }
    const routeFree = arena.tailFree;
    arena.tailRadius = radius + thick; arena.tailFree = free; arena.chain = chain ? 1 : 0; arena.rows++;
    if (battle && --arena.nextPickup <= 0 && moves > 0) {
      arena.nextPickup = 6 + Math.floor(random(arena, 'itemRng') * 6);
      // The risky choice: the open sector farthest from the easy route.
      let best = -1, sector = 0;
      for (let i = 0; i < n; i++) {
        if (!(free & (1 << i))) continue;
        const d = movesBetween(n, routeFree, 1 << i);
        if (d > best || (d === best && random(arena, 'itemRng') < 0.5)) { best = d; sector = i; }
      }
      arena.pickups.push({ id: arena.wallId++, radius: radius - 10, sector: shrinking ? addLaneIndex(sector, arena.morph.lanes) : sector });
    }
  }
}
export function collides(angle, wall, g = 6) {
  for (const offset of [-0.045, 0, 0.045]) {
    const a = wrap(angle + offset);
    if (!(wall.mask & (1 << sectorOf(a, g)))) continue;
    const factor = hexFactor(a, g);
    if (wall.radius * factor <= ORBIT + 5 && (wall.radius + wall.thickness) * factor >= ORBIT - 5) return true;
  }
  return false;
}
export function finishRound(s, reason = 'survivor') {
  if (s.phase === 'finished') return;
  s.phase = 'finished'; s.finishedAt = Math.max(0, s.t); s.reason = reason;
  const eligible = s.players.filter(p => !p.disconnected);
  const alive = eligible.filter(p => p.alive);
  if (alive.length) s.winners = alive.map(p => p.id);
  else if (eligible.length) {
    const best = Math.max(...eligible.map(p => p.survived));
    s.winners = eligible.filter(p => Math.abs(p.survived - best) < STEP / 2).map(p => p.id);
  }
}
function opponentOf(s, p) {
  const others = s.players.filter(o => o !== p && o.alive);
  if (!others.length) return null;
  return others.reduce((a, b) => (b.hp > a.hp ? b : a));
}
function rollItem(s, p) {
  const arena = s.arenas[p.arena], rival = opponentOf(s, p);
  const behind = rival && rival.hp > p.hp;
  const table = [['squeeze', 3], ['surge', 3], ['spin', 3], ['mirror', 2], ['fog', 3], ['lock', 2], ['bricks', 3],
    ['shield', 3], ['slow', 2], ['clear', behind ? 3 : 1], ['heal', behind && p.hp < MAX_HP ? 3 : 0]];
  let roll = random(arena, 'itemRng') * table.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, weight] of table) { roll -= weight; if (roll < 0) return name; }
  return 'shield';
}
function giveItem(s, p) {
  if (p.item) return;
  p.item = rollItem(s, p); emit(s, 'pickup', { id: p.id, item: p.item });
}
function applyAttack(s, target, item, from) {
  const arena = s.arenas[target.arena], until = s.t + (EFFECT_TIME[item] || 0);
  if (item === 'squeeze') arena.squeeze = 6;
  if (item === 'surge') arena.surgeUntil = until;
  if (item === 'spin') arena.spinUntil = until;
  if (item === 'fog') arena.fogUntil = until;
  if (item === 'mirror') target.mirrorUntil = until;
  if (item === 'lock') { target.lockUntil = until; target.lockCount = 0; target.lockLast = 0; }
  if (item === 'bricks') {
    const n = spawnSides(arena), g = Math.floor(random(arena, 'itemRng') * n);
    arena.queue.unshift(...[g, g + 2, g + 4].map(gap => ({ mask: gapMask(n, gap), thick: 44 })));
  }
  emit(s, 'attack', { id: target.id, from, item });
}
function fire(s, p) {
  const item = p.item;
  if (!item || !p.alive) return;
  p.item = null;
  if (ITEMS[item].kind === 'boost') {
    const arena = s.arenas[p.arena];
    if (item === 'shield') p.shield = true;
    if (item === 'slow') arena.slowUntil = s.t + EFFECT_TIME.slow;
    if (item === 'heal') p.hp = Math.min(MAX_HP, p.hp + 1);
    if (item === 'clear') {
      arena.walls = arena.walls.filter(w => w.radius > 420);
      arena.tailRadius = Math.max(arena.tailRadius, 420); arena.tailFree = full(spawnSides(arena));
    }
    emit(s, 'boost', { id: p.id, item });
    return;
  }
  if (p.incoming.length) {
    const cancelled = p.incoming.shift();
    emit(s, 'counter', { id: p.id, item: cancelled.item, with: item });
    return;
  }
  const target = opponentOf(s, p);
  if (!target) return;
  target.incoming.push({ item, at: s.t + INCOMING_DELAY, from: p.id });
  emit(s, 'fire', { id: p.id, target: target.id, item });
}
function hit(s, p) {
  if (p.invulnUntil > s.t) return;
  if (p.shield) { p.shield = false; p.invulnUntil = s.t + 0.6; emit(s, 'shield', { id: p.id }); return; }
  p.hp--;
  if (p.hp <= 0) { p.alive = false; emit(s, 'death', { id: p.id }); return; }
  p.invulnUntil = s.t + 1.2; emit(s, 'hit', { id: p.id, hp: p.hp });
}
function inputOf(raw) {
  if (raw && typeof raw === 'object') return { dir: raw.dir === -1 ? -1 : raw.dir === 1 ? 1 : 0, fire: !!raw.fire };
  return { dir: raw === -1 ? -1 : raw === 1 ? 1 : 0, fire: false };
}
function stepArena(s, arena, dt) {
  const speed = arena.speed = arenaSpeed(s, arena);
  // Spin: steady turn with reversals and short bursts; a SPIN attack flips and speeds it.
  arena.spinTimer -= dt;
  if (arena.spinTimer <= 0) {
    const { flip, burst } = DIFFICULTY[arena.difficulty];
    arena.spin = -arena.spin; arena.spinTimer = flip[0] + random(arena) * (flip[1] - flip[0]);
    if (random(arena) < burst) arena.burstUntil = s.t + 0.8;
  }
  let spin = arena.spin * (1 + speedSteps(s) * 0.06);
  if (arena.burstUntil > s.t) spin *= 2.4;
  if (arena.spinUntil > s.t) spin *= -2.6;
  arena.rotation = wrap(arena.rotation + spin * dt);
  arena.tailRadius -= speed * dt;
  for (const w of arena.walls) w.radius -= speed * dt;
  for (const k of arena.pickups) k.radius -= speed * dt;
  arena.walls = arena.walls.filter(w => w.radius + w.thickness > 20);
  if (arena.morph) stepMorph(s, arena, speed, dt);
  spawnRows(s, arena, speed);
}
export function stepRound(s, inputs = {}, dt = STEP) {
  if (s.phase === 'finished') return;
  s.t += dt;
  if (s.t < 0) return;
  if (s.phase !== 'playing') { s.phase = 'playing'; emit(s, 'start'); }
  for (const arena of s.arenas) stepArena(s, arena, dt);
  const battle = s.mode === 'battle';
  for (const p of s.players) {
    if (!p.alive) continue;
    const arena = s.arenas[p.arena], input = inputOf(inputs[p.id]), n = geometry(arena);
    let dir = input.dir;
    if (battle) {
      if (input.fire) fire(s, p);
      while (p.incoming.length && p.incoming[0].at <= s.t) { const a = p.incoming.shift(); applyAttack(s, p, a.item, a.from); }
      if (p.mirrorUntil > s.t) dir = -dir;
      if (p.lockUntil > s.t) {
        if (dir && dir !== p.lockLast && dir !== p.lastDir) {
          p.lockLast = dir;
          if (++p.lockCount >= LOCK_PRESSES) { p.lockUntil = s.t; emit(s, 'unlock', { id: p.id }); }
        }
        p.lastDir = dir; dir = 0;
      } else p.lastDir = dir;
    }
    const ghost = p.invulnUntil > s.t;
    // Front hit: a wall reached the triangle where it already is.
    if (!ghost && arena.walls.some(w => collides(p.angle, w, n))) hit(s, p);
    if (!p.alive) { p.survived = Math.max(0, s.t); continue; }
    if (dir) {
      const next = wrap(p.angle + dir * TURN_SPEED * dt);
      // Side contact: a wall beside the triangle stops the turn and costs nothing.
      if (ghost || !arena.walls.some(w => collides(next, w, n))) p.angle = next;
    }
    if (battle) {
      const sector = sectorOf(p.angle, n);
      for (const k of arena.pickups) {
        const ap = laneApothem(n, k.sector);
        if (!k.taken && k.radius * ap <= ORBIT + 4 && k.radius * ap > ORBIT - 16 && k.sector === sector) { k.taken = true; giveItem(s, p); }
      }
      for (const w of arena.walls) {
        if (w.grazed || (w.radius + w.thickness) * hexFactor(p.angle, n) > ORBIT - 5) continue;
        w.grazed = true;
        const left = wrap(p.angle - 0.16), right = wrap(p.angle + 0.16);
        if (!(w.mask & (1 << sector)) && (w.mask & (1 << sectorOf(left, n)) || w.mask & (1 << sectorOf(right, n)))) {
          p.graze = Math.min(1, p.graze + 0.14); emit(s, 'graze', { id: p.id });
          if (p.graze >= 1 && !p.item) { p.graze = 0; giveItem(s, p); }
        }
      }
    }
    p.survived = Math.max(0, s.t);
    if (!p.cleared && s.t >= CLEAR_TIME) { p.cleared = true; emit(s, 'cleared', { id: p.id }); }
  }
  for (const arena of s.arenas) arena.pickups = arena.pickups.filter(k => !k.taken && k.radius * apothem(geometry(arena)) > ORBIT - 16);
  const alive = s.players.filter(p => p.alive).length;
  if (!alive || (s.players.length > 1 && alive <= 1)) finishRound(s);
}

// A simple bot: it steers to the nearest open sector of the next wall and fires items.
export function botInput(s, p, skill = 1) {
  const arena = s.arenas[p.arena], g = geometry(arena), n = laneCount(g), ap = apothem(g), here = sectorOf(p.angle, g);
  const atOrbit = arena.walls.filter(w => w.radius * ap <= ORBIT + 8 && (w.radius + w.thickness) >= ORBIT - 5);
  const blocked = atOrbit.reduce((m, w) => m | w.mask, 0);
  const reach = ORBIT + 90 + 520 * skill;
  const next = arena.walls.filter(w => w.radius * ap > ORBIT + 8 && w.radius < reach).sort((a, b) => a.radius - b.radius);
  let target = here, way = 0;
  if (next.length) {
    const near = next[0];
    const covering = next.filter(w => w.radius <= near.radius + 1).reduce((m, w) => m | w.mask, 0);
    // A lane that is still growing or going away is too narrow to stand in.
    let narrow = 0;
    if (typeof g !== 'number') g.size.forEach((x, i) => { if (x < 0.35) narrow |= 1 << i; });
    const free = full(n) & ~covering & ~narrow;
    let best = 99;
    for (let b = 0; b < n; b++) {
      if (!(free & (1 << b))) continue;
      for (const dir of [1, -1]) {
        // Measure the way by angle: a narrow lane is a short step.
        let s2 = here, steps = 0, ok = true;
        while (s2 !== b) {
          s2 = (s2 + dir + n) % n; steps += typeof g === 'number' ? 1 : g.size[s2] * n / TAU;
          if (blocked & (1 << s2)) { ok = false; break; }
        }
        if (ok && steps < best) { best = steps; target = b; way = steps ? dir : 0; }
      }
    }
  }
  const goal = laneMid(g, target), delta = angleDelta(goal, p.angle);
  let dir = way || (Math.abs(delta) < 0.12 * skill ? 0 : delta > 0 ? 1 : -1);
  if (p.lockUntil > s.t) dir = Math.floor(s.t * (6 + 14 * skill)) % 2 ? 1 : -1;
  else if (p.mirrorUntil > s.t) dir = -dir;
  const fireNow = !!p.item && (p.incoming.length > 0 || Math.floor(s.t * 3) % 5 === 0);
  return { dir, fire: fireNow };
}
