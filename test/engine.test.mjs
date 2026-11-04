import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, stepRound, collides, finishRound, botInput, ORBIT, STEP, SECTOR, TAU, MAX_HP, hexFactor, sectorOf, geometry } from '../public/engine.mjs';

const players = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
function steps(s, count, inputs = {}) { for (let i = 0; i < count; i++) stepRound(s, inputs); return s; }
function runBots(s, seconds, skill = 1) {
  for (let i = 0; i < seconds / STEP && s.phase !== 'finished'; i++) {
    const inputs = {};
    for (const p of s.players) inputs[p.id] = botInput(s, p, skill);
    stepRound(s, inputs);
  }
  return s;
}

test('a seed and input stream produce identical outcomes', () => {
  const a = createRound(players, 938812), b = createRound(players, 938812);
  for (let tick = 0; tick < 12000; tick++) {
    const inputs = { a: Math.floor(tick / 83) % 3 - 1, b: Math.floor(tick / 197) % 3 - 1 };
    stepRound(a, inputs); stepRound(b, inputs);
  }
  assert.deepEqual(a, b); assert.equal(a.phase, 'finished');
});
test('battle rounds with items are deterministic', () => {
  const a = createRound(players, 77, 'normal', 0, 'battle'), b = createRound(players, 77, 'normal', 0, 'battle');
  runBots(a, 80); runBots(b, 80);
  assert.deepEqual(a, b);
  assert.ok(a.events.length > 0);
});
test('battle arenas share a seed and start with the same walls', () => {
  const s = createRound(players, 12, 'normal', 0, 'battle');
  steps(s, 240);
  assert.equal(s.arenas.length, 2);
  assert.deepEqual(s.arenas[0].walls, s.arenas[1].walls);
  assert.equal(s.players[0].arena, 0); assert.equal(s.players[1].arena, 1); assert.equal(s.players[0].hp, MAX_HP);
});
test('countdown does not move players or generate walls', () => {
  const s = createRound(players); const angle = s.players[0].angle;
  steps(s, 240, { a: 1 });
  assert.equal(s.phase, 'countdown'); assert.equal(s.players[0].angle, angle); assert.equal(s.arenas[0].walls.length, 0);
  steps(s, 130, { a: 1 }); assert.equal(s.phase, 'playing'); assert.notEqual(s.players[0].angle, angle);
});
test('movement is bounded and equal at 60 and 120 Hz', () => {
  const a = createRound([players[0]], 4, 'normal', 0), b = createRound([players[0]], 4, 'normal', 0);
  steps(a, 30, { a: -1 });
  for (let i = 0; i < 15; i++) stepRound(b, { a: -1 }, 1 / 60);
  assert.ok(a.players[0].angle >= 0 && a.players[0].angle < TAU);
  assert.ok(Math.abs(a.players[0].angle - b.players[0].angle) < 1e-10);
});
test('hex geometry collides with walls but permits sector openings', () => {
  const angle = SECTOR * 0.5;
  const w = { radius: ORBIT / hexFactor(angle) - 2, thickness: 20, mask: 63 };
  assert.equal(collides(angle, w), true);
  w.mask ^= 1;
  assert.equal(collides(angle, w), false);
  assert.equal(collides(angle + SECTOR, w), true);
  w.radius = 300; assert.equal(collides(angle, w), false);
  w.radius = 20; assert.equal(collides(angle, w), false);
});
test('triangle width cannot clip through a wall at a sector edge', () => {
  const w = { radius: 83, thickness: 25, mask: 1 };
  assert.equal(collides(SECTOR + 0.02, w), true);
  assert.equal(collides(SECTOR + 0.1, w), false);
});
test('side contact stops the turn and costs nothing', () => {
  const s = createRound([players[0]], 3, 'normal', 0);
  const arena = s.arenas[0];
  arena.tailRadius = 99999; arena.walls = [{ id: 1, radius: 80, thickness: 200, mask: 1 << 2, grazed: true }];
  s.players[0].angle = 2 * SECTOR - 0.1;
  steps(s, 30, { a: 1 });
  assert.equal(s.players[0].alive, true);
  assert.ok(s.players[0].angle < 2 * SECTOR, 'the triangle stays out of the walled sector');
  assert.equal(sectorOf(s.players[0].angle), 1);
});
test('a front hit in battle costs one hit point and gives a short invulnerability', () => {
  const s = createRound(players, 3, 'normal', 0, 'battle');
  const arena = s.arenas[0], p = s.players[0];
  arena.tailRadius = 99999; arena.walls = [{ id: 1, radius: 95, thickness: 30, mask: 63, grazed: true }];
  s.arenas[1].tailRadius = 99999;
  steps(s, 120);
  assert.equal(p.alive, true); assert.equal(p.hp, MAX_HP - 1);
  assert.ok(s.events.some(e => e.type === 'hit' && e.id === 'a'));
});
test('a shield absorbs a front hit', () => {
  const s = createRound(players, 3, 'normal', 0, 'battle');
  const p = s.players[0]; p.item = 'shield';
  s.arenas[0].tailRadius = 99999; s.arenas[1].tailRadius = 99999;
  stepRound(s, { a: { dir: 0, fire: true } });
  assert.equal(p.shield, true);
  s.arenas[0].walls = [{ id: 1, radius: 95, thickness: 30, mask: 63, grazed: true }];
  steps(s, 120);
  assert.equal(p.hp, MAX_HP); assert.equal(p.shield, false);
});
test('an attack waits as incoming, and firing an attack back counters it', () => {
  const s = createRound(players, 3, 'normal', 0, 'battle');
  for (const a of s.arenas) a.tailRadius = 99999;
  const [a, b] = s.players; a.item = 'lock'; b.item = 'fog';
  stepRound(s, { a: { dir: 0, fire: true } });
  assert.equal(b.incoming.length, 1); assert.equal(b.lockUntil, -1);
  stepRound(s, { b: { dir: 0, fire: true } });
  assert.equal(b.incoming.length, 0); assert.equal(b.item, null);
  assert.ok(s.events.some(e => e.type === 'counter'));
  steps(s, 200); assert.equal(b.lockUntil, -1);
});
test('a lock stops the triangle until the target presses left and right in turn', () => {
  const s = createRound(players, 3, 'normal', 0, 'battle');
  for (const a of s.arenas) a.tailRadius = 99999;
  const [a, b] = s.players; a.item = 'lock';
  stepRound(s, { a: { dir: 0, fire: true } });
  steps(s, Math.ceil(1.25 / STEP));
  assert.ok(b.lockUntil > s.t);
  const angle = b.angle;
  steps(s, 10, { b: 1 }); assert.equal(b.angle, angle);
  for (let i = 0; i < 6; i++) { steps(s, 2, { b: i % 2 ? 1 : -1 }); steps(s, 1, { b: 0 }); }
  assert.ok(b.lockUntil <= s.t);
  steps(s, 10, { b: 1 }); assert.notEqual(b.angle, angle);
});
test('pickups give an item when the triangle reaches them', () => {
  const s = createRound(players, 3, 'normal', 0, 'battle');
  for (const a of s.arenas) { a.tailRadius = 99999; a.walls = []; }
  const p = s.players[0];
  s.arenas[0].pickups = [{ id: 9, radius: ORBIT + 20, sector: sectorOf(p.angle) }];
  steps(s, 30);
  assert.ok(p.item); assert.ok(s.events.some(e => e.type === 'pickup'));
});
test('simultaneous crashes produce a draw; finished rounds are immutable', () => {
  const s = createRound(players, 1, 'normal', 0); steps(s, 3000);
  assert.equal(s.phase, 'finished'); assert.deepEqual(s.winners, ['a', 'b']);
  const before = structuredClone(s); steps(s, 100); assert.deepEqual(s, before);
});
test('a single surviving rival wins', () => {
  const s = createRound(players, 1, 'normal', 0);
  s.players[0].alive = false; stepRound(s);
  assert.equal(s.phase, 'finished'); assert.deepEqual(s.winners, ['b']);
});
test('disconnected players are never awarded wins', () => {
  const s = createRound(players);
  s.players[0].disconnected = true; s.players[0].alive = false;
  finishRound(s, 'disconnect'); assert.deepEqual(s.winners, ['b']); assert.equal(s.reason, 'disconnect');
});
test('solo runs are endless and mark 60 seconds as cleared', () => {
  const s = createRound([players[0]], 5, 'normal', 0);
  s.arenas[0].tailRadius = 99999; s.t = 60 - STEP; stepRound(s);
  assert.equal(s.phase, 'playing'); assert.equal(s.players[0].cleared, true);
  assert.ok(s.events.some(e => e.type === 'cleared'));
});
test('long runs keep a bounded field and every wall leaves an opening', () => {
  for (const difficulty of ['normal', 'hard', 'hyper']) {
    const s = createRound([players[0]], 6, difficulty, 0);
    for (let i = 0; i < 10800; i++) {
      stepRound(s); s.players[0].alive = true; s.players[0].hp = 1;
      if (s.phase === 'finished') { s.phase = 'playing'; s.winners = []; }
      assert.ok(s.arenas[0].walls.length < 48);
      const full = (1 << s.arenas[0].sides) - 1;
      for (const wall of s.arenas[0].walls) assert.ok(wall.mask > 0 && wall.mask < full);
    }
    assert.ok(s.arenas[0].wallId > 100);
  }
});
test('a perfect bot survives every seed past full speed, so every row has a way through', () => {
  // The spacing allows exactly the turn a row needs (margin 1 on HYPER), so one bad row would kill the bot.
  for (const difficulty of ['normal', 'hard', 'hyper']) {
    for (let seed = 1; seed <= 16; seed++) {
      const s = runBots(createRound([players[0]], seed, difficulty, 0), 110);
      assert.ok(s.players[0].alive, `${difficulty} seed ${seed}: bot died at ${s.players[0].survived.toFixed(1)} s`);
    }
  }
});
test('hard and hyper change shape smoothly, with no wall at the orbit while the lanes move', () => {
  for (const difficulty of ['hard', 'hyper']) {
    const s = createRound([players[0]], 9, difficulty, 0), seen = new Set([6]);
    let morphs = 0, wasMorph = false;
    for (let i = 0; i < 90 / STEP; i++) {
      const before = s.arenas[0].walls.length;
      stepRound(s, { a: botInput(s, s.players[0]) }); s.players[0].alive = true; s.players[0].hp = 1;
      if (s.phase === 'finished') { s.phase = 'playing'; s.winners = []; }
      const arena = s.arenas[0], m = arena.morph;
      if (m && m.p > 0) {
        // While the lanes move, every wall is inside the orbit (passed) or outside it (not yet arrived).
        assert.ok(arena.walls.every(w => w.radius + w.thickness < ORBIT - 5 || w.radius > ORBIT + 5), 'a wall was at the orbit during a shape change');
        const g = geometry(arena);
        assert.ok(Math.abs(g.size.reduce((a, b) => a + b, 0) - TAU) < 1e-9);
      }
      if (m && !wasMorph) { morphs++; assert.ok(arena.walls.length >= before - 1, 'walls were removed at a shape change'); }
      wasMorph = !!m;
      seen.add(arena.sides);
    }
    assert.ok(seen.has(5) && seen.has(4), `${difficulty} shapes seen: ${[...seen]}`);
    assert.ok(morphs >= 3);
  }
});
test('normal keeps the hexagon', () => {
  const s = runBots(createRound([players[0]], 9, 'normal', 0), 60);
  assert.equal(s.arenas[0].sides, 6);
});
