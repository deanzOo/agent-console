---
type: Index
title: Example knowledge bundle
---

# What this is

A template, not a bundle. Copy it somewhere **outside this repository**, fill it in with what is true of your
deployment, and point `KNOWLEDGE_BUNDLE_PATH` at the copy.

It is [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) v0.2:
one markdown file per concept, `type` the only required frontmatter key, `index.md` and `log.md` reserved.

# Two rules

**Never commit a real bundle.** It describes your servers, and this repository is public.
`scripts/check-no-hardcoded-config.sh` fails the build on hostnames and home paths for the same reason.

**Never put a secret in one.** Agents read these files, and an agent has a shell and holds your GitHub token —
see [ADR 0008](../docs/adr/0008-agent-holds-the-git-token.md). Describe how things work; keep tokens in the
environment.
