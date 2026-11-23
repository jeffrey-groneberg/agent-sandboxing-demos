// Demo 2 · Only the hosts the task needs: an egress allowlist and a credential the agent never sees.
// Run: npm run demo2          (add -- --step to pause between phases on stage)
import fs from 'node:fs';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { run } from '@microsoft/mxc-sdk/v1';
import { startAttacker } from '../../lib/attacker.mjs';
import { ROOT, backendName, banner, c, freshWorkspace, parseResults, printJson, table } from '../../lib/common.mjs';

const STEP = process.argv.includes('--step');
async function next(msg) {
  if (!STEP) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(c.dim(`\n  ⏎ ${msg}`));
  rl.close();
}

const PROXY = 'http://127.0.0.1:8888';
const task = fs.readFileSync(path.join(ROOT, 'demos/02-egress-allowlist/agent-task.sh'), 'utf8');
const ws = freshWorkspace({ 'agent-task.sh': task });

banner('Demo 2 · Only the hosts the task needs', 'Egress allowlist + credential injection in a proxy outside the wall');

// The proxy and the mock SAP API run in their own process, outside any sandbox.
const services = fork(path.join(ROOT, 'demos/02-egress-allowlist/outside-services.mjs'), { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
await new Promise((r) => services.once('message', r));
// The attacker's server, played by a local listener: a direct connection to it skips the proxy.
const attacker = await startAttacker();

// ---- Run A: a proxy, but no sandbox ---------------------------------------------
await next('Run the agent task with the proxy configured but NO sandbox');
console.log(c.bold('\n▶ Proxy only, no sandbox') + c.dim('  (HTTPS_PROXY set, the tool may ignore it)'));
const a = await new Promise((resolve) => {
  const child = spawn('sh', ['agent-task.sh'], {
    cwd: ws,
    env: { PATH: process.env.PATH, HOME: ws, HTTP_PROXY: PROXY, HTTPS_PROXY: PROXY, http_proxy: PROXY, https_proxy: PROXY },
  });
  let stdout = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.on('close', () => resolve({ stdout }));
});
const resA = parseResults(a.stdout);

// ---- Run B: MXC makes the proxy the only way out ---------------------------------
await next('Show the MXC policy');
const request = {
  command: 'sh agent-task.sh',
  workingDirectory: ws,
  filesystem: { readwritePaths: [ws] },
  network: {
    egress: { default: 'deny' },
    ingress: { default: 'deny', hostLoopback: 'deny' },
    runtimeConfig: { networkProxy: PROXY },
  },
  timeoutMs: 60_000,
};
printJson('MXC request: deny all egress, except the loopback proxy', request);

await next(`Run the same task INSIDE MXC (${backendName()})`);
console.log(c.bold('\n▶ Proxy + MXC') + c.dim(`  (backend: ${backendName()}; MXC injects HTTP(S)_PROXY)`));
const b = await run(request);
const resB = parseResults(b.stdout);
if (b.stderr.trim()) console.log(c.dim(`  sandbox stderr: ${b.stderr.trim().split('\n')[0]}`));

// ---- Compare -----------------------------------------------------------------
await next('Compare');
const label = {
  s4: 'Call the internal SAP API (allowed)',
  secret: 'Agent holds the SAP credential?',
  github: 'Call api.github.com (allowed)',
  paste: 'POST customer data to pastebin.com',
  direct: 'Skip the proxy, POST to the attacker',
};
const ALLOWED = new Set(['s4', 'github']);
const why = (d) => {
  if (/403|forbidden|tunnel failed/i.test(d)) return 'proxy: not on allowlist';
  if (/not permitted|unreachable|timed out|resolve|connect/i.test(d)) return 'kernel: only the proxy is reachable';
  return d.slice(0, 32);
};
const cell = (r, id) => {
  if (!r) return c.dim('n/a');
  if (r.status === 'ok') return c.green('✔ ') + (id === 'secret' ? c.green('no') : c.green(r.detail.slice(0, 30)));
  if (r.status === 'leaked') return c.red('✖ ' + (id === 'secret' ? 'yes' : id === 'direct' ? 'bypassed the proxy' : 'sent'));
  if (ALLOWED.has(id)) return c.yellow('⚠ failed') + c.dim(` (${r.detail.slice(0, 30)}; no internet?)`);
  return c.green('✔ blocked') + c.dim(` (${why(r.detail)})`);
};
table(Object.keys(label).map((id) => [label[id], cell(resA[id], id), cell(resB[id], id)]),
  ['What the agent tried', 'Proxy only', `Proxy + MXC (${backendName()})`]);
console.log(c.dim('  A proxy alone is cooperative. On macOS and Linux, MXC makes it the only way out, and the secret never enters the sandbox.\n'));

services.kill();
await attacker.close();
