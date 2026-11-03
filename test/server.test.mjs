import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createGameServer } from '../server.mjs';

const test = (name, fn) => nodeTest(name, { timeout: 10000 }, fn);

async function setup(t) {
  const game = createGameServer(); game.server.listen(0, '127.0.0.1'); await once(game.server, 'listening');
  t.after(() => game.close());
  return { ...game, origin: `http://127.0.0.1:${game.server.address().port}`, port: game.server.address().port };
}
async function client(origin) {
  const ws = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
  const messages = [], waiting = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data), index = waiting.findIndex(w => w.predicate(m));
    if (index < 0) messages.push(m);
    else { const [w] = waiting.splice(index, 1); clearTimeout(w.timeout); w.resolve(m); }
  });
  const wait = (type, predicate = () => true) => {
    const match = m => m.type === type && predicate(m), i = messages.findIndex(match);
    if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { predicate: match, resolve, timeout: setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 4000) };
      waiting.push(w);
    });
  };
  const welcome = await wait('welcome');
  return { ws, id: welcome.id, wait, send: m => ws.send(JSON.stringify(m)) };
}
test('serves the game, health and correct MIME types without exposing source files', async t => {
  const { origin } = await setup(t);
  for (const [path, mime] of [['/', 'text/html'], ['/engine.mjs', 'text/javascript'], ['/style.css', 'text/css'], ['/icon.svg', 'image/svg+xml']]) {
    const r = await fetch(origin + path); assert.equal(r.status, 200); assert.ok(r.headers.get('content-type').startsWith(mime));
    assert.ok(r.headers.has('content-security-policy')); assert.ok((await r.text()).length > 50);
  }
  assert.deepEqual(await (await fetch(origin + '/health')).json(), { ok: true });
  for (const path of ['/server.mjs', '/package.json', '/.env', '/test/server.test.mjs', '/%2e%2e/server.mjs']) assert.equal((await fetch(origin + path)).status, 404);
});
test('two clients create, join, start, receive identical state and rematch', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin);
  a.send({ type: 'create', name: 'Alpha', difficulty: 'hard' }); const room = await a.wait('room');
  assert.equal(room.host, a.id); assert.equal(room.code.length, 5);
  b.send({ type: 'join', code: room.code.toLowerCase(), name: '<b>Beta</b>' });
  const joined = await b.wait('room'); assert.equal(joined.players.length, 2); assert.notEqual(joined.players[0].color, joined.players[1].color);
  b.send({ type: 'start' });
  assert.equal(game.rooms.get(room.code).state, null, 'non-host cannot start');
  a.send({ type: 'start' });
  const [sa, sb] = await Promise.all([a.wait('state'), b.wait('state')]);
  assert.deepEqual(sa, sb); assert.equal(sa.state.phase, 'countdown'); assert.equal(sa.state.difficulty, 'hard');
  const authoritative = game.rooms.get(room.code).state;
  // Advance to a controlled end, then verify the actual server loop publishes/scorers.
  authoritative.t = 1; authoritative.phase = 'playing'; authoritative.players[1].alive = false;
  const end = await a.wait('state', m => m.state.phase === 'finished'); assert.deepEqual(end.state.winners, [a.id]);
  const scored = await a.wait('room', m => m.players[0].wins === 1); assert.equal(scored.phase, 'finished');
  a.send({ type: 'start' }); const rematch = await b.wait('state', m => m.state.seed !== sa.state.seed);
  assert.equal(rematch.state.phase, 'countdown'); assert.equal(scored.players[0].wins, 1);
});
test('server validates directional input, ignores stale packets, and expires held input', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin);
  a.send({ type: 'create', name: 'A' }); const r = await a.wait('room');
  b.send({ type: 'join', code: r.code, name: 'B' }); await b.wait('room');
  a.send({ type: 'start' }); await a.wait('state');
  a.send({ type: 'input', seq: 5, direction: 1 }); a.send({ type: 'input', seq: 4, direction: -1 }); a.send({ type: 'input', seq: 6, direction: 99 });
  a.send({ type: 'ping', at: 42 }); await a.wait('pong');
  const peer = [...game.peers].find(p => p.id === a.id); assert.equal(peer.seq, 5); assert.equal(peer.direction, 1);
  const state = game.rooms.get(r.code).state; state.t = 1; state.phase = 'playing'; state.arenas[0].tailRadius = 99999;
  peer.inputAt = -10000; const angle = state.players[0].angle;
  a.send({ type: 'ping', at: 43 }); await a.wait('pong', m => m.at === 43);
  // Waiting for a snapshot verifies that the simulation actually consumed a step.
  await a.wait('state', m => m.state.t > 1); assert.equal(state.players[0].angle, angle);
});
test('host disconnect transfers ownership, finishes the round and cleans empty rooms', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin);
  a.send({ type: 'create', name: 'A' }); const r = await a.wait('room');
  b.send({ type: 'join', code: r.code, name: 'B' }); await b.wait('room');
  a.send({ type: 'start' }); await b.wait('state'); a.ws.close();
  const end = await b.wait('state', m => m.state.phase === 'finished'); assert.equal(end.state.reason, 'disconnect'); assert.deepEqual(end.state.winners, [b.id]);
  const transfer = await b.wait('room', m => m.host === b.id); assert.equal(transfer.players.length, 1); assert.equal(transfer.players[0].wins, 1);
  b.send({ type: 'leave' }); await b.wait('left'); assert.equal(game.rooms.size, 0);
});
test('unknown, active and full rooms return clear errors', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin), c = await client(game.origin);
  c.send({ type: 'join', code: 'XXXXX' }); assert.match((await c.wait('error')).message, /not found/);
  a.send({ type: 'create' }); const r = await a.wait('room'); b.send({ type: 'join', code: r.code }); await b.wait('room');
  a.send({ type: 'start' }); await a.wait('state');
  const peer = [...game.peers].find(p => p.id === c.id); peer.lastAction = 0;
  c.send({ type: 'join', code: r.code }); assert.match((await c.wait('error')).message, /in progress/);
  const room = game.rooms.get(r.code); room.state = null;
  for (let i = 0; i < 6; i++) room.members.add({ id: `mock${i}`, color: `mock${i}`, send() {} });
  peer.lastAction = 0; c.send({ type: 'join', code: r.code }); assert.match((await c.wait('error')).message, /full/);
  // Remove synthetic members before cleanup.
  for (const p of room.members) if (p.id.startsWith('mock')) room.members.delete(p);
});
test('WebSocket rejects cross-origin handshakes', async t => {
  const { port } = await setup(t); const socket = net.connect(port, '127.0.0.1'); await once(socket, 'connect');
  socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://evil.example\r\n\r\n`);
  const [reply] = await once(socket, 'data'); assert.match(reply.toString(), /400 Bad Request/); socket.destroy();
});
test('WebSocket handles fragmented text and rejects unmasked frames', async t => {
  const { port } = await setup(t); const socket = net.connect(port, '127.0.0.1'); await once(socket, 'connect');
  socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  const [reply] = await once(socket, 'data'); assert.match(reply.toString(), /101 Switching Protocols/);
  if (!reply.toString().includes('"type":"welcome"')) {
    const [welcome] = await once(socket, 'data'); assert.match(welcome.toString(), /"type":"welcome"/);
  }
  function masked(opcode, text, fin) {
    const data = Buffer.from(text), mask = Buffer.from([1, 2, 3, 4]);
    const out = Buffer.alloc(6 + data.length); out[0] = (fin ? 128 : 0) | opcode; out[1] = 128 | data.length; mask.copy(out, 2);
    for (let i = 0; i < data.length; i++) out[6 + i] = data[i] ^ mask[i % 4];
    return out;
  }
  socket.write(Buffer.concat([masked(1, '{"type":"pi', false), masked(0, 'ng","at":7}', true)]));
  const [pong] = await once(socket, 'data'); assert.match(pong.toString(), /"type":"pong"/);
  socket.write(Buffer.from([0x81, 0x02, 0x7b, 0x7d]));
  const [close] = await once(socket, 'data'); assert.equal(close[0], 0x88); assert.equal(close.readUInt16BE(2), 1002); socket.destroy();
});
test('battle rooms hold two players, start a battle round, and apply fire', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin), c = await client(game.origin);
  a.send({ type: 'create', name: 'A', mode: 'battle' }); const r = await a.wait('room'); assert.equal(r.mode, 'battle');
  b.send({ type: 'join', code: r.code, name: 'B' }); await b.wait('room');
  c.send({ type: 'join', code: r.code, name: 'C' }); assert.match((await c.wait('error')).message, /battle room is full/);
  a.send({ type: 'start' });
  const start = await b.wait('state');
  assert.equal(start.state.mode, 'battle'); assert.equal(start.state.arenas.length, 2);
  assert.equal(start.state.arenas[0].rng, undefined, 'snapshots leave out the random state');
  assert.equal(start.state.players[0].hp, 3);
  const state = game.rooms.get(r.code).state; state.t = 1; state.phase = 'playing';
  for (const arena of state.arenas) arena.tailRadius = 99999;
  const shooter = state.players.find(p => p.id === a.id), target = state.players.find(p => p.id === b.id);
  shooter.item = 'fog';
  a.send({ type: 'fire', seq: 1 }); a.send({ type: 'fire', seq: 1 });
  const fired = await b.wait('state', m => m.state.players.find(p => p.id === b.id).incoming.length === 1);
  assert.equal(fired.state.players.find(p => p.id === a.id).item, null);
  assert.equal(target.incoming[0].item, 'fog');
});
test('a classic room with three players cannot switch to battle', async t => {
  const game = await setup(t), a = await client(game.origin), b = await client(game.origin), c = await client(game.origin);
  a.send({ type: 'create', name: 'A' }); const r = await a.wait('room');
  b.send({ type: 'join', code: r.code }); await b.wait('room');
  c.send({ type: 'join', code: r.code }); await c.wait('room');
  a.send({ type: 'mode', mode: 'battle' }); assert.match((await a.wait('error')).message, /1v1/);
  assert.equal(game.rooms.get(r.code).mode, 'classic');
});
