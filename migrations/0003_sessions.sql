-- Sessions for the write path (SPEC 8, 9).
--
-- Only sessions are new here. User comments go into the existing `timeline`
-- table, which was built for them from the start: `id` takes a uuid for user
-- content, `actor` takes a session id instead of 'githubstatus', and the seq
-- cursor means a comment reaches pollers by the same path a bot update does.
-- A second table would have needed a merge on every render and a second cursor.

CREATE TABLE sessions (
  -- Client-generated uuid. Public: it identifies the comment author in the
  -- feed, so it is never a secret and never a credential.
  id           TEXT    PRIMARY KEY,
  -- SHA-256 of the session token, hex. The token itself is never stored and
  -- never rendered; this column is the whole difference between "names are
  -- decoration" and "names are hard to steal" (SPEC 8).
  token_hash   TEXT    NOT NULL,
  display_name TEXT    NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) STRICT;
