// Demo 0 · Is this machine ready? Shows which MXC backends this host supports.
import { execFileSync } from 'node:child_process';
import { getAvailableBackends, getPlatformSupport } from '@microsoft/mxc-sdk/v1';
import { backendName, banner, c } from '../../lib/common.mjs';

banner('Demo 0 · Platform check', `${process.platform}/${process.arch} · Node ${process.versions.node}`);

const support = getPlatformSupport();
console.log(`  MXC supported on this host: ${support.isSupported ? c.green('yes') : c.red('no')} ${support.reason ? c.dim('(' + support.reason + ')') : ''}`);
console.log(`  Default "process" backend:  ${c.bold(backendName())}`);
for (const b of getAvailableBackends()) {
  console.log(`  Available backend:          ${c.bold(b.backend)}${b.capabilities?.length ? c.dim('  capabilities: ' + b.capabilities.join(', ')) : ''}`);
  for (const w of b.warnings ?? []) console.log(c.yellow(`    warning: ${w}`));
}

// The Linux proxy mode (demo 2) and the GitHub Copilot CLI sandbox need extra host tools.
if (process.platform === 'linux') {
  const tools = ['bwrap', 'slirp4netns', 'unshare', 'nsenter', 'ip', 'iptables', 'ip6tables'];
  console.log('');
  for (const t of tools) {
    let found = '';
    try { found = execFileSync('sh', ['-c', `command -v ${t}`], { encoding: 'utf8' }).trim(); } catch { /* missing */ }
    console.log(`  ${t.padEnd(12)} ${found ? c.green('✔ ' + found) : c.red('✖ missing (run .devcontainer/setup.sh)')}`);
  }
}
console.log('');
if (!support.isSupported) process.exitCode = 1;
