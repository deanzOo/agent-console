# HTTP API

Every route is behind the auth adapter selected by `AUTH_MODE`; `/api/login` and `/api/setup` are the
exceptions, and `/api/setup` closes itself once a password exists. A route belonging to an integration that is
not configured answers **404** — an absent feature is a supported state, not an error.

Routes are thin by design: they validate, call into `packages/core` or the session host, and shape the
response. Anything that would need HTTP to unit-test belongs in `packages/core` instead.

## Missions

| Route                          | Method | Body                                                                            | Answers                       |
| ------------------------------ | ------ | ------------------------------------------------------------------------------- | ----------------------------- |
| `/api/missions`                | GET    | —                                                                               | `{ missions, awaitingInput }` |
| `/api/missions`                | POST   | `{ title, prompt, source, sourceRef?, repo?, base? }`                           | `201 { id }`                  |
| `/api/missions/[id]/answer`    | POST   | `{ promptId, decision, always? }` or `{ promptId, decision: "deny", message? }` | `{ ok }`                      |
| `/api/missions/[id]/say`       | POST   | `{ text }`                                                                      | `{ ok }`                      |
| `/api/missions/[id]/mode`      | POST   | `{ mode: "default" \| "acceptEdits" \| "plan" }`                                | `{ ok }`                      |
| `/api/missions/[id]/interrupt` | POST   | —                                                                               | `{ ok }`                      |
| `/api/missions/[id]/stop`      | POST   | —                                                                               | `{ ok }`                      |
| `/api/missions/[id]/archive`   | POST   | `{ archived: boolean }`                                                         | `{ ok }`                      |
| `/api/missions/[id]/workspace` | DELETE | —                                                                               | `{ ok }`                      |
| `/api/missions/[id]/publish`   | POST   | —                                                                               | `{ url }`                     |
| `/api/missions/[id]/stream`    | GET    | —                                                                               | `text/event-stream`           |
| `/api/missions/stream`         | GET    | —                                                                               | `text/event-stream`           |

**Statuses shared by the mission routes.** `404` when the mission does not exist. `400` when the body does not
validate. `503 { error: "agentd_unreachable" }` when the session host is restarting — a supported state, and
distinct from a refusal. Anything else the session host refuses is passed through with its own status, so
`409 { error: "session_not_running" }` reaches the browser unchanged.

`mode` accepts three values and no others. `bypassPermissions` is refused: an approval console that can be told
to stop approving is pointless. See [ADR 0009](../adr/0009-pretooluse-hook-not-canusetool.md).

`publish` pushes the mission's branch and opens its pull request. It answers `400 no_branch` for a mission
without a repository, `404` when no GitHub token is configured, and `409` with a reason when there is nothing
to push. A pull request that already exists is returned rather than treated as an error, because pressing the
button twice is ordinary.

`workspace` deletes the mission's working tree and refuses while the mission is live.

## Streams

Both stream routes are server-sent events. The transcript stream replays from the last sequence number the
browser saw — sent as `Last-Event-ID` on an automatic reconnect, or `?since=` — so a phone waking up loses
nothing. If the session host is unreachable, the transcript so far is replayed followed by an
`agentd.unreachable` event, rather than an empty screen.

`/api/missions/stream` emits `missions.changed` when any mission's status differs from the last look. It
compares state in the database rather than listening in process, because missions run in the session host and
are read by the console: two processes, one database file, and only one place they both agree.

## Everything else

| Route                            | Method | Body                 | Answers                                |
| -------------------------------- | ------ | -------------------- | -------------------------------------- |
| `/api/login`                     | POST   | `{ password }`       | `{ ok }` plus the session cookie       |
| `/api/setup`                     | GET    | —                    | The wizard's state                     |
| `/api/setup`                     | POST   | `{ step, … }`        | `{ ok }`                               |
| `/api/sync`                      | POST   | —                    | `{ issues?, repos?, tasks?, …Error? }` |
| `/api/push`                      | GET    | —                    | `{ publicKey }`                        |
| `/api/push`                      | POST   | `{ endpoint, keys }` | `201 { ok }`                           |
| `/api/disk-usage/orphans/[name]` | DELETE | —                    | `{ ok }`                               |

`disk-usage/orphans/[name]` deletes a tree under `wt/` with no mission row behind it — the counterpart to
`workspace` for a mission's own tree, needed because an orphan has no mission status to refuse against. `name`
is checked against a plain allowlist rather than resolved as a path, so a traversal attempt is refused outright
rather than relying on catching it after normalising.

`/api/login` exists only when `AUTH_MODE=password`; otherwise it is 404. A wrong password and an instance with
no password set answer identically, so an unauthenticated caller learns nothing about the deployment.

`/api/setup` issues a session when the password step succeeds. Setting the password is what locks the wizard,
so without that the next step — including Finish — would be refused to the person who just proved they own the
instance.

`/api/sync` reports each integration separately, including its error. One service being down must not hide
another's results.
