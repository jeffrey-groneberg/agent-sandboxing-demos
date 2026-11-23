// Demo 1 · Blast radius: the same install script, without and with MXC.
// Run: npm run demo1          (add -- --step to pause between phases on stage)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { run } from '@microsoft/mxc-sdk/v1';
import {
  ROOT, FAKE_ENV_SECRET, backendName, banner, c, freshWorkspace, parseResults,
  plantFakeSecrets, printJson, table,
} from '../../lib/common.mjs';
import { startAttacker } from '../../lib/attacker.mjs';

const STEP = process.argv.includes('--step');
async function next(msg) {
  if (!STEP) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(c.dim(`\n  ⏎ ${msg}`));
  rl.close();
}

// The developer's shell has a secret in its environment, like many real shells do.
Object.assign(process.env, FAKE_ENV_SECRET);

const home = plantFakeSecrets();
const script = fs.readFileSync(path.join(ROOT, 'demos/01-blast-radius/postinstall.sh'), 'utf8');
const ws = freshWorkspace({ 'node_modules/left-padder/postinstall.sh': script });
const scriptPath = path.join(ws, 'node_modules/left-padder/postinstall.sh');
const attacker = await startAttacker();

banner('Demo 1 · Blast radius', 'One install script, run by an agent: first as-is, then inside MXC');

// ---- Run A: no sandbox ---------------------------------------------------------
await next('Run the install script WITHOUT a sandbox');
console.log(c.bold('\n▶ Without a sandbox') + c.dim('  (plain child process, your user rights)'));
const a = await new Promise((resolve) => {
  const child = spawn('sh', [scriptPath], { cwd: ws, env: { ...process.env, HOME: home } });
  let stdout = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.on('close', () => resolve({ stdout }));
});
const resA = parseResults(a.stdout);
const bytesA = attacker.received.reduce((n, b) => n + Buffer.byteLength(b), 0);

// ---- Run B: MXC --------------------------------------------------------------
await next('Show the MXC policy');
const request = {
  command: `sh ${scriptPath}`,
  workingDirectory: ws,
  // Same HOME as run A, so the script tries exactly the same paths.
  environment: { HOME: home },
  inheritDefaultEnvironment: true,
  filesystem: {
    readwritePaths: [ws],
    deniedPaths: [path.join(ws, '.env')],
  },
  network: {
    egress: { default: 'deny' },
    ingress: { default: 'deny', hostLoopback: 'deny' },
  },
  timeoutMs: 30_000,
};
printJson('MXC request (typed Node SDK, @microsoft/mxc-sdk/v1 run())', request);

await next(`Run the same script INSIDE MXC (${backendName()})`);
console.log(c.bold(`\n▶ Inside MXC`) + c.dim(`  (backend: ${backendName()})`));
attacker.reset();
const b = await run(request);
const resB = parseResults(b.stdout);
const bytesB = attacker.received.reduce((n, x) => n + Buffer.byteLength(x), 0);
if (b.stderr.trim()) console.log(c.dim(`  sandbox stderr: ${b.stderr.trim().split('\n')[0]}`));
for (const w of b.warnings) console.log(c.dim(`  warning: ${w}`));

// ---- Compare -----------------------------------------------------------------
await next('Compare');
const label = {
  ssh: 'Read ~/.ssh/id_ed25519',
  cf: 'Read ~/.cf/config.json (Cloud Foundry tokens)',
  dotenv: 'Read ./.env (inside the project!)',
  envvar: 'Read $AICORE_SERVICE_KEY from the environment',
  persist: 'Append to ~/.bashrc',
  work: 'Write ./build/output.txt (the real job)',
  exfil: 'Send the loot to the attacker',
};
// Short reasons for the screen; the raw error stays in the payload output.
const why = (detail) => {
  if (/not permitted|permission denied/i.test(detail)) return 'denied by the OS';
  if (/no such file/i.test(detail)) return 'not visible in the sandbox';
  if (/read-only/i.test(detail)) return 'read-only';
  if (/empty file/i.test(detail)) return 'masked by policy';
  if (/not present/i.test(detail)) return 'not inherited';
  if (/connect|resolve|network|timed out/i.test(detail)) return 'no network';
  return detail.slice(0, 28);
};
const cell = (r, id) => {
  if (!r) return c.dim('n/a');
  if (r.status === 'leaked') return c.red('✖ ' + (id === 'exfil' ? 'SENT' : id === 'persist' ? 'WRITTEN' : 'LEAKED'));
  if (r.status === 'ok') return c.green('✔ done');
  return c.green('✔ blocked') + c.dim(` (${why(r.detail)})`);
};
table(Object.keys(label).map((id) => [label[id], cell(resA[id], id), cell(resB[id], id)]),
  ['What the script tried', 'Without sandbox', `With MXC (${backendName()})`]);
console.log(`  Attacker received: ${c.red(bytesA + ' bytes')} without sandbox · ${bytesB ? c.red(bytesB + ' bytes') : c.green('0 bytes')} with MXC\n`);

await attacker.close();
process.exitCode = 0;
