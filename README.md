# Agent sandboxing demos

Hands-on demos for the talk **"Guardrails for AI agents: sandboxing with Microsoft Execution Containers"**.
They show why an AI agent needs an operating-system sandbox and how
[Microsoft Execution Containers (MXC)](https://github.com/microsoft/mxc) provide one, in your own agent and
in GitHub Copilot. Demo 5 turns on GitHub Copilot's sandbox in an agent you build with the Microsoft Copilot SDK
(formerly GitHub Copilot SDK).

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/jeffrey-groneberg/agent-sandboxing-demos)

> **Safety.** Every "secret" in these demos is fake and created by the demos themselves
> (`DEMO-ONLY-...`). The "attacker" is a listener on `127.0.0.1:9999`; nothing leaves your machine.
> On a laptop demos 1–3 never touch your real home folder. Demos 4 and 5 only check whether a credential
> location is readable and never print or send its contents.

## Where it runs

| Host | MXC backend | Notes |
| --- | --- | --- |
| GitHub Codespaces (this dev container) | Bubblewrap | Prerequisites are installed by `.devcontainer/setup.sh`. The dev container runs privileged so Bubblewrap can create user namespaces. |
| macOS 15 or later on Apple silicon | Seatbelt | Needs Node.js 24 or later. Demos 1–3 work offline, except demo 2's `api.github.com` row; demos 4 and 5 need the GitHub Copilot service. |

## Quick start

```bash
npm ci
npm run check            # which MXC backend this host uses
npm run demo1            # add -- --step to pause between phases when presenting
npm run demo2
npm run demo3
npm run demo4:setup      # then follow demos/04-copilot-cli/README.md
npm run demo5 -- --unsafe   # your own agent (Microsoft Copilot SDK) without a sandbox
npm run demo5               # the same agent with permissions.sandbox
npm test                 # runs demos 1-3 headless and checks every outcome
```

## The demos

| Demo | What you see | MXC feature |
| --- | --- | --- |
| **1 · Blast radius** | One malicious install script, run twice: without a sandbox it reads `~/.ssh`, Cloud Foundry tokens, `.env` and a secret environment variable, edits `~/.bashrc` and sends the loot. Inside MXC every one of those fails, and the real build step still works. | Deny-by-default filesystem, `deniedPaths` inside a granted folder, no inherited environment, no network |
| **2 · Only the hosts the task needs** | An agent calls a (mock) SAP S/4HANA API and `api.github.com` through a proxy that holds the SAP credential and an allowlist. Pasting data elsewhere is refused by the proxy. Skipping the proxy works without MXC and fails inside it. | `runtimeConfig.networkProxy`: the proxy is the only way out |
| **3 · Your own agent** | A tiny agent loop whose (scripted) model falls for a prompt injection in a README. Every tool call goes through a 15-line `runTool()` built on the MXC SDK, so the injected command fails and the bug still gets fixed. | `run()` from `@microsoft/mxc-sdk/v1` |
| **4 · GitHub Copilot CLI** | `copilot --sandbox` runs the tests of a project with a malicious dependency. The default policy already blocks `~/.ssh`; you then deny project secrets, turn off local network access and mask `GH_TOKEN`. `gh` keeps working with a placeholder token. | GitHub Copilot's local sandbox, which is powered by MXC |
| **5 · Microsoft Copilot SDK** | Your own agent, built with the Microsoft Copilot SDK 2.0 (formerly GitHub Copilot SDK), runs the same tests. Without a sandbox the dependency reads your credential folders and reaches the attacker; with one session option, `permissions.sandbox`, and its two policy rules, every read is blocked, nothing is delivered, and the tests still pass. | The SDK runs the engine behind GitHub Copilot CLI, including its sandbox (experimental in the SDK) |

### Demo 5 · Your own agent with the Microsoft Copilot SDK

The [Microsoft Copilot SDK](https://github.com/microsoft/copilot-sdk) runs the engine behind GitHub Copilot CLI
inside your own app. Demo 5 asks such an agent to run the tests of demo 4's project, once without and once
with the sandbox. The only sandbox code is one session option:

```js
const session = await client.createSession({
  workingDirectory: project,
  permissions: {
    onRequest: approveAll,                           // demo only: approve every tool call
    sandbox: {                                       // experimental in the SDK
      enabled: true,
      userPolicy: {
        filesystem: { deniedPaths: [`${project}/default-env.json`] },
        network: { allowLocalNetwork: false },
      },
    },
  },
});
```

The two policy rules do the blocking. In our macOS rehearsal, `enabled: true` alone kept `~/.ssh` and `~/.azure`
out but left `default-env.json` readable and let the upload through, as GitHub Copilot CLI's default policy does in
demo 4.

It needs a GitHub Copilot sign-in: the SDK uses the same login as GitHub Copilot CLI (`copilot login`), or a
token with GitHub Copilot access in `COPILOT_GITHUB_TOKEN`. If `npm run attacker` from demo 4 still runs in
another terminal, demo 5 reports to it; otherwise it starts its own listener. The kit pins
`@microsoft/copilot-sdk` 2.0.0.

## The pattern behind every demo

1. **A wall.** The operating system enforces it: Seatbelt on macOS, Bubblewrap on Linux, ProcessContainer on
   Windows, or a micro-VM when you need a separate kernel.
2. **A written policy.** Which folders are read-only, read/write or denied, and whether the network is open.
   Everything else is denied.
3. **A proxy outside the wall.** It decides which hosts are reachable and holds the credentials, so the
   agent never sees them.

```js
import { run } from '@microsoft/mxc-sdk/v1';

const result = await run({
  command: 'sh test.sh',
  workingDirectory: project,
  filesystem: { readwritePaths: [project], deniedPaths: [`${project}/.env`] },
  network: { egress: { default: 'deny' } },
  timeoutMs: 30_000,
});
```

## Before an agent runs unattended: eight questions

| Topic | Question |
| --- | --- |
| Wall | Which wall fits how much you trust the code it runs? |
| Files | Which folders may it write? Which secrets are denied? |
| Network | Which hosts does the task need? Is the rest denied? |
| Secrets | Are tokens added at the proxy, never inside the sandbox? |
| Identity | Does it act with its own least-privilege identity? |
| Bypass | Who may approve a command outside the sandbox, if anyone? |
| Logging | Is every blocked access recorded, and who reads it? |
| Failure | Does an unenforceable policy stop the run instead? |

## Learn more

- [microsoft/mxc](https://github.com/microsoft/mxc): source, samples, policy reference
- [MXC platform support on Microsoft Learn](https://learn.microsoft.com/windows/apps/develop/mxc/platform-support)
- [About local sandboxing for GitHub Copilot](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes)
- [microsoft/copilot-sdk](https://github.com/microsoft/copilot-sdk): the Microsoft Copilot SDK, formerly GitHub Copilot SDK
- Microsoft Ignite 2026: *BRK390 · MXC: Deploying Agents You Can Trust*, *BRK281 · Securing coding agents and their code*

This is a personal demo repository, not an official Microsoft product. MIT licensed.
