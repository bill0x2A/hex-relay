import { TAU, SECTOR, ORBIT, TURN_SPEED, STEP, COLORS, ITEMS, MAX_HP, LOCK_PRESSES, wrap, angleDelta, hexFactor, apothem, collides, createRound, stepRound, botInput, speedSteps } from './engine.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d', { alpha: false });
const store = {
  get(key, fallback) { try { return localStorage.getItem(`hex-relay:${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`hex-relay:${key}`, String(value)); } catch { /* Private browsing may disable storage. */ } },
};

// ---------------------------------------------------------------- menu entries
const ENTRIES = [
  { id: 'solo-normal', name: 'SOLO', sub: 'NORMAL', mode: 'solo', difficulty: 'normal', music: 'solo-normal',
    help: 'Survive as long as you can. Reach 60 seconds to clear it.',
    palette: { bg: ['#14151c', '#1a1a26'], walls: ['#8870ba', '#5b98a4', '#b06e86', '#7b9a54'], center: '#282333', edge: '#a38bc8' } },
  { id: 'solo-hard', name: 'SOLO', sub: 'HARD', mode: 'solo', difficulty: 'hard', music: 'solo-hard',
    help: 'Faster walls, single gaps, tunnels, and a changing center.',
    palette: { bg: ['#1a1112', '#24171a'], walls: ['#e0604f', '#e09a4f', '#d94f8a', '#e0c04f'], center: '#331c1f', edge: '#e08a7a' } },
  { id: 'solo-hyper', name: 'SOLO', sub: 'HYPER', mode: 'solo', difficulty: 'hyper', music: 'solo-hard',
    help: 'The fastest walls. The center turns into a pentagon and a square.',
    palette: { bg: ['#16101c', '#21162a'], walls: ['#f2f2f2', '#ff4fd8', '#4fe8ff', '#ffe14d'], center: '#2a1d33', edge: '#ffffff' } },
  { id: 'cpu-battle', name: 'BATTLE', sub: 'VS CPU', mode: 'cpu', battle: true, difficulty: 'normal', music: 'battle-base',
    help: 'Practice battle against the machine. Fire items with ↑ / W / Space.',
    palette: { bg: ['#0f1a17', '#14231f'], walls: ['#4fd1a5', '#4fa8d1', '#a5d14f', '#d1c44f'], center: '#173029', edge: '#6fe0b8' } },
  { id: 'local-battle', name: 'BATTLE', sub: 'LOCAL 1V1', mode: 'local', battle: true, difficulty: 'normal', music: 'battle-base',
    help: 'Split screen. P1: A / D, fire W. P2: ← / →, fire ↑.',
    palette: { bg: ['#11131c', '#181b28'], walls: ['#5d8bef', '#ef5d9b', '#5defc8', '#efc25d'], center: '#1d2135', edge: '#8aa8f5' } },
  { id: 'local-duel', name: 'DUEL', sub: 'LOCAL CLASSIC', mode: 'local', difficulty: 'normal', music: 'solo-normal',
    help: 'One arena, one keyboard. P1: A / D. P2: ← / →. Last one orbiting wins.',
    palette: { bg: ['#19170f', '#221f14'], walls: ['#d4b84f', '#d47a4f', '#9ad44f', '#4fd4c0'], center: '#302b19', edge: '#e0c870' } },
  { id: 'online', name: 'ONLINE', sub: 'ROOMS', mode: 'online', difficulty: 'normal', music: 'menu',
    help: 'Classic rooms for 2–8 players, or a battle room for 2.',
    palette: { bg: ['#101318', '#161b23'], walls: ['#5de5ef', '#bda1ff', '#d4ff57', '#ff947a'], center: '#1c2430', edge: '#7fe8f0' } },
];
let entryIndex = Math.max(0, ENTRIES.findIndex(e => e.id === store.get('entry', 'solo-normal')));
const entry = () => ENTRIES[entryIndex];

// ---------------------------------------------------------------- state
let view = 'menu', mode = 'solo', battle = false, state = null, room = null, myId = null, socket = null;
let connectedPromise = null, networkTimeout = null, toastTimeout, roundShown = false;
let width = 1, height = 1, dpr = 1, lastTime = performance.now(), accumulator = 0;
let lastHUD = 0, lastInputAt = 0, lastDirection = 0, inputSeq = 0, fireSeq = 0, receivedAt = 0;
let predictedAngle = Math.PI / 2, correction = 0, ping = 0, lastPingAt = 0;
let paused = false, helpPaused = false, localWins = {}, demoTime = 0, lastEventSeq = 0;
let menuRotation = entryIndex * SECTOR, deathAt = 0, overAt = 0, roundPalette = ENTRIES[0].palette;
let motionReduced = store.get('reduced-motion', String(matchMedia('(prefers-reduced-motion: reduce)').matches)) === 'true';
let soundEnabled = store.get('sound', 'false') === 'true';
let frames = 0, fpsAt = performance.now();
const keys = new Set(), touch = new Set(), firePressed = new Set(), padFire = [false, false];
const trails = new Map(), remoteVelocities = new Map(), previousAngles = new Map(), previousRotations = [];
const shakes = new Map(), banners = new Map(), shapeChanges = new Map();
let spinVelocities = [];

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

// ---------------------------------------------------------------- audio
// The offline build embeds the audio files as data URLs.
const audioUrl = url => globalThis.HEX_AUDIO?.[url] ?? url;
const sound = {
  ctx: null, master: null, music: null, filter: null, sfxGain: null, manifest: null, buffers: new Map(), loading: new Map(),
  track: null, danger: null, lastBeat: -1, fallbackStart: 0,
  init() {
    if (!soundEnabled) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
        this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 20000;
        this.music = this.ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.filter); this.filter.connect(this.master);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
        this.loadManifest();
      }
      this.ctx.resume().catch(() => {});
    } catch { soundEnabled = false; refreshSettings(); }
  },
  async loadManifest() {
    try { this.manifest = await (await fetch(audioUrl('audio/manifest.json'))).json(); } catch { this.manifest = { music: {}, sfx: {} }; }
    for (const name of Object.keys(this.manifest.sfx || {})) this.load(`audio/${this.manifest.sfx[name]}`);
    this.playMusic(this.wanted || 'menu');
  },
  load(url) {
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url));
    if (!this.loading.has(url)) {
      this.loading.set(url, fetch(audioUrl(url)).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
        .then(data => this.ctx.decodeAudioData(data)).then(buffer => { this.buffers.set(url, buffer); return buffer; })
        .catch(() => null));
    }
    return this.loading.get(url);
  },
  running() { return soundEnabled && this.ctx && this.ctx.state === 'running'; },
  async playMusic(name, restart = false) {
    this.wanted = name;
    if (!this.ctx || !this.manifest) return;
    if (this.track?.name === name && !restart) return;
    const info = this.manifest.music?.[name];
    const old = [this.track, this.danger];
    this.track = null; this.danger = null;
    const now = this.ctx.currentTime;
    for (const t of old) if (t) { t.gain.gain.setTargetAtTime(0, now, 0.12); t.source.stop(now + 0.6); }
    if (!info) { this.fallbackStart = now; return; }
    const layered = name === 'battle-base' && this.manifest.music['battle-danger'];
    const [buffer, dangerBuffer] = await Promise.all([this.load(`audio/${info.file}`), layered ? this.load(`audio/${this.manifest.music['battle-danger'].file}`) : null]);
    if (this.wanted !== name || !buffer) return;
    const start = this.ctx.currentTime + 0.05;
    const make = (buf, level) => {
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = buf; source.loop = true; source.loopStart = 0; source.loopEnd = info.bars * 4 * 60 / info.bpm;
      gain.gain.value = level; source.connect(gain); gain.connect(this.music); source.start(start);
      return { source, gain };
    };
    this.track = { name, ...make(buffer, 1), start, bpm: info.bpm };
    if (dangerBuffer) this.danger = make(dangerBuffer, 0);
  },
  setDanger(level) {
    if (this.danger) this.danger.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.25);
  },
  muffle(on) {
    if (this.filter) this.filter.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, on ? 0.05 : 0.2);
  },
  // Beat phase from the music clock, so the arena pulses with the track.
  beat(now) {
    if (this.track && this.running()) {
      const beats = Math.max(0, this.ctx.currentTime - this.track.start) * this.track.bpm / 60;
      return beats;
    }
    return now / 1000 * 2.2;
  },
  sfx(name, volume = 1) {
    if (!this.running()) return;
    const file = this.manifest?.sfx?.[name], buffer = file && this.buffers.get(`audio/${file}`);
    if (!buffer) { this.fallback(name); return; }
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = buffer; gain.gain.value = volume; source.connect(gain); gain.connect(this.sfxGain); source.start();
  },
  tone(frequency, duration, volume = 0.3, type = 'sine', slide = null) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), now = this.ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(frequency, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, now + duration);
    g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    o.connect(g); g.connect(this.sfxGain); o.start(now); o.stop(now + duration);
  },
  fallback(name) {
    const map = { select: [660, 0.05, 0.15, 'square'], start: [330, 0.25, 0.3, 'triangle', 990], pickup: [880, 0.12, 0.25, 'square', 1760],
      fire: [1200, 0.18, 0.2, 'sawtooth', 200], warning: [520, 0.3, 0.25, 'square', 260], hit: [160, 0.3, 0.45, 'sawtooth', 50],
      shield: [1400, 0.2, 0.2, 'triangle', 700], death: [220, 0.7, 0.5, 'triangle', 40], lock: [90, 0.3, 0.4, 'square'],
      win: [440, 0.4, 0.3, 'triangle', 880], heal: [700, 0.25, 0.2, 'sine', 1400], graze: [2400, 0.03, 0.05, 'sine'] };
    if (map[name]) this.tone(...map[name]);
  },
  // Without music files, a synthesized beat keeps the rhythm.
  fallbackBeat(now) {
    if (!this.running() || this.track || view !== 'playing' || paused || !state || state.phase !== 'playing') return;
    const b = Math.floor(state.t * 2.2);
    if (b === this.lastBeat) return;
    this.lastBeat = b;
    const notes = [110, 110, 164.81, 130.81, 110, 196, 164.81, 146.83];
    this.tone(100, 0.16, 0.6, 'sine', 38); this.tone(notes[b % 8] * 2, 0.12, 0.12, 'triangle');
    if (b % 2) this.tone(1700, 0.035, 0.035, 'square');
  },
};

function refreshSettings() {
  $('soundButton').setAttribute('aria-pressed', String(soundEnabled));
  $('soundButton').title = `Sound ${soundEnabled ? 'on' : 'off'} (M)`;
  $('motionButton').setAttribute('aria-pressed', String(motionReduced));
}

// ---------------------------------------------------------------- views
function bestKey(id = entry().id) { return `best-${id}`; }
function bestOf(id) { return Number(store.get(bestKey(id), store.get(`best-${id.replace('solo-', '')}`, '0'))); }
function refreshEntry() {
  const e = entry();
  $('entryName').textContent = e.name; $('entrySub').textContent = e.sub; $('entryHelp').textContent = e.help;
  $('entryBest').textContent = e.mode === 'solo' ? `BEST ${bestOf(e.id).toFixed(2).padStart(5, '0')}` : e.id === 'cpu-battle' ? `WINS ${store.get('cpu-wins', '0')}` : ' ';
  const press = matchMedia('(pointer: coarse)').matches ? 'TAP' : 'SPACE';
  $('playButton').textContent = `${press} TO ${e.mode === 'online' ? 'CONNECT' : 'START'}`;
  document.documentElement.style.setProperty('--accent', e.palette.walls[0]);
}
function moveEntry(step) {
  entryIndex = (entryIndex + step + ENTRIES.length) % ENTRIES.length;
  store.set('entry', entry().id); refreshEntry(); sound.sfx('select', 0.6);
}
function setView(next) {
  view = next;
  const playing = next === 'playing' || next === 'results';
  document.body.classList.toggle('playing', playing);
  $('menu').hidden = next !== 'menu'; $('onlinePanel').hidden = next !== 'online';
  $('roomPanel').hidden = next !== 'room'; $('hud').hidden = !playing; $('results').hidden = next !== 'results';
  const coarse = matchMedia('(pointer: coarse)').matches;
  $('touchControls').hidden = next !== 'playing' || !coarse || (mode === 'local');
  $('touchFire').hidden = !battle;
  if (next === 'menu' || next === 'room' || next === 'online') { state = null; trails.clear(); sound.muffle(false); sound.playMusic('menu'); }
  if (next === 'online') requestAnimationFrame(() => $('playerName').focus());
  requestAnimationFrame(resize);
}
function beginRound(s) {
  state = s; roundShown = false; accumulator = 0; paused = false; correction = 0; deathAt = 0;
  battle = s.mode === 'battle';
  predictedAngle = s.players.find(p => p.id === myId)?.angle ?? Math.PI / 2;
  keys.clear(); touch.clear(); firePressed.clear(); trails.clear(); remoteVelocities.clear(); previousAngles.clear();
  shakes.clear(); banners.clear(); shapeChanges.clear(); spinVelocities = []; previousRotations.length = 0;
  lastEventSeq = s.eventSeq || 0;
  $('spectating').hidden = true; $('centerMessage').textContent = '';
  setView('playing'); updateHUD();
  sound.muffle(false);
  const track = battle ? 'battle-base' : s.difficulty === 'normal' ? 'solo-normal' : 'solo-hard';
  sound.playMusic(track); sound.sfx('start');
}
function startLocal(rematch = false) {
  const e = entry();
  if (!rematch) localWins = {};
  mode = e.mode === 'cpu' ? 'cpu' : e.mode; sound.init();
  const players = mode === 'solo'
    ? [{ id: 'p1', name: store.get('name', 'You'), color: COLORS[0] }]
    : [{ id: 'p1', name: mode === 'cpu' ? store.get('name', 'You') : 'Player 1', color: COLORS[0] },
      { id: 'p2', name: mode === 'cpu' ? 'CPU' : 'Player 2', color: COLORS[1] }];
  myId = 'p1'; roundPalette = e.palette;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  // Solo and local rounds start at once; the first walls take about two seconds to arrive.
  beginRound(createRound(players, seed, e.difficulty, mode === 'solo' ? 0 : 1.5, e.battle ? 'battle' : 'classic'));
}
function activate() {
  const e = entry();
  sound.init();
  if (e.mode === 'online') { mode = 'online'; setView('online'); return; }
  startLocal();
}

// ---------------------------------------------------------------- network
function networkBusy(busy) {
  $('createButton').disabled = busy; $('joinButton').disabled = busy;
  clearTimeout(networkTimeout);
  if (busy) networkTimeout = setTimeout(() => { networkBusy(false); toast('The server did not respond. Check the connection and try again.'); }, 6500);
}
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function connect() {
  if (location.protocol === 'file:') return Promise.reject(new Error('Online play needs the Node server. Run node server.mjs and open the printed address.'));
  if (socket?.readyState === WebSocket.OPEN && myId) return Promise.resolve();
  if (connectedPromise) return connectedPromise;
  connectedPromise = new Promise((resolve, reject) => {
    let greeted = false;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    const timeout = setTimeout(() => { socket?.close(); reject(new Error('Connection timed out. Start the server and try again.')); }, 5000);
    socket.addEventListener('message', event => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'welcome') { myId = m.id; greeted = true; clearTimeout(timeout); resolve(); }
      if (m.type === 'error') { networkBusy(false); toast(m.message); }
      if (m.type === 'room') { networkBusy(false); room = m; updateRoom(); }
      if (m.type === 'left') { room = null; if (mode === 'online') setView('menu'); }
      if (m.type === 'pong') ping = Math.round(performance.now() - m.at);
      if (m.type === 'state') onSnapshot(m.state);
    });
    socket.addEventListener('error', () => { /* The close event handles connection failures. */ });
    socket.addEventListener('close', () => {
      clearTimeout(timeout); connectedPromise = null; socket = null; networkBusy(false);
      if (!greeted) reject(new Error('Could not connect. Run node server.mjs and open the printed address.'));
      if (room || (mode === 'online' && state)) {
        room = null; state = null; setView('menu'); toast('Connection lost. Rejoin the room when the server is available.');
      }
    });
  });
  return connectedPromise;
}
function onSnapshot(s) {
  const isNew = !state || s.seed !== state.seed || state.mode !== s.mode;
  if (isNew) { mode = 'online'; roundPalette = ENTRIES.find(e => e.id === 'online').palette; beginRound(s); }
  else if (s.t > state.t) {
    const dt = s.t - state.t;
    for (const p of s.players) {
      const previous = state.players.find(old => old.id === p.id);
      if (previous) remoteVelocities.set(p.id, angleDelta(p.angle, previous.angle) / dt);
    }
    spinVelocities = s.arenas.map((a, i) => angleDelta(a.rotation, state.arenas[i]?.rotation ?? a.rotation) / dt);
  }
  const own = s.players.find(p => p.id === myId);
  if (own) {
    const estimated = wrap(own.angle + lastDirection * TURN_SPEED * Math.min(ping / 2000, 0.1));
    const error = angleDelta(estimated, predictedAngle);
    if (Math.abs(error) > 0.6 || s.phase !== 'playing' || !own.alive) { predictedAngle = own.angle; correction = 0; }
    else correction = error;
  }
  state = s; receivedAt = performance.now();
  handleEvents();
  if (s.phase === 'finished') showResults();
}
async function roomAction(type) {
  const name = $('playerName').value.trim() || 'Player';
  const code = $('roomCode').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z2-9]{5}$/.test(code)) { toast('Enter a five-character room code.'); $('roomCode').focus(); return; }
  store.set('name', name); networkBusy(true); sound.init();
  try { await connect(); send({ type, name, code, difficulty: 'normal', mode: 'classic' }); }
  catch (e) { networkBusy(false); toast(e.message); }
}
$('createButton').addEventListener('click', () => roomAction('create'));
$('joinButton').addEventListener('click', () => roomAction('join'));
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') roomAction('join'); });
$('roomCode').addEventListener('input', () => { $('roomCode').value = $('roomCode').value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
$('onlineBack').addEventListener('click', () => setView('menu'));
function dot(color) { const el = document.createElement('i'); el.className = 'player-dot'; el.style.backgroundColor = color; return el; }
function updateRoom() {
  if (!room) return;
  $('displayCode').textContent = room.code;
  const host = room.host === myId, need = room.mode === 'battle' ? 2 : 2;
  $('roster').replaceChildren(...room.players.map(p => {
    const li = document.createElement('li'), name = document.createElement('span'), tag = document.createElement('span'), wins = document.createElement('span');
    name.textContent = p.name; tag.className = 'tag'; tag.textContent = `${p.id === myId ? 'YOU ' : ''}${p.id === room.host ? 'HOST' : ''}`;
    wins.className = 'wins'; wins.textContent = `${p.wins}W`; li.append(dot(p.color), name, tag, wins); return li;
  }));
  for (const b of document.querySelectorAll('.toggles .pill')) {
    const active = b.dataset.mode ? b.dataset.mode === room.mode : b.dataset.difficulty === room.difficulty;
    b.setAttribute('aria-pressed', String(active)); b.disabled = !host;
  }
  const ready = room.players.length >= need && (room.mode !== 'battle' || room.players.length === 2);
  $('startButton').disabled = !host || !ready;
  $('startButton').textContent = host ? 'SPACE TO START' : 'WAITING FOR HOST';
  $('roomStatus').textContent = room.players.length < 2 ? 'Waiting for a rival. Share the code.'
    : room.mode === 'battle' && room.players.length > 2 ? 'Battle is 1v1. Switch to classic for more players.'
    : host ? 'Ready. Start when you are.' : 'Waiting for the host to start.';
  $('retryButton').disabled = mode === 'online' && (!host || !ready);
  if (mode === 'online' && view === 'results') $('retryButton').textContent = host ? 'SPACE FOR NEXT ROUND' : 'WAITING FOR HOST';
  if (!state || (state.phase === 'finished' && !roundShown)) setView('room');
}
for (const b of document.querySelectorAll('.toggles .pill')) {
  b.addEventListener('click', () => {
    if (b.dataset.mode) send({ type: 'mode', mode: b.dataset.mode });
    else send({ type: 'difficulty', difficulty: b.dataset.difficulty });
  });
}
$('startButton').addEventListener('click', () => { sound.init(); send({ type: 'start' }); });
$('leaveButton').addEventListener('click', () => { send({ type: 'leave' }); room = null; setView('menu'); });
$('copyButton').addEventListener('click', async () => {
  if (!room) return;
  const invite = `${location.origin}/?room=${room.code}`;
  try { await navigator.clipboard.writeText(invite); toast('Invite link copied.'); }
  catch { toast(`Share ${location.origin} and room code ${room.code}`); }
});

// ---------------------------------------------------------------- events and results
const ITEM_HELP = {
  squeeze: 'NEXT ROWS HAVE ONE GAP', surge: 'WALLS SPEED UP', spin: 'THE WORLD SPINS BACK', mirror: 'CONTROLS REVERSED',
  fog: 'YOU CANNOT SEE FAR', lock: 'PRESS ← → TO BREAK FREE', bricks: 'HEAVY WALLS COMING',
  shield: 'NEXT HIT IS ABSORBED', slow: 'YOUR WALLS SLOW DOWN', clear: 'THE NEAR WALLS ARE GONE', heal: '+1 HIT POINT',
};
function banner(id, text, color, ms = 1400) { banners.set(id, { text, color, until: performance.now() + ms }); }
function handleEvents() {
  if (!state) return;
  for (const e of state.events) {
    if (e.seq <= lastEventSeq) continue;
    lastEventSeq = e.seq;
    const mine = e.id === myId || mode === 'local';
    const who = state.players.find(p => p.id === e.id);
    if (e.type === 'pickup' && mine) { sound.sfx('pickup'); banner(e.id, `GOT ${ITEMS[e.item].label}`, '#ffffff', 900); }
    if (e.type === 'fire') {
      if (mine) sound.sfx('fire');
      if (e.target === myId || mode === 'local') { sound.sfx('warning'); banner(e.target, `INCOMING ${ITEMS[e.item].label}`, '#ff5d6c', 1200); }
    }
    if (e.type === 'attack') { if (e.item === 'lock') sound.sfx('lock'); banner(e.id, `${ITEMS[e.item].label} · ${ITEM_HELP[e.item]}`, '#ff8a5d', 1600); }
    if (e.type === 'counter') { sound.sfx('shield'); banner(e.id, `COUNTERED ${ITEMS[e.item].label}`, '#7dffb0', 1200); }
    if (e.type === 'boost') { sound.sfx(e.item === 'heal' ? 'heal' : 'pickup'); banner(e.id, `${ITEMS[e.item].label} · ${ITEM_HELP[e.item]}`, '#7dffb0', 1400); }
    if (e.type === 'unlock') banner(e.id, 'FREE', '#7dffb0', 700);
    if (e.type === 'shield') { sound.sfx('shield'); shakes.set(e.id, performance.now()); }
    if (e.type === 'hit') { sound.sfx('hit'); shakes.set(e.id, performance.now()); }
    if (e.type === 'graze' && mine) sound.sfx('graze', 0.4);
    if (e.type === 'death') {
      sound.sfx('death'); shakes.set(e.id, performance.now());
      if (e.id === myId || state.players.length === 1) { deathAt = performance.now(); sound.muffle(true); }
    }
    if (e.type === 'shape') { shapeChanges.set(e.arena, performance.now()); sound.sfx('start', 0.7); }
    if (e.type === 'cleared' && (e.id === myId) && who) toast('60 SECONDS · CLEARED. KEEP GOING.');
  }
}
function showResults() {
  if (!state || roundShown) return;
  roundShown = true; keys.clear(); touch.clear(); firePressed.clear();
  overAt = performance.now();
  if (!deathAt) deathAt = overAt;
  const winner = state.players.find(p => p.id === state.winners[0]);
  const own = state.players.find(p => p.id === myId);
  const solo = mode === 'solo', tie = state.winners.length > 1;
  const time = solo ? own.survived : state.finishedAt;
  let newBest = false;
  if (solo) {
    const id = `solo-${state.difficulty}`, old = bestOf(id);
    newBest = time > old; if (newBest) store.set(bestKey(id), time.toFixed(2));
  } else if (mode !== 'online') for (const id of state.winners) localWins[id] = (localWins[id] || 0) + 1;
  if (mode === 'cpu' && state.winners.length === 1 && state.winners[0] === myId) store.set('cpu-wins', Number(store.get('cpu-wins', '0')) + 1);
  const iWon = state.winners.includes(myId) && !tie;
  if (!solo && (iWon || mode === 'local')) sound.sfx('win');
  $('resultTitle').textContent = solo ? (newBest ? 'NEW BEST' : 'GAME OVER') : tie ? 'DRAW' : winner ? `${winner.name.toUpperCase()} WINS` : 'ROUND OVER';
  $('resultTime').textContent = time.toFixed(2).padStart(5, '0');
  $('resultSubtitle').textContent = solo ? (own.cleared ? 'CLEARED' : `BEST ${bestOf(`solo-${state.difficulty}`).toFixed(2)}`)
    : state.reason === 'disconnect' ? 'YOUR RIVAL LEFT' : battle ? 'BATTLE' : 'LAST ONE ORBITING';
  $('resultScores').replaceChildren(...(solo ? [] : [...state.players].sort((a, b) => b.survived - a.survived).map(p => {
    const li = document.createElement('li'), name = document.createElement('span'), score = document.createElement('span');
    name.textContent = p.name + (state.winners.includes(p.id) ? ' · WINNER' : '');
    score.textContent = `${p.survived.toFixed(2)}s${mode !== 'online' ? ` · ${localWins[p.id] || 0}W` : ''}`;
    li.append(dot(p.color), name, score); return li;
  })));
  const host = room?.host === myId;
  $('retryButton').disabled = mode === 'online' && (!host || (room?.players.length ?? 0) < 2);
  $('retryButton').textContent = mode === 'online' ? (host ? 'SPACE FOR NEXT ROUND' : 'WAITING FOR HOST') : 'SPACE TO PLAY AGAIN';
  $('backButton').textContent = mode === 'online' ? 'ESC LOBBY' : 'ESC MENU';
  $('centerMessage').textContent = ''; $('spectating').hidden = true;
  // Solo shows the death zoom first; the card follows.
  setTimeout(() => { if (state && roundShown) { setView('results'); updateHUD(); } }, solo ? 650 : 900);
}
function retry() {
  if (mode === 'online') { sound.init(); send({ type: 'start' }); } else startLocal(true);
}
function back() {
  if (mode === 'online' && room) { state = null; setView('room'); updateRoom(); } else { state = null; setView('menu'); }
}
$('retryButton').addEventListener('click', retry);
$('backButton').addEventListener('click', back);
function exitArena() {
  if (mode === 'online') { send({ type: 'leave' }); room = null; }
  keys.clear(); touch.clear(); state = null; setView('menu');
}

// ---------------------------------------------------------------- input
function keyboardDirection(left, right) { return Number(right.some(k => keys.has(k))) - Number(left.some(k => keys.has(k))); }
function gamepad(index) { return navigator.getGamepads?.()[index] || null; }
function gamepadDirection(index) {
  const pad = gamepad(index);
  if (!pad) return 0;
  if (pad.buttons[14]?.pressed || pad.axes[0] < -0.3) return -1;
  if (pad.buttons[15]?.pressed || pad.axes[0] > 0.3) return 1;
  return 0;
}
function pollPadFire() {
  for (let i = 0; i < 2; i++) {
    const pad = gamepad(i), down = !!(pad?.buttons[0]?.pressed || pad?.buttons[12]?.pressed);
    if (down && !padFire[i]) firePressed.add(mode === 'local' ? `p${i + 1}` : myId);
    padFire[i] = down;
  }
}
function directions() {
  if ($('helpDialog').open || document.hidden || paused) return {};
  if (mode === 'local') return { p1: keyboardDirection(['KeyA'], ['KeyD']) || gamepadDirection(0), p2: keyboardDirection(['ArrowLeft'], ['ArrowRight']) || gamepadDirection(1) };
  return { [myId]: keyboardDirection(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) || (Number(touch.has('right')) - Number(touch.has('left'))) || gamepadDirection(0) };
}
function clearInputs() { keys.clear(); touch.clear(); lastDirection = 0; if (mode === 'online' && state) send({ type: 'input', direction: 0, seq: ++inputSeq }); }
function fireFor(code) {
  if (!battle) return null;
  if (mode === 'local') return code === 'KeyW' ? 'p1' : code === 'ArrowUp' ? 'p2' : null;
  return ['KeyW', 'ArrowUp', 'Space'].includes(code) ? myId : null;
}
// Browsers allow audio only after a gesture: the first key or tap starts it.
window.addEventListener('pointerdown', () => { if (soundEnabled && !sound.ctx) sound.init(); }, { capture: true });
window.addEventListener('keydown', e => {
  if (soundEnabled && !sound.ctx) sound.init();
  if ($('helpDialog').open) return;
  const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  if (e.code === 'Escape') {
    e.preventDefault();
    if (view === 'playing') exitArena();
    else if (view === 'results') back();
    else if (view === 'online') setView('menu');
    else if (view === 'room') { send({ type: 'leave' }); room = null; setView('menu'); }
    return;
  }
  if (typing) return;
  if (e.code === 'KeyM' && !e.repeat) { $('soundButton').click(); return; }
  if (e.code === 'KeyF' && !e.repeat) { $('fullscreenButton').click(); return; }
  if (e.code === 'KeyH' && !e.repeat) { $('howButton').click(); return; }
  if (view === 'menu') {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) { e.preventDefault(); moveEntry(-1); }
    if (['ArrowRight', 'KeyD'].includes(e.code)) { e.preventDefault(); moveEntry(1); }
    if (['Space', 'Enter'].includes(e.code) && !e.repeat) { e.preventDefault(); activate(); }
    return;
  }
  if (view === 'room') {
    if (['Space', 'Enter'].includes(e.code) && !e.repeat) { e.preventDefault(); if (!$('startButton').disabled) $('startButton').click(); }
    return;
  }
  if (view === 'results' || (state?.phase === 'finished')) {
    if (['Space', 'Enter'].includes(e.code) && !e.repeat && view === 'results') { e.preventDefault(); if (!$('retryButton').disabled) retry(); }
    return;
  }
  if (state && state.phase !== 'finished') {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space', 'KeyP'].includes(e.code)) e.preventDefault();
    const shooter = fireFor(e.code);
    if (shooter && !e.repeat) { queueFire(shooter); return; }
    const pauseKey = e.code === 'KeyP' || (e.code === 'Space' && !battle);
    if (pauseKey && !e.repeat && mode !== 'online') { paused = !paused; clearInputs(); return; }
    keys.add(e.code);
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', clearInputs);
document.addEventListener('visibilitychange', () => {
  clearInputs();
  if (document.hidden && state && state.phase !== 'finished' && mode !== 'online') paused = true;
});
function queueFire(id) {
  if (mode === 'online') send({ type: 'fire', seq: ++fireSeq });
  else firePressed.add(id);
}
for (const [id, direction] of [['touchLeft', 'left'], ['touchRight', 'right']]) {
  const button = $(id);
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); touch.add(direction); sound.init(); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => touch.delete(direction));
}
$('touchFire').addEventListener('pointerdown', e => { e.preventDefault(); queueFire(myId); });
// Tapping the arena in the menu: the sides change the entry; the middle starts.
$('arena').addEventListener('pointerdown', e => {
  if (view !== 'menu') return;
  const x = e.clientX / window.innerWidth;
  if (x < 0.3) moveEntry(-1); else if (x > 0.7) moveEntry(1); else activate();
});
$('prevEntry').addEventListener('click', () => moveEntry(-1));
$('nextEntry').addEventListener('click', () => moveEntry(1));
$('playButton').addEventListener('click', activate);
$('soundButton').addEventListener('click', () => {
  soundEnabled = !soundEnabled; store.set('sound', soundEnabled); refreshSettings(); sound.init();
  if (!soundEnabled && sound.ctx) sound.ctx.suspend().catch(() => {});
});
$('motionButton').addEventListener('click', () => { motionReduced = !motionReduced; store.set('reduced-motion', motionReduced); refreshSettings(); });
$('fullscreenButton').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Fullscreen is unavailable in this browser window.'); }
});
$('howButton').addEventListener('click', () => {
  clearInputs(); helpPaused = !paused; if (mode !== 'online' && state) paused = true;
  $('helpDialog').showModal();
});
for (const id of ['closeHelp', 'gotIt']) $(id).addEventListener('click', () => $('helpDialog').close());
$('helpDialog').addEventListener('close', () => { if (helpPaused) paused = false; });

// ---------------------------------------------------------------- HUD
const STAGES = ['WARM UP', 'TURNING', 'PRESSURE', 'NO BRAKES', 'OVERDRIVE', 'CLEARED', 'BEYOND'];
function updateHUD() {
  if (!state) return;
  const t = Math.max(0, state.t), whole = Math.floor(t).toString().padStart(2, '0');
  $('timer').replaceChildren(document.createTextNode(whole));
  const fraction = document.createElement('span'); fraction.textContent = `.${Math.floor((t % 1) * 100).toString().padStart(2, '0')}`; $('timer').append(fraction);
  const sudden = state.players.length > 1 && t >= 120;
  const stage = sudden ? 'SUDDEN DEATH' : STAGES[Math.min(Math.floor(t / 10), STAGES.length - 1)];
  if ($('stage').textContent !== stage) {
    // A speed step: the stage name pops, so the player knows the walls just got faster.
    if (t > 1 && state.phase === 'playing') {
      sound.sfx('select');
      $('stage').classList.remove('pop'); void $('stage').offsetWidth; $('stage').classList.add('pop');
    }
    $('stage').textContent = stage;
  }
  const legendKey = state.players.map(p => `${p.id}:${p.alive}:${p.hp}`).join();
  if ($('playerLegend').dataset.key !== legendKey && !(battle && mode === 'local')) {
    $('playerLegend').dataset.key = legendKey;
    $('playerLegend').replaceChildren(...(state.players.length < 2 ? [] : state.players.map(p => {
      const row = document.createElement('div'); row.className = p.alive ? '' : 'out';
      row.append(document.createTextNode(`${p.name}${p.id === myId && mode === 'online' ? ' · YOU' : ''}${battle ? ` ${'♦'.repeat(Math.max(0, p.hp))}` : ''}`), dot(p.color)); return row;
    })));
  }
  if (battle && mode === 'local') $('playerLegend').replaceChildren();
  $('connectionStats').textContent = mode === 'online' ? `${ping} MS` : '';
  if (state.phase !== 'finished') {
    if (paused) {
      $('centerMessage').replaceChildren(document.createTextNode('PAUSED'));
      const small = document.createElement('small'); small.textContent = 'P TO RESUME'; $('centerMessage').append(small);
    } else if (state.t < 0) {
      const n = Math.ceil(-state.t); $('centerMessage').replaceChildren(document.createTextNode(String(n)));
    } else $('centerMessage').textContent = '';
    $('spectating').hidden = !(mode === 'online' && !battle && !state.players.find(p => p.id === myId)?.alive);
  }
}

// ---------------------------------------------------------------- rendering
function resize() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, rect.width); height = Math.max(1, rect.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
}
new ResizeObserver(resize).observe($('arena'));
window.addEventListener('resize', resize);
function hexPath(radius, n = 6) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n;
    if (!i) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius); else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.closePath();
}
function drawWall(mask, radius, thickness, color, n = 6) {
  if (radius + thickness < 0) return;
  const inner = Math.max(0, radius), outer = radius + thickness, size = TAU / n;
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (!(mask & (1 << i))) continue;
    const a = i * size, b = (i + 1) * size;
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.lineTo(Math.cos(b) * outer, Math.sin(b) * outer);
    ctx.lineTo(Math.cos(b) * inner, Math.sin(b) * inner); ctx.closePath();
  }
  ctx.fill();
}
function triangle(angle, color, outline, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.save(); ctx.rotate(angle); ctx.translate(ORBIT, 0);
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5.5); ctx.lineTo(-5, 5.5); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  if (outline) { ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 0.8; ctx.stroke(); }
  ctx.restore(); ctx.globalAlpha = 1;
}
function mix(hex, amount) {
  const n = parseInt(hex.slice(1, 7), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
// Draw one arena into a viewport. `scene` holds the walls, players, and effects to show.
function drawArena(vp, scene, now) {
  const { palette, t, beat } = scene;
  ctx.save();
  ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
  const shake = scene.shakeAt ? Math.max(0, 1 - (now - scene.shakeAt) / 280) : 0;
  const sx = motionReduced ? 0 : Math.sin(now * 0.09) * 7 * shake, sy = motionReduced ? 0 : Math.cos(now * 0.11) * 7 * shake;
  ctx.translate(vp.x + vp.w / 2 + sx, vp.y + vp.h * 0.52 + sy);
  const pulse = motionReduced ? 1 : 1 + Math.exp(-(beat % 1) * 7) * 0.045;
  let zoom = Math.min(vp.w, vp.h) / 760 * pulse * (scene.zoom || 1);
  ctx.scale(zoom, zoom);
  // A slow tilt squashes the plane, so the arena feels like a floor seen at an angle.
  if (!motionReduced) ctx.scale(1, 0.86 + 0.08 * Math.sin(t * 0.35));
  ctx.rotate(motionReduced ? 0 : scene.rotation);
  const stage = Math.floor(t / 10) % palette.walls.length;
  const wall = palette.walls[stage];
  const flip = !motionReduced && Math.floor(beat / 4) % 2, n = scene.sides || 6, size = TAU / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1800, i * size, (i + 1) * size); ctx.closePath();
    // An odd side count gets a third shade, so two neighbours never match.
    ctx.fillStyle = n % 2 && i === n - 1 ? mix(palette.bg[0], 0.04) : palette.bg[(i + flip) % 2]; ctx.fill();
  }
  for (const w of scene.walls) drawWall(w.mask, w.radius, w.thickness, w.thickness > 120 ? mix(wall, 0.12) : wall, n);
  for (const k of scene.pickups || []) {
    if (k.radius * apothem(n) < ORBIT - 16) continue;
    const a = (k.sector + 0.5) * size, r = k.radius * hexFactor(a, n);
    ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(now / 300);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 90); hexPath(13); ctx.fill();
    ctx.globalAlpha = 1; hexPath(7); ctx.fill(); ctx.strokeStyle = wall; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  if (scene.fog) {
    const g = ctx.createRadialGradient(0, 0, 150, 0, 0, 260);
    g.addColorStop(0, palette.bg[0] + '00'); g.addColorStop(1, palette.bg[0]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1800, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, ORBIT, 0, TAU); ctx.strokeStyle = '#ffffff14'; ctx.lineWidth = 1; ctx.stroke();
  for (const p of scene.players) {
    let trail = trails.get(p.id);
    if (!trail) { trail = []; trails.set(p.id, trail); }
    if (p.alive && (!trail.length || now - trail[trail.length - 1].at > 16)) { trail.push({ angle: p.drawAngle, at: now }); if (trail.length > 15) trail.shift(); }
    if (!motionReduced && p.alive) {
      for (let j = 0; j < trail.length; j++) {
        if (now - trail[j].at > 300) continue;
        ctx.globalAlpha = j / trail.length * 0.22; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(Math.cos(trail[j].angle) * ORBIT, Math.sin(trail[j].angle) * ORBIT, 2.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const blink = p.invulnUntil > t && Math.floor(now / 70) % 2;
    triangle(p.drawAngle, p.color, p.outline, p.alive ? (blink ? 0.3 : 1) : 0.18);
    if (p.shield && p.alive) {
      ctx.beginPath(); ctx.arc(Math.cos(p.drawAngle) * ORBIT, Math.sin(p.drawAngle) * ORBIT, 12, 0, TAU);
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (p.lockUntil > t && p.alive) {
      ctx.save(); ctx.rotate(p.drawAngle); ctx.translate(ORBIT, 0); ctx.rotate(now / 120);
      ctx.strokeStyle = '#ff8a5d'; ctx.lineWidth = 2; hexPath(14); ctx.stroke(); ctx.restore();
    }
  }
  const centerPulse = motionReduced ? 1 : 1 + Math.exp(-(beat % 1) * 8) * 0.06;
  // After a shape change, the center grows back from a point.
  const grow = scene.shapeAt ? Math.min(1, (now - scene.shapeAt) / 350) : 1;
  hexPath(49 * centerPulse * (0.3 + 0.7 * grow), n); ctx.fillStyle = palette.center; ctx.fill(); ctx.strokeStyle = scene.edge || palette.edge; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}
// Battle HUD for one player, drawn in screen space at the top of its viewport.
function drawBattleHud(vp, p, rival, now, compact) {
  const s = state, pad = compact ? 8 : 22, top = vp.y + (compact ? 8 : 132);
  ctx.save(); ctx.textBaseline = 'top';
  const right = vp.x + vp.w - pad, left = vp.x + pad;
  ctx.font = `bold ${compact ? 10 : 12}px Consolas, monospace`; ctx.fillStyle = '#ffffffd0'; ctx.textAlign = 'left';
  ctx.fillText(p.name.toUpperCase(), left, top);
  for (let i = 0; i < MAX_HP; i++) {
    ctx.save(); ctx.translate(left + 6 + i * 18, top + 24); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i < p.hp ? p.color : '#ffffff20'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  }
  if (!compact) {
    ctx.fillStyle = '#ffffff20'; ctx.fillRect(left, top + 40, 80, 4);
    ctx.fillStyle = '#ffffffb0'; ctx.fillRect(left, top + 40, 80 * p.graze, 4);
    ctx.font = '9px Consolas, monospace'; ctx.fillStyle = '#ffffff70'; ctx.fillText('GRAZE', left, top + 48);
  }
  // Item slot
  const slotX = compact ? right - 70 : right - 150, slotY = top;
  ctx.textAlign = 'right'; ctx.font = `9px Consolas, monospace`; ctx.fillStyle = '#ffffff80';
  ctx.fillText('ITEM', right, slotY);
  ctx.font = `900 ${compact ? 14 : 24}px Arial, sans-serif`;
  ctx.fillStyle = p.item ? (ITEMS[p.item].kind === 'attack' ? '#ff8a5d' : '#7dffb0') : '#ffffff30';
  ctx.fillText(p.item ? ITEMS[p.item].label : '—', right, slotY + 14);
  if (p.item && !compact) {
    ctx.font = '9px Consolas, monospace'; ctx.fillStyle = '#ffffff90';
    const key = mode === 'local' ? (p.id === 'p1' ? 'W' : '↑') : '↑ / W / SPACE';
    ctx.fillText(`FIRE ${key}`, right, slotY + 42);
  }
  void slotX;
  // Incoming warning: an edge frame in the attacker's color, and the item name.
  if (p.incoming.length) {
    const flash = 0.5 + 0.5 * Math.sin(now / 60), from = s.players.find(o => o.id === p.incoming[0].from);
    ctx.strokeStyle = from?.color || '#ff5d6c'; ctx.globalAlpha = motionReduced ? 0.8 : 0.35 + 0.5 * flash; ctx.lineWidth = 6;
    ctx.strokeRect(vp.x + 3, vp.y + 3, vp.w - 6, vp.h - 6); ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = `900 ${compact ? 12 : 18}px Arial, sans-serif`; ctx.fillStyle = '#ff5d6c';
    const left2 = Math.max(0, p.incoming[0].at - s.t).toFixed(1);
    ctx.fillText(`INCOMING ${ITEMS[p.incoming[0].item].label} ${left2}`, vp.x + vp.w / 2, vp.y + vp.h - (compact ? 22 : 92));
    if (p.item && ITEMS[p.item].kind === 'attack' && !compact) {
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = '#ffffffc0';
      ctx.fillText('FIRE AN ATTACK NOW TO COUNTER', vp.x + vp.w / 2, vp.y + vp.h - 66);
    }
  }
  if (p.lockUntil > s.t && p.alive) {
    ctx.textAlign = 'center'; ctx.font = `900 ${compact ? 13 : 26}px Arial, sans-serif`; ctx.fillStyle = '#ff8a5d';
    ctx.fillText(`LOCKED · ${p.lockLast === 1 ? '←' : p.lockLast === -1 ? '→' : '← →'} ${LOCK_PRESSES - p.lockCount}`, vp.x + vp.w / 2, vp.y + vp.h * 0.5 + (compact ? 30 : 90));
  }
  if (p.mirrorUntil > s.t && p.alive && !compact) {
    ctx.textAlign = 'center'; ctx.font = '900 16px Arial, sans-serif'; ctx.fillStyle = '#ffc65c';
    ctx.fillText(`MIRROR ${(p.mirrorUntil - s.t).toFixed(1)}`, vp.x + vp.w / 2, vp.y + vp.h * 0.5 - 110);
  }
  const b = banners.get(p.id);
  if (b && b.until > now) {
    ctx.textAlign = 'center'; ctx.font = `900 ${compact ? 11 : 15}px Arial, sans-serif`; ctx.fillStyle = b.color;
    ctx.globalAlpha = Math.min(1, (b.until - now) / 300);
    ctx.fillText(b.text, vp.x + vp.w / 2, vp.y + (compact ? 30 : 160)); ctx.globalAlpha = 1;
  }
  if (rival && compact) { /* the inset shows only the rival's own status */ }
  ctx.restore();
}
function playerView(p, s, visualTime) {
  let angle = p.angle;
  if (mode === 'online') angle = p.id === myId ? predictedAngle : p.angle + (remoteVelocities.get(p.id) || 0) * visualTime;
  else if (s.phase === 'playing' && previousAngles.has(p.id) && !paused) {
    const previous = previousAngles.get(p.id);
    angle = previous + angleDelta(p.angle, previous) * Math.min(1, accumulator / STEP);
  }
  return { ...p, drawAngle: angle, outline: p.id === myId || mode === 'local' };
}
function arenaScene(s, index, players, now, visualTime) {
  const arena = s.arenas[index];
  const localRemainder = mode !== 'online' && s.phase === 'playing' && !paused ? STEP - accumulator : 0;
  const offset = mode === 'online' ? -arena.speed * visualTime : arena.speed * localRemainder;
  let rotation = arena.rotation;
  if (mode === 'online') rotation += (spinVelocities[index] || 0) * visualTime;
  else if (previousRotations[index] !== undefined && !paused) rotation = previousRotations[index] + angleDelta(arena.rotation, previousRotations[index]) * Math.min(1, accumulator / STEP);
  const dying = deathAt && players.some(p => !p.alive) ? Math.min(1, (now - deathAt) / 700) : 0;
  return {
    palette: roundPalette, t: Math.max(0, s.t), beat: sound.beat(now),
    walls: arena.walls.map(w => ({ mask: w.mask, thickness: w.thickness, radius: w.radius + offset })),
    pickups: (arena.pickups || []).map(k => ({ ...k, radius: k.radius + offset })),
    players, rotation, fog: arena.fogUntil > s.t, sides: arena.sides || 6, shapeAt: shapeChanges.get(index),
    zoom: 1 + (players.length === 1 && dying ? (1 - (1 - dying) ** 3) * 0.5 : 0),
    shakeAt: players.length === 1 ? shakes.get(players[0].id) : 0,
  };
}
function render(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  if (!state) { renderMenu(now); return; }
  const s = state;
  const visualTime = mode === 'online' && s.phase === 'playing' ? Math.min((now - receivedAt) / 1000, 0.1) : 0;
  const players = s.players.map(p => playerView(p, s, visualTime));
  if (!battle) {
    drawArena({ x: 0, y: 0, w: width, h: height }, arenaScene(s, 0, players, now, visualTime), now);
    return;
  }
  if (mode === 'local') {
    const half = width / 2;
    players.forEach((p, i) => {
      const vp = { x: i * half, y: 0, w: half, h: height };
      drawArena(vp, { ...arenaScene(s, p.arena, [p], now, visualTime), edge: p.color }, now);
      drawBattleHud(vp, p, players[1 - i], now, false);
    });
    ctx.fillStyle = '#000'; ctx.fillRect(half - 1.5, 0, 3, height);
    return;
  }
  const me = players.find(p => p.id === myId) || players[0];
  const rival = players.find(p => p !== me);
  const main = { x: 0, y: 0, w: width, h: height };
  drawArena(main, { ...arenaScene(s, me.arena, [me], now, visualTime), edge: me.color }, now);
  drawBattleHud(main, me, rival, now, false);
  if (rival) {
    const w = Math.max(150, Math.min(width, height) * 0.3), inset = { x: width - w - 14, y: height - w * 0.75 - 14, w, h: w * 0.75 };
    ctx.fillStyle = '#000'; ctx.fillRect(inset.x - 2, inset.y - 2, inset.w + 4, inset.h + 4);
    drawArena(inset, { ...arenaScene(s, rival.arena, [rival], now, visualTime), edge: rival.color }, now);
    drawBattleHud(inset, rival, me, now, true);
  }
}
function renderMenu(now) {
  const e = entry();
  // The arena turns one sector for each entry; a slow spin keeps it alive.
  const target = entryIndex * SECTOR + (motionReduced ? 0 : demoTime * 0.25);
  menuRotation += angleDelta(target, menuRotation) * (motionReduced ? 1 : 0.12);
  const walls = [];
  for (let i = 0; i < 6; i++) {
    const radius = 110 + ((i * 130 - demoTime * (motionReduced ? 15 : 70)) % 780 + 780) % 780;
    const gap = (i * 2 + Math.floor(demoTime / 9) + entryIndex) % 6;
    walls.push({ mask: 63 ^ (1 << gap) ^ (1 << ((gap + 1) % 6)), thickness: 26, radius });
  }
  const players = [];
  if (view === 'room' && room) room.players.forEach((p, i) => players.push({ id: `room-${p.id}`, color: p.color, alive: true, drawAngle: demoTime * 0.6 + i * TAU / room.players.length, outline: p.id === myId }));
  else players.push({ id: 'demo', color: COLORS[0], alive: true, drawAngle: Math.PI / 2 + Math.sin(demoTime * 1.3) * 0.6, outline: true });
  const lift = view === 'room' ? 0.42 : view === 'online' ? 0.3 : 0.14;
  drawArena({ x: 0, y: -height * lift, w: width, h: height * (1 + lift) }, {
    palette: e.palette, t: demoTime, beat: sound.beat(now), walls, players, rotation: menuRotation, zoom: 1.08,
  }, now);
}

// ---------------------------------------------------------------- frame loop
// ?autoplay lets the bot fly solo runs: a demo, and a way to check later stages by eye.
const autoplay = new URLSearchParams(location.search).has('autoplay');
function stepLocal(inputs) {
  if (autoplay && mode === 'solo') inputs.p1 = botInput(state, state.players[0], 1).dir;
  if (mode === 'cpu') {
    const cpu = state.players[1];
    inputs.p2 = botInput(state, cpu, 0.42);
  }
  for (const id of firePressed) {
    const dir = typeof inputs[id] === 'object' ? inputs[id].dir : inputs[id] || 0;
    inputs[id] = { dir, fire: true };
  }
  firePressed.clear();
  for (const p of state.players) previousAngles.set(p.id, p.angle);
  state.arenas.forEach((a, i) => { previousRotations[i] = a.rotation; });
  stepRound(state, inputs);
}
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  if (!document.hidden) {
    pollPadFire();
    if (state && state.phase !== 'finished') {
      const inputs = directions();
      if (mode === 'online') {
        const direction = inputs[myId] || 0;
        if (direction !== lastDirection || now - lastInputAt > 100) {
          send({ type: 'input', direction, seq: ++inputSeq }); lastInputAt = now; lastDirection = direction;
        }
        for (const id of firePressed) if (id === myId) send({ type: 'fire', seq: ++fireSeq });
        firePressed.clear();
        const own = state.players.find(p => p.id === myId);
        if (state.phase === 'playing' && own?.alive) {
          const adjust = correction * Math.min(1, dt * 10); correction -= adjust;
          let dir = direction;
          if (own.mirrorUntil > state.t) dir = -dir;
          if (own.lockUntil > state.t) dir = 0;
          const next = wrap(predictedAngle + dir * TURN_SPEED * dt + adjust);
          // Predict side contact against the walls of our own arena.
          const arena = state.arenas[own.arena], vt = Math.min((now - receivedAt) / 1000, 0.1);
          const blocked = own.invulnUntil <= state.t && arena.walls.some(w => collides(next, { ...w, radius: w.radius - arena.speed * vt }, arena.sides || 6));
          if (!blocked) predictedAngle = next;
        }
        if (now - lastPingAt > 2000) { send({ type: 'ping', at: now }); lastPingAt = now; }
      } else if (!paused) {
        accumulator += dt;
        while (accumulator >= STEP && state.phase !== 'finished') { stepLocal({ ...inputs }); accumulator -= STEP; }
        handleEvents();
      }
      sound.fallbackBeat(now);
      if (battle && state) {
        const me = state.players.find(p => p.id === myId);
        sound.setDanger(me && me.alive && (me.hp <= 1 || me.incoming.length || speedSteps(state) > 10) ? 0.9 : 0);
      }
      if (state.phase === 'finished') showResults();
    } else if (!state || view !== 'playing') demoTime += dt;
    if (now - lastHUD > 50) { updateHUD(); lastHUD = now; }
    render(now);
    frames++;
    if (now - fpsAt >= 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - fpsAt))} FPS`; frames = 0; fpsAt = now; }
  }
  requestAnimationFrame(frame);
}

$('playerName').value = store.get('name', 'Player');
refreshSettings(); refreshEntry(); resize();
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^[A-Z2-9]{5}$/i.test(inviteCode)) {
  entryIndex = ENTRIES.findIndex(e => e.id === 'online'); refreshEntry(); mode = 'online'; setView('online');
  $('roomCode').value = inviteCode.toUpperCase();
}
requestAnimationFrame(frame);
