// Builds dist/: a static copy of the game for GitHub Pages, with online rooms turned off.
// Usage: node scripts/build-pages.mjs
import { cp, readFile, writeFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url), dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await cp(new URL('public/', root), dist, { recursive: true });
// Pages serves the site under /<repo>/, so every path must be relative.
let html = await readFile(new URL('index.html', dist), 'utf8');
const swaps = [['href="/icon.svg"', 'href="icon.svg"'], ['href="/style.css"', 'href="style.css"'],
  ['<script type="module" src="/client.mjs"></script>', '<script src="static.js"></script>\n  <script type="module" src="client.mjs"></script>']];
for (const [from, to] of swaps) {
  if (!html.includes(from)) throw new Error(`index.html no longer contains ${from}`);
  html = html.replace(from, to);
}
await writeFile(new URL('index.html', dist), html);
// A separate file, so a strict Content-Security-Policy never has to allow inline script.
await writeFile(new URL('static.js', dist), 'globalThis.HEX_STATIC = true;\n');
await writeFile(new URL('.nojekyll', dist), '');
console.log('dist/ is ready for GitHub Pages.');
