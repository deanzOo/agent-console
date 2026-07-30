#!/usr/bin/env bash
# Blocks a direct push to a protected branch. Everything lands through a pull
# request so CI has run and there is a diff someone could have read.
#
# GitHub branch protection is the real enforcement; this catches the mistake
# locally, before the rejected push, and works before a remote is configured.
set -euo pipefail

PROTECTED_BRANCHES="main master dev development staging prod production"

# git feeds pre-push one line per ref: <local ref> <local sha> <remote ref> <remote sha>
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  [ -z "${remote_ref:-}" ] && continue
  branch="${remote_ref#refs/heads/}"

  for protected in $PROTECTED_BRANCHES; do
    if [ "$branch" = "$protected" ]; then
      echo "error: direct push to '$branch' is not allowed." >&2
      echo "Open a pull request instead:" >&2
      echo "  git switch -c <type>/<short-description>" >&2
      echo "  git push -u origin HEAD && gh pr create" >&2
      exit 1
    fi
  done
done

exit 0
