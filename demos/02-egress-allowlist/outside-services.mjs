// The "outside the wall" services for demo 2, run as their own process:
//  - an egress proxy on 127.0.0.1:8888 with a hostname allowlist that injects credentials
//  - a mock SAP OData API on 127.0.0.1:4004 that requires those credentials
// The sandboxed agent can reach only the proxy; it never sees the credential.
import http from 'node:http';
import net from 'node:net';

const PROXY_PORT = 8888;
const API_PORT = 4004;
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const log = (ok, what) => console.log(col(ok ? '32' : '31', `  [proxy] ${ok ? 'ALLOW' : 'DENY '} ${what}`));

// Policy lives here, outside the sandbox. Secrets too.
const ALLOW = new Set(['registry.npmjs.org', 'api.github.com', 's4.demo.internal']);
const INTERNAL = { 's4.demo.internal': { host: '127.0.0.1', port: API_PORT } };
const S4_AUTH = 'Basic ' + Buffer.from('DEMO_USER:DEMO-ONLY-fake-password').toString('base64');

// ---- Mock SAP S/4HANA OData service (fake data) ----------------------------------------
const api = http.createServer((req, res) => {
  if (req.headers.authorization !== S4_AUTH) {
    res.writeHead(401, { 'content-type': 'text/plain' });
    return res.end('401 Unauthorized: no valid credentials\n');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ d: { results: [
    { BusinessPartner: '1000001', BusinessPartnerFullName: 'Demo Bikes Ltd.' },
    { BusinessPartner: '1000002', BusinessPartnerFullName: 'Sample Trading Co.' },
  ] } }) + '\n');
});
api.listen(API_PORT, '127.0.0.1');

// ---- Egress proxy -----------------------------------------------------------------------
const proxy = http.createServer((req, res) => {
  // Plain HTTP through the proxy: absolute URL in req.url
  let url;
  try { url = new URL(req.url); } catch { res.writeHead(400); return res.end('bad request\n'); }
  if (!ALLOW.has(url.hostname)) {
    log(false, `${req.method} ${url.hostname}  (not on the allowlist)`);
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end(`403 blocked by egress policy: ${url.hostname}\n`);
  }
  const target = INTERNAL[url.hostname] ?? { host: url.hostname, port: url.port || 80 };
  const headers = { ...req.headers, host: url.host };
  delete headers['proxy-connection'];
  let note = '';
  if (url.hostname === 's4.demo.internal') {
    headers.authorization = S4_AUTH; // injected here; the sandbox never had it
    note = '  + injected credential';
  }
  log(true, `${req.method} ${url.hostname}${url.pathname}${note}`);
  const up = http.request({ ...target, path: url.pathname + url.search, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(`502 ${e.message}\n`); });
  req.pipe(up);
});

// HTTPS through the proxy: CONNECT host:port, then a blind tunnel
proxy.on('connect', (req, socket, head) => {
  socket.on('error', () => {});
  const [host, port] = req.url.split(':');
  if (!ALLOW.has(host)) {
    log(false, `CONNECT ${host}:${port}  (not on the allowlist)`);
    socket.end('HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\nblocked by egress policy\n');
    return;
  }
  log(true, `CONNECT ${host}:${port}`);
  const up = net.connect(Number(port) || 443, host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  socket.on('close', () => up.destroy());
});
proxy.on('clientError', (err, socket) => socket.destroy());

proxy.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(col('2', `  [proxy] listening on 127.0.0.1:${PROXY_PORT} · allowlist: ${[...ALLOW].join(', ')}`));
  if (process.send) process.send('ready');
});
