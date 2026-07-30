# Security policy

## Reporting a vulnerability

Open a [private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. Please do not open a public issue for something exploitable.

Expect an acknowledgement within a few days. This is a small project maintained in spare time — there is no
paid bounty and no formal SLA.

## What this software is

An agent console runs arbitrary commands on the host, with your credentials, on your behalf. Treat it as
equivalent to an SSH session that a language model can drive. It is **not** a sandbox.

Consequences worth internalising before deploying it:

- An agent with the bash tool can do anything the service user can do.
- Anyone who can reach the app authenticated can start such an agent.
- Prompt injection is a real path here: a malicious issue title, task description, or file in a cloned
  repository is untrusted input that reaches the model. The permission gate — not the model's judgement — is
  what stands between that and an executed command.

## Deploying it safely

- Run as a dedicated unprivileged user. Never root, never your own account.
- Bind to loopback and put authentication in front. `AUTH_MODE=trusted-network` on a public interface is
  refused for this reason.
- Give every token the narrowest scope that works. A fine-grained GitHub PAT limited to the repositories you
  actually want touched, not a classic token with `repo`.
- Keep the default-deny permission posture. Widening `allowedTools` removes the human from actions that
  cannot be undone.
- `data.db` holds credentials in plaintext and is created `chmod 600`. Back it up somewhere equally
  protected.

## Supply chain

- Dependabot, weekly, grouped by risk class.
- Trivy on every PR and weekly: dependencies, secrets, and IaC. Fails the build on HIGH or CRITICAL.
- CodeQL `security-and-quality` on every PR.
- A CI scan rejects credential-shaped literals and deployment-specific values in source.

## Scope

In scope: authentication bypass, privilege escalation, credential disclosure, injection reaching command
execution without passing the permission gate, and anything that makes a default deployment less safe than
this document claims.

Out of scope: the inherent ability of an authenticated operator to run commands — that is the product.
