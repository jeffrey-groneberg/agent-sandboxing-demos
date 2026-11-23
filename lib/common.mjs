// Shared helpers for the demos: paths, fake secrets, terminal output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEMO_HOME = path.join(ROOT, '.demo-home');
export const WORKSPACE = path.join(ROOT, '.demo-workspace');

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'),
  yellow: paint('33'), cyan: paint('36'), magenta: paint('35'),
};

export function banner(title, subtitle = '') {
  const line = '─'.repeat(Math.max(title.length, subtitle.length) + 4);
  console.log(`\n${c.cyan(line)}\n  ${c.bold(title)}${subtitle ? `\n  ${c.dim(subtitle)}` : ''}\n${c.cyan(line)}`);
}

export function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// The backend that MXC's "process" containment resolves to on this host.
export function backendName() {
  if (process.platform === 'darwin') return 'Seatbelt';
  if (process.platform === 'linux') return 'Bubblewrap';
  if (process.platform === 'win32') return 'ProcessContainer';
  return 'unsupported';
}

// Symlink-free paths: Seatbelt resolves /tmp -> /private/tmp, Bubblewrap rejects '..'.
export function real(p) {
  return fs.realpathSync(p);
}

// Plant obviously fake credentials in a demo home folder. Nothing here is a real secret.
export function plantFakeSecrets() {
  const files = {
    '.ssh/id_ed25519': [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'DEMO-ONLY-THIS-IS-NOT-A-REAL-KEY-b3BlbnNzaC1rZXktdjEAAAAABG5vbmU',
      '-----END OPENSSH PRIVATE KEY-----',
      '',
    ].join('\n'),
    '.cf/config.json': JSON.stringify({
      Target: 'https://api.cf.example.invalid',
      AccessToken: 'bearer DEMO-ONLY-fake-cf-access-token',
      RefreshToken: 'DEMO-ONLY-fake-cf-refresh-token',
    }, null, 2) + '\n',
    '.bashrc': '# demo shell profile\n',
  };
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(DEMO_HOME, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: rel.startsWith('.ssh') ? 0o600 : 0o644 });
  }
  return real(DEMO_HOME);
}

// A fresh project folder that the agent is allowed to work in.
export function freshWorkspace(extraFiles = {}) {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORKSPACE, 'build'), { recursive: true });
  const files = {
    'package.json': JSON.stringify({ name: 'bookshop', version: '1.0.0', private: true }, null, 2) + '\n',
    '.env': 'AICORE_CLIENT_SECRET=DEMO-ONLY-fake-client-secret\n',
    ...extraFiles,
  };
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(WORKSPACE, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
  }
  return real(WORKSPACE);
}

// A fake secret in the caller's environment, as a developer shell often has.
export const FAKE_ENV_SECRET = {
  AICORE_SERVICE_KEY: '{"clientid":"DEMO-ONLY","clientsecret":"DEMO-ONLY-fake-service-key"}',
};

// Print a request or policy with local paths shortened for the screen.
export function printJson(label, value) {
  console.log(c.dim(`\n${label}`));
  const text = JSON.stringify(value, null, 2)
    .replaceAll(real(ROOT), '<repo>')
    .replaceAll(os.homedir(), '~');
  console.log(text.split('\n').map((l) => `  ${c.yellow(l)}`).join('\n'));
}

// Parse "RESULT|id|status|detail" lines printed by the payload scripts.
export function parseResults(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^RESULT\|([^|]+)\|([^|]+)\|(.*)$/);
    if (m) out[m[1]] = { status: m[2], detail: m[3].trim() };
  }
  return out;
}

export function table(rows, headers) {
  const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
  const widths = headers.map((h, i) => Math.max(strip(h).length, ...rows.map((r) => strip(r[i]).length)));
  const fmt = (cells) => cells.map((cell, i) => String(cell) + ' '.repeat(widths[i] - strip(cell).length)).join('   ');
  console.log('\n  ' + c.bold(fmt(headers)));
  console.log('  ' + c.dim(widths.map((w) => '─'.repeat(w)).join('   ')));
  for (const r of rows) console.log('  ' + fmt(r));
  console.log('');
}
