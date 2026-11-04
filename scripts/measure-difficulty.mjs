// Measures how demanding each difficulty is, with bots. Usage: node scripts/measure-difficulty.mjs [seconds] [seeds]
import { createRound, stepRound, botInput, STEP } from '../public/engine.mjs';

const seconds = Number(process.argv[2] || 120), seeds = Number(process.argv[3] || 12);
const player = [{ id: 'a', name: 'A' }];

// A late bot knows a wall only `lag` seconds after it comes into view (radius VIEW), like a human.
const VIEW = 400;
function run(difficulty, seed, lag) {
  const s = createRound(player, seed, difficulty, 0), p = s.players[0], seenAt = new Map();
  let turning = 0, steps = 0, idle = 0, longestIdle = 0;
  while (p.alive && s.t < seconds) {
    const view = { ...s, arenas: s.arenas.map(a => ({ ...a, walls: a.walls.filter(w => {
      if (w.radius < VIEW && !seenAt.has(w.id + ':' + a.sides)) seenAt.set(w.id + ':' + a.sides, s.t);
      return s.t - (seenAt.get(w.id + ':' + a.sides) ?? Infinity) >= lag;
    }) })) };
    const input = botInput(view, p, 1);
    stepRound(s, { a: input });
    steps++; if (input.dir) { turning++; idle = 0; } else longestIdle = Math.max(longestIdle, idle += STEP);
  }
  return { time: p.survived, turning: turning / steps, longestIdle };
}
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const difficulty of ['normal', 'hard', 'hyper']) {
  for (const lag of [0, 0.25]) {
    const runs = Array.from({ length: seeds }, (_, i) => run(difficulty, i + 1, lag));
    console.log(`${difficulty.padEnd(6)} ${lag ? 'late ' : 'exact'}  median ${median(runs.map(r => r.time)).toFixed(1).padStart(5)} s` +
      `  turning ${(100 * median(runs.map(r => r.turning))).toFixed(0)}%  longest rest ${median(runs.map(r => r.longestIdle)).toFixed(2)} s` +
      `  times ${runs.map(r => r.time.toFixed(0)).join(' ')}`);
  }
}
