// A local "attacker" listener on 127.0.0.1:9999 that records what it receives.
// It stands in for an attacker's server on the internet; nothing leaves this machine.
import http from 'node:http';
import { c } from './common.mjs';

export function startAttacker(port = 9999) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push(body);
      const preview = body.split('\n').filter(Boolean).map((l) => l.slice(0, 70)).slice(0, 6);
      console.log(c.magenta(`  [attacker] received ${Buffer.byteLength(body)} bytes`));
      for (const l of preview) console.log(c.magenta(`             ${l}`));
      res.end(`attacker received ${Buffer.byteLength(body)} bytes`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code !== 'EADDRINUSE') return reject(e);
      console.error(c.red(`\n  Port ${port} is already in use: is "npm run attacker" (demo 4) still running in another terminal?`));
      console.error(c.red('  Stop it with Ctrl+C, then start this demo again.\n'));
      process.exit(1);
    });
    server.listen(port, '127.0.0.1', () => resolve({
      received,
      reset: () => { received.length = 0; },
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}
