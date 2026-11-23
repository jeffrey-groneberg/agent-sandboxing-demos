# Demo 4 · GitHub Copilot CLI and its MXC-powered sandbox

GitHub Copilot CLI runs shell commands inside a local sandbox when you turn it on. The CLI help says:
"Sandboxing is powered by Microsoft Execution Containers (MXC)". On macOS it uses MXC's Seatbelt backend,
on Linux bubblewrap, on Windows ProcessContainer.

This demo uses a small project whose test suite loads a simulated malicious dependency
(`@acme/telemetry`). The dependency checks whether it can read credential locations and then tries to
send its findings to a local "attacker" listener. **It only reports READABLE, BLOCKED or not found. It
never prints or sends file contents**, so it is safe to run on a real laptop.

## Setup

```bash
npm run demo4:setup          # creates .demo4/bookshop
npm run attacker             # terminal 1: the local listener on 127.0.0.1:9999
cd .demo4/bookshop           # terminal 2
sh whoami.sh                 # optional: your token situation outside the sandbox
```

In a Codespace the setup also plants **fake** `~/.ssh/id_ed25519` and `~/.cf/config.json` files and grants
`/usr/local/lib/node_modules` read-only in the Copilot sandbox policy: in this dev container `npm` is a
link into that folder, and the sandbox only grants the folders on your `PATH`. That is deny by default in
action: grant exactly what a tool needs. On a laptop the setup never touches your home folder.

## Run it

1. Start Copilot with the sandbox for this session, then confirm it is on:

   ```bash
   copilot --sandbox
   ```

   ```text
   /sandbox status
   ```

2. Ask:

   > Run npm test and then sh whoami.sh. Show me the raw output of both commands.

3. Tighten the policy. Enter `/sandbox` and switch tabs with <kbd>Tab</kbd>:

   - **Filesystem** → **User-configured paths** → <kbd>A</kbd> → type the absolute path of the project's
     `default-env.json` → choose **Denied**. In a Codespace, add `/home/node/.cf` as **Denied** too.
   - **Network** → turn **Allow local network** off.
   - If your shell exports `GH_TOKEN`: **Credentials** → **Masked environment variables** → <kbd>A</kbd> →
     variable `GH_TOKEN`, inject hosts `github.com, api.github.com, uploads.github.com`.
   - Press <kbd>Esc</kbd> to save.

4. Ask the same question again.

5. **Copilot asks to retry outside the sandbox.** Because commands were blocked, Copilot offers to run
   them again without the sandbox. Answer **No**. That escape hatch is the **Allow sandbox bypass**
   setting; an enterprise can turn it off with the managed setting `allowBypass: false`.

6. Enter `/sandbox policy` to write the effective policy to `sandbox-policy.md`. Copilot also keeps the
   MXC request it generated (`"version": "1.0.0"`) under `~/.copilot/session-state/<session>/policies/`.

## What you should see

Rehearsed on November 23, 2026 with GitHub Copilot CLI 1.0.114:

| Probe | Default policy | After step 3 |
| --- | --- | --- |
| `~/.ssh`, `~/.azure` | macOS: BLOCKED (EPERM) · Codespace: not found (the sandbox does not mount your home folder) | same |
| `./default-env.json` | READABLE: your project folder is read/write | BLOCKED |
| upload to `127.0.0.1:9999` | SENT: local network is allowed by default | NOT DELIVERED, and the attacker terminal stays quiet |
| `whoami.sh` | Codespace: `GH_TOKEN` and `GITHUB_TOKEN` are 49-character placeholders · macOS: a `GH_TOKEN` your shell exports passes through until you mask it | placeholders, while `gh api user` still signs in as you |

The token fingerprints inside the sandbox never match the ones outside: sandboxed commands only hold
placeholders, and Copilot's local proxy adds the real token on the way to GitHub hosts only.

## Fast path with a prepared policy

Sandbox settings live in `settings.json` in your Copilot configuration directory (not in the
repository). To rehearse without changing your own settings, point `COPILOT_HOME` at a throwaway folder:

```bash
mkdir -p /tmp/copilot-demo && cat > /tmp/copilot-demo/settings.json <<EOF
{
  "sandbox": {
    "enabled": true,
    "userPolicy": {
      "filesystem": { "deniedPaths": ["**/default-env.json", "$HOME/.cf"] },
      "network": { "allowLocalNetwork": false }
    },
    "credentials": {
      "envVars": { "GH_TOKEN": { "injectHosts": ["github.com", "api.github.com", "uploads.github.com"] } }
    }
  }
}
EOF
COPILOT_HOME=/tmp/copilot-demo copilot --sandbox
```

A fresh `COPILOT_HOME` has no saved login: sign in again, or start it from a shell where `GH_TOKEN`
is set. In a Codespace, also keep `"readonlyPaths": ["/usr/local/lib/node_modules"]` under `filesystem`.

## Learn more

- `copilot help sandbox`
- [About local sandboxing for GitHub Copilot](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes)
- [Microsoft Execution Containers](https://github.com/microsoft/mxc)
