import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createRound, stepRound, finishRound, STEP, COLORS, DIFFICULTIES } from './public/engine.mjs';

const MAX_FRAME = 4096;
const MAX_ROOMS = 64;
const decoder = new TextDecoder('utf-8', { fatal: true });
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.mjs', ['client.mjs', 'text/javascript; charset=utf-8']],
  ['/engine.mjs', ['engine.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);
const AUDIO_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', json: 'application/json' };
try {
  for (const name of await readdir(new URL('./public/audio/', import.meta.url))) {
    const ext = /^[a-z0-9-]+\.(mp3|wav|json)$/.exec(name)?.[1];
    if (ext) assets.set(`/audio/${name}`, [`audio/${name}`, AUDIO_TYPES[ext]]);
  }
} catch { /* The game falls back to synthesized audio without the folder. */ }

function frame(opcode, payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(data.length < 126 ? 2 : 4);
  header[0] = 0x80 | opcode;
  if (data.length < 126) header[1] = data.length;
  else { header[1] = 126; header.writeUInt16BE(data.length, 2); }
  return Buffer.concat([header, data]);
}

// Small RFC 6455 transport, kept here so hosting needs no npm packages.
class Peer {
  constructor(socket, onMessage, onClose) {
    this.socket = socket; this.buffer = Buffer.alloc(0); this.fragments = [];
    this.fragmentSize = 0; this.fragmenting = false; this.closed = false;
    this.lastPong = Date.now(); this.budget = 180; this.budgetAt = Date.now();
    this.onMessage = onMessage;
    socket.setNoDelay(true);
    socket.on('data', data => this.consume(data));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => { this.closed = true; onClose(); });
  }
  write(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    if (this.socket.writableLength > 262144) { this.close(1008); return; }
    this.socket.write(frame(opcode, payload));
  }
  send(value) { this.write(1, typeof value === 'string' ? value : JSON.stringify(value)); }
  close(code = 1000) {
    if (this.closed) return;
    const payload = Buffer.alloc(2); payload.writeUInt16BE(code);
    this.socket.end(frame(8, payload)); this.closed = true;
    const timer = setTimeout(() => this.socket.destroy(), 200); timer.unref();
  }
  consume(data) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 2 && !this.closed) {
      const b = this.buffer, opcode = b[0] & 15, fin = !!(b[0] & 128);
      let length = b[1] & 127, offset = 2;
      if ((b[0] & 112) || !(b[1] & 128) || length === 127) return this.close(1002);
      if (length === 126) {
        if (b.length < 4) return;
        length = b.readUInt16BE(2); offset = 4;
        if (length < 126) return this.close(1002);
      }
      if (length > MAX_FRAME || ((opcode & 8) && (!fin || length > 125))) return this.close(1009);
      if (b.length < offset + 4 + length) return;
      const mask = b.subarray(offset, offset + 4); offset += 4;
      const payload = Buffer.from(b.subarray(offset, offset + length));
      this.buffer = b.subarray(offset + length);
      for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
      if (opcode === 8) return this.close(payload.length >= 2 ? payload.readUInt16BE(0) : 1000);
      if (opcode === 9) { this.write(10, payload); continue; }
      if (opcode === 10) { this.lastPong = Date.now(); continue; }
      if (opcode === 1) {
        if (this.fragmenting) return this.close(1002);
        this.fragments = [payload]; this.fragmentSize = length; this.fragmenting = !fin;
      } else if (opcode === 0 && this.fragmenting) {
        this.fragments.push(payload); this.fragmentSize += length; this.fragmenting = !fin;
      } else return this.close(1003);
      if (this.fragmentSize > MAX_FRAME) return this.close(1009);
      if (!fin) continue;
      this.budget = Math.min(180, this.budget + (Date.now() - this.budgetAt) * 0.18);
      this.budgetAt = Date.now();
      if (--this.budget < 0) return this.close(1008);
      try {
        const message = JSON.parse(decoder.decode(Buffer.concat(this.fragments)));
        this.fragments = []; this.fragmentSize = 0;
        if (message && typeof message === 'object' && !Array.isArray(message)) this.onMessage(message);
      } catch { return this.close(1007); }
    }
  }
}

const roomLimit = room => room.mode === 'battle' ? 2 : 8;
const round4 = (key, value) => typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1e4) / 1e4 : value;
// Clients render snapshots; they never simulate them, so the random state and future rows stay on the server.
export function snapshot(state) {
  return JSON.stringify({ type: 'state', state: {
    ...state,
    arenas: state.arenas.map(a => ({
      walls: a.walls.map(w => ({ id: w.id, radius: w.radius, thickness: w.thickness, mask: w.mask })),
      pickups: a.pickups, rotation: a.rotation, speed: a.speed, fogUntil: a.fogUntil, sides: a.sides, morph: a.morph,
    })),
  } }, round4);
}

export function createGameServer() {
  const peers = new Set(), rooms = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ws: wss:; base-uri 'none'; frame-ancestors 'none'");
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400).end(); return; }
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); return; }
    const asset = assets.get(path);
    if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500).end('Could not read game assets.'); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;

  function error(peer, message) { peer.send({ type: 'error', message }); }
  function lobby(room) {
    return { type: 'room', code: room.code, host: room.host, difficulty: room.difficulty, mode: room.mode,
      players: [...room.members].map(p => ({ id: p.id, name: p.name, color: p.color, wins: p.wins })),
      phase: room.state?.phase || 'lobby' };
  }
  function broadcast(room, data) { for (const p of room.members) p.send(data); }
  function update(room) { broadcast(room, lobby(room)); }
  function leave(peer) {
    const room = peer.room;
    if (!room) return;
    peer.room = null; peer.direction = 0; room.members.delete(peer);
    if (!room.members.size) { rooms.delete(room.code); return; }
    if (room.host === peer.id) room.host = room.members.values().next().value.id;
    const player = room.state?.players.find(p => p.id === peer.id);
    if (player && room.state.phase !== 'finished') {
      player.alive = false; player.disconnected = true;
      if (room.members.size < 2) finishRound(room.state, 'disconnect');
    }
    if (room.state?.phase === 'finished' && !room.scored) {
      room.scored = true;
      for (const p of room.members) if (room.state.winners.includes(p.id)) p.wins++;
      broadcast(room, snapshot(room.state));
    }
    update(room);
  }
  function join(peer, room, name) {
    leave(peer);
    peer.name = String(name || 'Player').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) || 'Player';
    const used = new Set([...room.members].map(p => p.color));
    peer.color = COLORS.find(c => !used.has(c)); peer.wins = 0;
    peer.room = room; room.members.add(peer); update(room);
  }
  function onMessage(peer, m) {
    if (m.type === 'ping') { peer.send({ type: 'pong', at: m.at }); return; }
    if (m.type === 'input') {
      if (!Number.isSafeInteger(m.seq) || m.seq <= peer.seq || ![-1, 0, 1].includes(m.direction)) return;
      peer.seq = m.seq; peer.direction = m.direction; peer.inputAt = performance.now(); return;
    }
    if (m.type === 'fire') {
      if (!Number.isSafeInteger(m.seq) || m.seq <= peer.fireSeq) return;
      peer.fireSeq = m.seq; peer.firePending = true; return;
    }
    if (m.type === 'leave') { leave(peer); peer.send({ type: 'left' }); return; }
    if (m.type === 'create' || m.type === 'join') {
      if (Date.now() - peer.lastAction < 500) return error(peer, 'Please wait a moment before trying again.');
      peer.lastAction = Date.now();
      if (m.type === 'create') {
        if (rooms.size >= MAX_ROOMS) return error(peer, 'The server is full. Try again later.');
        let code;
        do { code = Array.from(randomBytes(5), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 31]).join(''); } while (rooms.has(code));
        const room = { code, host: peer.id, members: new Set(), difficulty: DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'normal',
          mode: m.mode === 'battle' ? 'battle' : 'classic', state: null, scored: false };
        rooms.set(code, room); join(peer, room, m.name);
      } else {
        const room = rooms.get(String(m.code).trim().toUpperCase());
        if (!room) return error(peer, 'Room not found. Check the five-character code.');
        if (room === peer.room) return update(room);
        if (room.members.size >= roomLimit(room)) return error(peer, room.mode === 'battle' ? 'This battle room is full (2 players).' : 'This room is full (8 players).');
        if (room.state && room.state.phase !== 'finished') return error(peer, 'A round is in progress. Join after it finishes.');
        join(peer, room, m.name);
      }
      return;
    }
    const room = peer.room;
    if (!room || room.host !== peer.id) return;
    if (m.type === 'difficulty' && (!room.state || room.state.phase === 'finished')) {
      room.difficulty = DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'normal'; update(room);
    }
    if (m.type === 'mode' && (!room.state || room.state.phase === 'finished')) {
      if (m.mode === 'battle' && room.members.size > 2) return error(peer, 'Battle is 1v1. A battle room holds 2 players.');
      room.mode = m.mode === 'battle' ? 'battle' : 'classic'; update(room);
    }
    if (m.type === 'start') {
      if (room.state && room.state.phase !== 'finished') return;
      if (room.members.size < 2) return error(peer, 'You need at least two players to start.');
      if (room.mode === 'battle' && room.members.size !== 2) return error(peer, 'Battle is 1v1. A battle room holds 2 players.');
      room.state = createRound([...room.members], randomBytes(4).readUInt32LE(), room.difficulty, 3, room.mode);
      room.scored = false;
      for (const p of room.members) { p.direction = 0; p.inputAt = 0; p.firePending = false; }
      update(room); broadcast(room, snapshot(room.state));
    }
  }
  server.on('upgrade', (req, socket, head) => {
    const reject = () => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    if (req.url !== '/ws' || req.headers['sec-websocket-version'] !== '13' || !/^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key'] || '') || req.headers.upgrade?.toLowerCase() !== 'websocket') return reject();
    if (peers.size >= 512) return reject();
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reject(); } catch { return reject(); }
    }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const peer = new Peer(socket, m => onMessage(peer, m), () => { leave(peer); peers.delete(peer); });
    Object.assign(peer, { id: randomBytes(6).toString('hex'), seq: -1, fireSeq: -1, firePending: false, direction: 0, inputAt: 0, lastAction: 0, room: null });
    peers.add(peer); peer.send({ type: 'welcome', id: peer.id });
    if (head.length) peer.consume(head);
  });

  let previous = performance.now(), accumulator = 0, snapshotSteps = 0;
  const tick = setInterval(() => {
    const now = performance.now();
    // Bound catch-up work after OS sleep; no giant collision jumps.
    accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    while (accumulator >= STEP) {
      accumulator -= STEP; snapshotSteps++;
      for (const room of rooms.values()) {
        const state = room.state;
        if (!state || state.phase === 'finished') continue;
        const inputs = {};
        for (const p of room.members) {
          inputs[p.id] = { dir: now - p.inputAt < 500 ? p.direction : 0, fire: p.firePending };
          p.firePending = false;
        }
        stepRound(state, inputs);
        if (state.phase === 'finished' && !room.scored) {
          room.scored = true;
          for (const p of room.members) if (state.winners.includes(p.id)) p.wins++;
          broadcast(room, snapshot(state)); update(room);
        } else if (snapshotSteps % 4 === 0) broadcast(room, snapshot(state));
      }
    }
  }, 4);
  tick.unref();
  const heartbeat = setInterval(() => {
    for (const peer of peers) {
      if (Date.now() - peer.lastPong > 45000) peer.close(1001);
      else peer.write(9);
    }
  }, 15000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(tick); clearInterval(heartbeat); });
  return { server, rooms, peers, close: () => new Promise(resolve => {
    for (const p of peers) p.socket.destroy();
    server.close(resolve); server.closeAllConnections();
  }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const game = createGameServer();
  game.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another port and try again.` : error.message);
    process.exit(1);
  });
  game.server.listen(port, host, () => {
    console.log(`\n  HEX RELAY — server running\n\n  This computer: http://localhost:${port}`);
    for (const addresses of Object.values(networkInterfaces())) for (const a of addresses || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Local network: http://${a.address}:${port}`);
    }
    console.log('\n  Share the local network address, then create a room in the game.\n  Ctrl+C to stop.\n');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
