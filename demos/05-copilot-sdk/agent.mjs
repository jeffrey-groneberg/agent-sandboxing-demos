// Demo 5 · Your own agent, built with the Microsoft Copilot SDK (formerly GitHub Copilot SDK).
// The agent runs the tests of demo 4's bookshop project; its "telemetry" dependency probes credential
// locations and phones home. One session option, permissions.sandbox, runs the agent's shell commands
// inside the same sandbox that GitHub Copilot CLI uses. The sandbox setting is experimental in the SDK.
// Run: npm run demo5 -- --unsafe   (no sandbox: the problem)
//      npm run demo5               (permissions.sandbox: the fix)
// Needs a GitHub Copilot sign-in: the SDK uses the same login as GitHub Copilot CLI (copilot login),
// or a token with GitHub Copilot access in COPILOT_GITHUB_TOKEN.
import path from 'node:path';
import { CopilotClient, approveAll } from '@microsoft/copilot-sdk';
import { ROOT, banner, c } from '../../lib/common.mjs';
import { startAttacker } from '../../lib/attacker.mjs';
import { DEVCONTAINER_NODE_MODULES, IN_CODESPACE, plantCodespaceCredentials, writeBookshop } from '../../lib/bookshop.mjs';

const UNSAFE = process.argv.includes('--unsafe');
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : undefined;
const TASK = 'Run npm test in this project and show me the raw output.';

const APP = path.join(ROOT, '.demo5', 'bookshop');
writeBookshop(APP);
plantCodespaceCredentials();

// ----------------------------------------------------------------------------------
// The only sandbox code this agent needs: one session option.
const sandbox = {
  enabled: true,
  userPolicy: {
    filesystem: { deniedPaths: [path.join(APP, 'default-env.json')] },  // the project's SAP service key file
    network: { allowLocalNetwork: false },                              // nothing reaches 127.0.0.1:9999
  },
};
// ----------------------------------------------------------------------------------
// In the dev container, npm is a symlink into this folder: grant it read-only, nothing more.
if (IN_CODESPACE) sandbox.userPolicy.filesystem.readonlyPaths = [DEVCONTAINER_NODE_MODULES];

const attacker = await startAttacker(9999, { reuseRunning: true });
banner('Demo 5 · Your own agent, built with the Microsoft Copilot SDK',
  UNSAFE ? 'UNSAFE: the agent\'s shell commands run directly on this machine'
    : 'permissions.sandbox: the agent\'s shell commands run inside the sandbox');
console.log(`  Project   ${c.cyan(path.relative(process.cwd(), APP) || APP)} ${c.dim('(demo 4\'s project with the poisoned dependency)')}`);
if (!UNSAFE) {
  console.log(`  Policy    ${c.yellow('deniedPaths')} default-env.json · ${c.yellow('allowLocalNetwork')} false`);
}
if (!attacker) console.log(c.dim('  Attacker  already listening on 127.0.0.1:9999 in your other terminal: watch it there'));
console.log(`  Task      ${c.dim(`"${TASK}"`)}\n`);

let telemetry = '';
let ranTests = false;
const client = new CopilotClient({ mode: 'coding-agent' });
try {
  await client.start();
  const session = await client.createSession({
    workingDirectory: APP,
    ...(MODEL ? { model: MODEL } : {}),
    permissions: {
      onRequest: approveAll,                          // demo only: approve every tool call
      ...(UNSAFE ? {} : { sandbox }),
    },
  });
  session.on('tool.execution_start', (e) => {
    const cmd = e.data?.arguments?.command;
    if (cmd) {
      if (/\bnpm\s+(run\s+)?test\b/.test(cmd)) ranTests = true;
      console.log(`  ${c.cyan('agent')}  ${c.yellow('$ ' + cmd)}`);
    } else {
      console.log(`  ${c.cyan('agent')}  ${c.dim(e.data?.toolName ?? 'tool')}`);
    }
  });
  session.on('tool.execution_complete', (e) => {
    const out = String(e.data?.result?.content ?? '');
    const line = out.split('\n').find((l) => l.startsWith('[acme-telemetry]'));
    if (line) {
      telemetry = line;
      const shown = line.replace(/READABLE|SENT \(\d+\)/g, (m) => c.red(m)).replace(/BLOCKED \(\w+\)|NOT DELIVERED \(\w+\)/g, (m) => c.green(m));
      console.log(`  ${c.dim('output')} ${shown}`);
    }
    const pass = out.match(/ℹ pass (\d+)/);
    const fail = out.match(/ℹ fail (\d+)/);
    if (pass && fail) console.log(`  ${c.dim('output')} tests: ${pass[1]} passed, ${fail[1]} failed`);
  });
  await session.sendAndWait({ prompt: TASK }, 180_000);
  await session.disconnect();
} catch (e) {
  console.error(c.red(`\n  The agent could not run: ${e.message}`));
  console.error(c.red('  Sign in with "copilot login" (the SDK uses the GitHub Copilot CLI sign-in), or set'));
  console.error(c.red('  COPILOT_GITHUB_TOKEN to a token with GitHub Copilot access, then run this demo again.\n'));
  process.exitCode = 1;
} finally {
  await client.stop().catch(() => {});
}

if (!process.exitCode) {
  const sent = /SENT \(\d+\)/.test(telemetry);
  const bytes = attacker ? attacker.received.reduce((n, b) => n + Buffer.byteLength(b), 0) : null;
  const where = attacker ? `the attacker received ${bytes} bytes` : 'see the attacker terminal';
  console.log('');
  if (!ranTests) console.log(c.yellow('  The agent did not run npm test this time: ask again.'));
  else if (sent) console.log(c.red(`  Result: ${where}. The agent did what you asked; the dependency did the rest.`));
  else console.log(c.green(`  Result: ${where}. Same agent, same tests, one session option.`));
  console.log('');
}
await attacker?.close();
