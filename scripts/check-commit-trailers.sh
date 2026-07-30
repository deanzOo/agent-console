#!/usr/bin/env bash
# Rejects attribution trailers. Commits here are authored by whoever ran the
# work, and a tool credit in the history is noise that outlives its usefulness.
set -euo pipefail

message_file="${1:?usage: check-commit-trailers.sh <commit-msg-file>}"

# Strip comment lines git adds to the template before matching.
body="$(grep -v '^#' "$message_file" || true)"

# Signed-off-by is deliberately absent: a DCO sign-off asserts the author's own
# right to submit, crediting nobody else, and dependabot puts one on every
# update it opens. Rejecting it blocks every dependency bump the repo receives.
if printf '%s' "$body" | grep -qiE '^[[:space:]]*(co-authored-by|generated[- ]with)[[:space:]]*:'; then
  echo "error: attribution trailers are not used in this repository." >&2
  echo "Remove the Co-Authored-By / Generated-with line from the commit message." >&2
  exit 1
fi

if printf '%s' "$body" | grep -qiE '🤖 Generated with|Claude Code'; then
  echo "error: tool attribution is not used in this repository." >&2
  exit 1
fi
