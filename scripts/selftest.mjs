// Runs demos 1-3 headless and checks their security outcomes. Used locally and in CI.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../lib/common.mjs';

const runDemo = (rel, args = []) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, rel), ...args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 240_000,
  });
  return (r.stdout ?? '') + (r.stderr ?? '');
};
const row = (out, label) => out.split('\n').find((l) => l.includes(label) && /[✔✖⚠]/.test(l) && !l.includes('[proxy]')) ?? '';
const cols = (line) => line.split(/\s{3,}/).map((s) => s.trim()).filter(Boolean);

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
};

// Demo 1: every attack blocked inside MXC, the real job still done, nothing received.
const d1 = runDemo('demos/01-blast-radius/run.mjs');
for (const label of ['Read ~/.ssh', 'Read ~/.cf', 'Read ./.env', 'Read $AICORE', 'Append to ~/.bashrc', 'Send the loot']) {
  const c = cols(row(d1, label));
  check(`demo1 · ${label} blocked inside MXC`, c[2]?.startsWith('✔ blocked'), row(d1, label));
  check(`demo1 · ${label} succeeds without a sandbox (control)`, c[1]?.startsWith('✖'), row(d1, label));
}
check('demo1 · build artifact written inside MXC', cols(row(d1, 'Write ./build'))[2]?.startsWith('✔ done'), row(d1, 'Write ./build'));
check('demo1 · attacker received 0 bytes with MXC', /0 bytes with MXC/.test(d1), d1.split('\n').find((l) => l.includes('Attacker received')) ?? '');

// Demo 2: proxy is the only way out; allowlisted internal API works with an injected credential.
const d2 = runDemo('demos/02-egress-allowlist/run.mjs');
check('demo2 · internal SAP API reachable through the proxy', cols(row(d2, 'internal SAP API'))[2]?.includes('business partners'), row(d2, 'internal SAP API'));
check('demo2 · credential never inside the sandbox', cols(row(d2, 'SAP credential'))[2]?.startsWith('✔'), row(d2, 'SAP credential'));
check('demo2 · pastebin blocked by the proxy', cols(row(d2, 'pastebin'))[2]?.startsWith('✔ blocked'), row(d2, 'pastebin'));
check('demo2 · direct connection blocked inside MXC', cols(row(d2, 'Skip the proxy'))[2]?.startsWith('✔ blocked'), row(d2, 'Skip the proxy'));
check('demo2 · direct connection bypasses the proxy without MXC (control)', cols(row(d2, 'Skip the proxy'))[1]?.startsWith('✖ bypassed the proxy'), row(d2, 'Skip the proxy'));
const gh = cols(row(d2, 'api.github.com'))[2] ?? '';
if (!gh.startsWith('✔')) console.log(`INFO  demo2 · api.github.com not reached (${gh}); needs internet access`);

// Demo 3: the injected command is blocked; the bug still gets fixed.
const d3 = runDemo('demos/03-own-agent/agent.mjs');
check('demo3 · attacker received 0 bytes', /attacker received 0 bytes/.test(d3), d3.split('\n').slice(-3).join(' | '));
check('demo3 · tests pass after the fix', /3 tests passed/.test(d3));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exitCode = failed ? 1 : 0;
