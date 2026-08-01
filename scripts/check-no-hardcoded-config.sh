#!/usr/bin/env bash
# Fails if a deployment-specific value is committed to source. This app is meant
# to be cloned onto someone else's server, so anything tied to one person's
# accounts, hosts, or filesystem belongs in config — never in a source file.
#
# Two tiers:
#   secret       credential shapes. Scanned everywhere, including tests — a real
#                token in a fixture is still a leaked token.
#   deployment   hostnames and absolute paths. Skipped in tests, where a made-up
#                value is the whole point of the fixture.
set -euo pipefail

cd "$(dirname "$0")/.."

# Legitimate homes for these values: the documented contract, prose, and the
# deploy templates that exist to be filled in.
BASE_EXCLUDES=(
  ':!.env.example'
  ':!*.md'
  ':!deploy/*'
  ':!docker-compose.yml'
  ':!scripts/check-no-hardcoded-config.sh'
)
TEST_EXCLUDES=(':!*.test.ts' ':!*.test.tsx')

# tier|pattern|human-readable explanation
PATTERNS=(
  'secret|ghp_[A-Za-z0-9]{20,}|GitHub personal access token'
  'secret|github_pat_[A-Za-z0-9_]{20,}|GitHub fine-grained token'
  'secret|sk-ant-[A-Za-z0-9-]{10,}|Anthropic API key'
  'secret|[0-9]{8,}:AA[A-Za-z0-9_-]{30,}|Telegram bot token'
  'secret|-----BEGIN [A-Z ]*PRIVATE KEY-----|private key'
  'deployment|/home/[a-z][a-z0-9_-]*/|absolute home directory path'
  'deployment|/Users/[a-z][a-z0-9_-]*/|absolute macOS home directory path'
  'deployment|[a-z0-9-]+\.cloudflareaccess\.com|Cloudflare Access team domain'
  'deployment|[a-z0-9-]+\.trycloudflare\.com|Cloudflare tunnel hostname'
)

failed=0
for entry in "${PATTERNS[@]}"; do
  tier="${entry%%|*}"
  rest="${entry#*|}"
  pattern="${rest%%|*}"
  label="${rest#*|}"

  excludes=("${BASE_EXCLUDES[@]}")
  if [ "$tier" = "deployment" ]; then
    excludes+=("${TEST_EXCLUDES[@]}")
  fi

  if matches=$(git grep -nEI "$pattern" -- . "${excludes[@]}" 2>/dev/null); then
    echo "::error::Hardcoded ${label} found — move it to config:"
    echo "$matches"
    failed=1
  fi
done

# .env.example is excluded from the scan above because it is the one file meant
# to name every key, and it carries harmless defaults like HOST and PORT. What
# it must never carry is a secret, which is also what lets gitleaks skip it: the
# rule here is stricter than gitleaks', because it rejects any value at all
# rather than only ones that look secret.
if filled=$(grep -nE '^[A-Za-z_][A-Za-z0-9_]*(TOKEN|KEY|SECRET|PASSWORD)[A-Za-z0-9_]*=.+' .env.example 2>/dev/null); then
  echo "::error::.env.example names secrets but must never carry their values:"
  echo "$filled"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo
  echo "Deployment-specific values must come from env vars or the settings table."
  echo "Document the key in .env.example instead of committing a value."
  exit 1
fi

echo "No hardcoded deployment-specific values found."
