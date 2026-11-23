# Demo 4 · GitHub Copilot CLI and its MXC-powered sandbox

GitHub Copilot CLI runs shell commands inside a local sandbox when you turn it on. The CLI help says:
"Sandboxing is powered by Microsoft Execution Containers (MXC)". On macOS it uses MXC's Seatbelt backend,
on Linux bubblewrap, on Windows ProcessContainer.

This demo uses a small project whose test suite loads a simulated malicious dependency
(`@acme/telemetry`). The dependency checks whether it can read credential locations and then tries to
send its findings to a local "attacker" listener. **It only reports READABLE or BLOCKED. It never
prints or sends file contents**, so it is safe to run on a real laptop.

## Setup

```bash
npm run demo4:setup          # creates .demo4/bookshop
npm run attacker             # terminal 1: the local listener on 127.0.0.1:9999
cd .demo4/bookshop           # terminal 2
sh whoami.sh                 # optional: note your token fingerprint outside the sandbox
```

In a Codespace, the setup also plants **fake** `~/.ssh/id_ed25519` and `~/.cf/config.json` files. On a
laptop it never touches your home folder.

## Run it

1. Start Copilot with the sandbox for this session:

   ```bash
   copilot --sandbox
   ```

   Enter `/sandbox status` to confirm that sandboxing is on for the session.

2. Ask:

   > Run npm test and then sh whoami.sh. Show me the raw output of both commands.

   With the default policy (rehearsed with Copilot CLI 1.0.114 on macOS):

   | Probe | Default policy |
   | --- | --- |
   | `~/.ssh` | BLOCKED (EPERM): not granted by the sandbox |
   | `~/.azure` | BLOCKED (EPERM) |
   | `./default-env.json` | READABLE: the working directory is granted read/write |
   | upload to `127.0.0.1:9999` | depends on **Allow local network** (see the Network tab) |
   | `GH_TOKEN` in your shell | passed through unless you mask it |

3. Tighten the policy. Enter `/sandbox` and use <kbd>Tab</kbd> to switch tabs:

   - **Filesystem** → **User-configured paths** → <kbd>A</kbd> → type the absolute path of
     `default-env.json` → choose **Denied**. Add your `~/.cf` folder (absolute path) as **Denied** too.
     The dialog takes absolute paths; wildcards such as `**/default-env.json` work in `settings.json`.
   - **Network** → turn **Allow local network** off.
   - **Credentials** → **Masked environment variables** → <kbd>A</kbd> → variable `GH_TOKEN`,
     inject hosts `github.com, api.github.com, uploads.github.com`. (In a Codespace, `GITHUB_TOKEN` is
     masked automatically while **Authenticate gh** is on.)
   - Press <kbd>Esc</kbd> to save.

4. Ask the same question again. Expected:

   - `./default-env.json` BLOCKED (EPERM) and the upload NOT DELIVERED. The attacker terminal stays quiet.
   - `whoami.sh` shows a **different token fingerprint** than outside the sandbox, but `gh api user` still
     signs in as you. The sandboxed command only ever held a placeholder; the local proxy adds the real
     token for GitHub hosts only.

5. Enter `/sandbox policy` to write the effective policy to `sandbox-policy.md`. Copilot also keeps the
   generated MXC request (`"version": "1.0.0"`) under `~/.copilot/session-state/<session>/policies/`.

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
is set.

## Learn more

- `copilot help sandbox`
- [About local sandboxing for GitHub Copilot](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes)
- [Microsoft Execution Containers](https://github.com/microsoft/mxc)
