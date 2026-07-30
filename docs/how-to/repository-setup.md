# Configure the GitHub repository

One-time setup after pushing this repository to GitHub. The local hooks catch mistakes early, but these
settings are the actual enforcement — a hook is skipped by `--no-verify`.

## Protect `main`

Settings → Branches → Add branch ruleset, targeting `main`:

- **Restrict deletions** and **Block force pushes**.
- **Require a pull request before merging.** Set approvals to 0 if you work alone — the point is that a diff
  and a CI run exist, not that someone else clicks approve.
- **Require status checks to pass**, and after the first CI run select: `check`, `commits`, `links`,
  `no-hardcoded-config`, `analyze` (CodeQL), `scan` (Trivy).
- **Require branches to be up to date before merging**, so nothing merges on a stale base.
- Leave **Do not allow bypassing** on. Exempting yourself defeats the purpose.

With CLI:

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check", "commits", "links", "no-hardcoded-config"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Merge behaviour

Settings → General → Pull Requests:

- Allow **squash merging** only. Disable merge commits and rebase merging.
- Set the squash commit message to **"Pull request title and description"** — the PR title then becomes the
  commit on `main`, so it must itself be a valid Conventional Commit. release-please reads it.
- Enable **Automatically delete head branches**.

## Enable security features

Settings → Code security:

- **Dependabot alerts** and **security updates** (the update schedule is already in
  `.github/dependabot.yml`).
- **Code scanning** — CodeQL and Trivy both upload SARIF. On a private repository this needs GitHub Advanced
  Security; without it the workflows still fail the build on HIGH or CRITICAL, you just lose the Security tab.
- **Secret scanning** with **push protection**.
- **Private vulnerability reporting**, which is what [SECURITY.md](../../SECURITY.md) points people at.

## Labels

The out-of-scope convention needs one label:

```bash
gh label create out-of-scope --description "Real issue, found outside the current task" --color ededed
```

## Releases

`release-please` opens and maintains a release PR on every push to `main`; merging it tags the release and
writes `CHANGELOG.md`. It needs no configuration beyond what is committed, but the default `GITHUB_TOKEN`
must be allowed to open PRs: Settings → Actions → General → Workflow permissions → **Read and write**, plus
**Allow GitHub Actions to create and approve pull requests**.
