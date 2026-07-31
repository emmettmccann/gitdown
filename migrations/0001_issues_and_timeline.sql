-- Issues and their timelines (SPEC 6).
--
-- Only what ingestion needs. Sessions, comments and reactions arrive with the
-- write path in a later migration, so the schema never carries tables nothing
-- reads yet.

CREATE TABLE issues (
  -- The #N in the UI. AUTOINCREMENT (rather than plain rowid) guarantees
  -- numbers are never reused, so a deleted issue cannot resurrect someone
  -- else's permalink.
  number         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- NULL is impossible today: every issue comes from an incident. Left UNIQUE
  -- rather than PRIMARY so hand-authored issues stay possible later.
  incident_id    TEXT    NOT NULL UNIQUE,
  title          TEXT    NOT NULL,
  state          TEXT    NOT NULL CHECK (state IN ('open', 'closed')),
  impact         TEXT    NOT NULL,
  status         TEXT    NOT NULL,
  shortlink      TEXT    NOT NULL DEFAULT '',
  -- JSON array of component names; the label set, alongside impact.
  components     TEXT    NOT NULL DEFAULT '[]',
  -- Denormalised so the list page never runs COUNT(*) over comments, which
  -- would read every comment row of every issue on every render (SPEC 7.2).
  comment_count  INTEGER NOT NULL DEFAULT 0,
  reactions      TEXT    NOT NULL DEFAULT '{}',
  started_at     INTEGER NOT NULL,
  resolved_at    INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  -- incident.updated_at as last reconciled; drives the fast-path skip.
  src_updated_at INTEGER NOT NULL
) STRICT;

-- The issues list is always filtered by state and ordered by recency.
CREATE INDEX idx_issues_state_updated ON issues (state, updated_at DESC);

-- Bot events and user comments share one table so a render is one query and
-- polling has a single monotonic cursor (SPEC 6).
CREATE TABLE timeline (
  -- The polling cursor, and the display order. Deliberately not created_at:
  -- insertion order and timestamp order can diverge under retry, clock skew,
  -- and backfill, and the feed must be append-only for a viewer holding a
  -- cursor.
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Statuspage incident_update.id for bot comments, a derived deterministic id
  -- for other bot events, a uuid for user content. UNIQUE is what makes
  -- concurrent reconciles safe: a cron/webhook race computes identical ids and
  -- collapses here instead of double-writing the thread (SPEC 4.3).
  id                TEXT    NOT NULL UNIQUE,
  issue_num         INTEGER NOT NULL REFERENCES issues (number),
  kind              TEXT    NOT NULL,
  -- 'githubstatus' for bot rows, else a session id.
  actor             TEXT    NOT NULL,
  -- Markdown for comments and status updates; NULL for pure events.
  body              TEXT,
  -- JSON, shape varies by kind: {status} | {component, from, to} | {label} | …
  meta              TEXT,
  reactions         TEXT    NOT NULL DEFAULT '{}',
  created_at        INTEGER NOT NULL,
  -- Mirrors the upstream incident_update.updated_at. Without persisting this,
  -- edit detection has nothing to compare against and every poll re-amends
  -- every comment.
  source_updated_at INTEGER,
  edited_at         INTEGER,
  -- Soft delete: an update an operator removed upstream keeps its row so the
  -- timeline keeps its shape.
  deleted_at        INTEGER
) STRICT;

-- The cursor query: WHERE issue_num = ? AND seq > ?. An indexed range scan
-- returning only new rows is what keeps polling cheap under load (SPEC 7.1).
CREATE INDEX idx_timeline_issue_seq ON timeline (issue_num, seq);

CREATE TABLE sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
