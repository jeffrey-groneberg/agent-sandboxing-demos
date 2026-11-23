// Standalone "attacker" listener for demo 4 (GitHub Copilot CLI). Run it in a second terminal:
//   npm run attacker
import { startAttacker } from './attacker.mjs';
import { c } from './common.mjs';

await startAttacker();
console.log(c.magenta('  [attacker] listening on 127.0.0.1:9999 · stands in for a server on the internet'));
