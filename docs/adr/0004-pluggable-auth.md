# 4. Authentication is an adapter, not one provider

- Status: accepted
- Date: 2026-07-30

## Context and problem statement

The app is exposed to the internet and gives its caller the ability to run arbitrary commands on a server.
It is also meant to be cloned by other people, who will not all have the same infrastructure — a Cloudflare
account, a domain, or a VPN.

## Considered options

- Cloudflare Access only
- A password, always
- One `getUser` interface with an implementation per environment

## Decision

`lib/auth/` exposes `getUser(request): Promise<User | null>`. `AUTH_MODE` selects `cloudflare-access`
(default), `password`, or `trusted-network`. Misconfiguration throws at construction.

## Consequences

Good:

- Someone with no Cloudflare account is not blocked from running this. That is the difference between a
  project that can be shared and one that only works for its author.
- The verification logic is a pure function of a `Request`, so every rejection path — expired, wrong
  audience, bad signature, absent — is unit tested without a server.
- Adding SSO later is a fourth file, not a refactor.

Bad:

- Three code paths to keep correct, and the weakest one sets the floor. `trusted-network` therefore refuses
  to start on a non-loopback bind unless `ALLOW_INSECURE=1` is set explicitly — without that guard, a
  copy-pasted deployment ends up publicly writable and looks fine.
- `password` mode needs `SESSION_SECRET` from the environment, because middleware runs before the database
  is reachable. It is the one credential `/setup` cannot supply.

Returning `null` rather than throwing on a failed check is deliberate: it collapses every failure into one
401 path, so no branch can accidentally fall through to allowing the request.
