#!/usr/bin/env bash
# Runs every check in ci/checks.json — the same list the CI matrix is built
# from, so local and remote cannot drift.
set -uo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

failed=()
skipped=()

while IFS=$'\t' read -r name command requires hint; do
  if [ -n "$requires" ] && ! command -v "$requires" >/dev/null 2>&1; then
    printf '%s▸ %s — skipped, %s is not installed%s\n' "$YELLOW" "$name" "$requires" "$RESET"
    [ -n "$hint" ] && printf '%s    %s%s\n' "$YELLOW" "$hint" "$RESET"
    printf '\n'
    skipped+=("$name")
    continue
  fi

  printf '%s▸ %s%s\n' "$BOLD" "$name" "$RESET"
  if bash -c "$command"; then
    printf '%s  ✓ %s%s\n\n' "$GREEN" "$name" "$RESET"
  else
    printf '%s  ✗ %s%s\n\n' "$RED" "$name" "$RESET"
    failed+=("$name")
  fi
done < <(node -e '
  const checks = require("./ci/checks.json");
  for (const c of checks) {
    process.stdout.write(
      [c.name, c.command, c.requires ?? "", c.installHint ?? ""].join("\t") + "\n",
    );
  }
')

echo
if [ ${#skipped[@]} -gt 0 ]; then
  printf '%sSkipped locally: %s%s\n' "$YELLOW" "${skipped[*]}" "$RESET"
fi

if [ ${#failed[@]} -gt 0 ]; then
  printf '%s%sFAILED: %s%s\n' "$BOLD" "$RED" "${failed[*]}" "$RESET"
  exit 1
fi

printf '%s%sAll local CI checks passed.%s\n' "$BOLD" "$GREEN" "$RESET"
