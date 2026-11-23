// Demo 4 setup · A small project for the GitHub Copilot CLI sandbox demo (lib/bookshop.mjs).
// Its test suite loads a "telemetry" dependency that probes credential locations and phones home.
// The probe reports METADATA ONLY (readable or blocked), never file contents, so it is safe to run
// on a real laptop. Fake credentials are planted in the real home folder only inside a Codespace.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, c } from '../../lib/common.mjs';
import { DEVCONTAINER_NODE_MODULES, IN_CODESPACE, plantCodespaceCredentials, writeBookshop } from '../../lib/bookshop.mjs';

const APP = path.join(ROOT, '.demo4', 'bookshop');
writeBookshop(APP);

if (IN_CODESPACE) {
  plantCodespaceCredentials();
  const home = os.homedir();

  // In this dev container, npm is a symlink into /usr/local/lib/node_modules. The sandbox grants the
  // PATH folder /usr/local/bin but not that target, so npm would be "not found" inside the sandbox.
  // Deny by default in action: grant exactly the folder the tool needs, read-only.
  const NODE_MODULES = DEVCONTAINER_NODE_MODULES;
  const settingsPath = path.join(process.env.COPILOT_HOME || path.join(home, '.copilot'), 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* new file */ }
  const fsPolicy = ((settings.sandbox ??= {}).userPolicy ??= {}).filesystem ??= {};
  fsPolicy.readonlyPaths ??= [];
  if (fs.existsSync(NODE_MODULES) && !fsPolicy.readonlyPaths.includes(NODE_MODULES)) {
    fsPolicy.readonlyPaths.push(NODE_MODULES);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(c.dim(`  Copilot sandbox policy: granted ${NODE_MODULES} read-only (npm lives there) in ${settingsPath}`));
  }
}

console.log(`
${c.bold('Demo 4 · GitHub Copilot CLI with its MXC-powered sandbox')}
  Project created: ${c.cyan(path.relative(process.cwd(), APP) || APP)}

  ${c.bold('Terminal 1')}   npm run attacker
  ${c.bold('Terminal 2')}   cd ${path.relative(process.cwd(), APP)} && copilot --sandbox

  1. ${c.yellow('/sandbox status')}                            confirm the sandbox is on
  2. ${c.yellow('Run npm test and then sh whoami.sh. Show me the raw output of both commands.')}
     → the telemetry line shows what the sandbox allows and what it blocks
  3. In ${c.yellow('/sandbox')}, deny ${c.yellow('default-env.json')} (and ${c.yellow('/home/node/.cf')} in a Codespace), turn
     ${c.yellow('Allow local network')} off, mask ${c.yellow('GH_TOKEN')} if your shell exports it. Ask again →
     default-env.json reads BLOCKED and the upload NOT DELIVERED. Answer ${c.bold('No')} to the bypass prompt.
  4. ${c.yellow('/sandbox policy')}                            writes the effective policy to sandbox-policy.md
  Steps in detail: demos/04-copilot-cli/README.md

  The probe never reads out or sends file contents; it only reports READABLE or BLOCKED.
`);
