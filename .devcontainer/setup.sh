#!/usr/bin/env bash
# Installs what MXC's Bubblewrap backend (and the GitHub Copilot CLI sandbox on Linux) needs.
set -euo pipefail

echo "==> Sandbox prerequisites: bubblewrap, slirp4netns, iptables, iproute2"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  bubblewrap slirp4netns iptables iproute2 util-linux curl >/dev/null

# MXC programs its in-sandbox firewall with the nf_tables iptables backend.
sudo update-alternatives --set iptables /usr/sbin/iptables-nft >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-nft >/dev/null 2>&1 || true

# Some hosts restrict unprivileged user namespaces through AppArmor; Bubblewrap needs them.
if [ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && \
   [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = "1" ]; then
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 || true
fi

# slirp4netns needs the TUN device for the sandbox's private network.
if [ ! -c /dev/net/tun ]; then
  sudo mkdir -p /dev/net && sudo mknod /dev/net/tun c 10 200 && sudo chmod 0666 /dev/net/tun || true
fi

echo "==> Node dependencies"
npm ci --no-audit --no-fund

echo "==> GitHub Copilot CLI"
npm install -g @github/copilot --no-audit --no-fund >/dev/null || echo "Copilot CLI install failed; install it later with: npm install -g @github/copilot"

echo "==> Platform check"
node demos/00-check/check.mjs || true
