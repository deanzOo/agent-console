-- Schema for the agent console. Applied on every boot; every statement is
-- idempotent so opening an existing database is a no-op.

CREATE TABLE IF NOT EXISTS missions (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (
                   status IN ('starting', 'running', 'awaiting_input',
                              'done', 'failed', 'stopped')
                 ),
  source         TEXT NOT NULL CHECK (source IN ('free', 'github', 'asana')),
  -- Issue number or Asana task gid, depending on source.
  source_ref     TEXT,
  repo           TEXT,
  branch         TEXT,
  worktree_path  TEXT,
  -- Agent SDK session id, captured from the init message. Enables resume after
  -- a restart; null until the session reports it.
  session_id     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Highest event seq written, so a new event can be numbered without a scan.
  last_seq       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS missions_status_idx ON missions (status);

-- Append-only transcript. The composite primary key is what makes the SSE
-- `?since=` cursor durable: a client that reconnects asks for everything after
-- a seq it already has, so a slept phone loses nothing.
CREATE TABLE IF NOT EXISTS events (
  mission_id   TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  ts           TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (mission_id, seq)
);

-- A tool approval or question the agent is blocked on. Unanswered rows are the
-- "waiting on you" state the whole product exists to surface.
CREATE TABLE IF NOT EXISTS pending_prompts (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('tool_approval', 'question')),
  tool_name    TEXT,
  input_json   TEXT,
  options_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  answered_at  TEXT
);

CREATE INDEX IF NOT EXISTS pending_prompts_open_idx
  ON pending_prompts (mission_id) WHERE answered_at IS NULL;

CREATE TABLE IF NOT EXISTS repos (
  full_name      TEXT PRIMARY KEY,
  default_branch TEXT,
  bare_path      TEXT,
  last_synced_at TEXT
);

-- Read caches. The UI reads only from these, so panels render instantly and
-- survive an MCP server being down.
CREATE TABLE IF NOT EXISTS issues_cache (
  repo        TEXT NOT NULL,
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL,
  state       TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '[]',
  url         TEXT NOT NULL,
  updated_at  TEXT,
  PRIMARY KEY (repo, number)
);

CREATE TABLE IF NOT EXISTS asana_cache (
  gid        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  project    TEXT,
  due_on     TEXT,
  permalink  TEXT,
  completed  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  keys_json  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Operator-editable configuration. Env vars take precedence over these.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
