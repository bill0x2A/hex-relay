// Builds PLAY-OFFLINE.html: one file with the styles, simulation, client, and (by default) the audio.
// Usage: node scripts/build-offline.mjs [--no-audio]
import { readFile, writeFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [html, css, engine, client, icon] = await Promise.all(['public/index.html', 'public/style.css', 'public/engine.mjs', 'public/client.mjs', 'public/icon.svg'].map(read));

const engineCode = engine.replace(/^export /gm, '');
const clientCode = client.replace(/^import [^;]+ from '\.\/engine\.mjs';\n/m, '');
if (clientCode === client) throw new Error('client.mjs no longer imports engine.mjs in the expected form.');

let audio = {};
if (!process.argv.includes('--no-audio')) {
  const types = { mp3: 'audio/mpeg', wav: 'audio/wav', json: 'application/json' };
  try {
    for (const name of (await readdir(new URL('public/audio/', root))).sort()) {
      const ext = /^[a-z0-9-]+\.(mp3|wav|json)$/.exec(name)?.[1];
      if (!ext) continue;
      const data = await readFile(new URL(`public/audio/${name}`, root));
      audio[`audio/${name}`] = `data:${types[ext]};base64,${data.toString('base64')}`;
    }
  } catch { audio = {}; }
}

const script = `${Object.keys(audio).length ? `globalThis.HEX_AUDIO = ${JSON.stringify(audio)};\n` : ''}${engineCode}\n${clientCode}`;
// A function replacer keeps "$" sequences in the code from being read as replacement patterns.
const out = html
  .replace('<link rel="icon" href="/icon.svg" type="image/svg+xml">', () => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon.trim())}">`)
  .replace('<link rel="stylesheet" href="/style.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="/client.mjs"></script>', () => `<script type="module">\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`);
for (const marker of ['/style.css', '/client.mjs']) if (out.includes(`"${marker}"`)) throw new Error(`Could not inline ${marker}.`);
await writeFile(new URL('PLAY-OFFLINE.html', root), out);
console.log(`PLAY-OFFLINE.html: ${(out.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(audio).length} audio files embedded.`);
