import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Install Node.js 22 or newer from https://nodejs.org/ and try again.');
  process.exit(1);
}
const { createGameServer } = await import('../server.mjs');
const port = Number(process.env.PORT || 8080), host = process.env.HOST || '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a whole number between 1 and 65535.'); process.exit(1);
}
const game = createGameServer();
game.server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the other server or set PORT to another number.` : e.message);
  process.exit(1);
});
game.server.listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`\nHEX RELAY\n\nOpen ${url}\nKeep this window open. Ctrl+C stops the game server.\n`);
  for (const addresses of Object.values(networkInterfaces())) for (const a of addresses || []) {
    if (a.family === 'IPv4' && !a.internal && host !== '127.0.0.1') console.log(`LAN invite address: http://${a.address}:${port}`);
  }
  const command = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const browser = spawn(command[0], command[1], { stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log(`Open ${url} in your browser to play.`));
  browser.unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
