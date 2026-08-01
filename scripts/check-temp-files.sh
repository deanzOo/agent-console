#!/usr/bin/env bash
# A file created at a name someone can guess, in a directory everyone can write
# to, is a file someone can get to first — as a symlink pointing wherever they
# like, which the write then follows. mkdtemp returns a directory nobody can
# guess, so the name inside it stops mattering.
#
# CodeQL reports this as js/insecure-temporary-file, but only after a push. This
# is the same rule where it is cheap to run.
set -euo pipefail

root="${1:-.}"

# Guessable: tmpdir() joined with anything built from the pid, a counter, a
# timestamp, or a bare literal. mkdtempSync(path.join(tmpdir(), "prefix-")) is
# the shape this is steering towards, and is deliberately not matched.
# This check's own tests hold the bad shape as fixture strings — it is the one
# file whose job is to contain what everything else must not.
if matches=$(git -C "$root" grep -nE 'path\.join\(\s*tmpdir\(\)' \
  -- '*.ts' '*.tsx' '*.mjs' ':!scripts/check-temp-files.test.ts' 2>/dev/null \
  | grep -vE 'mkdtempSync|mkdtemp\(' || true); [ -n "$matches" ]; then
  echo "::error::Temporary file at a predictable path — use mkdtempSync:"
  echo "$matches"
  echo
  echo "A guessable name in a shared directory can be pre-created as a symlink."
  exit 1
fi

echo "No temporary files at predictable paths."
