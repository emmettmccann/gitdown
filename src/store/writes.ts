/**
 * The write path (SPEC 9.2).
 *
 * Every user-originated write goes through this module, so the direct-to-D1
 * implementation can be swapped for a queue later without touching a caller.
 * Two properties have to survive that swap and are therefore enforced here
 * rather than at the route:
 *
 *   - `createdAt` is stamped by the caller at the edge, on receipt, and passed
 *     in. Nothing here reads the clock, so queue lag can never rewrite when a
 *     comment was written.
 *   - The accept/reject decision and the close are resolved against the same
 *     row, inside one statement (see `writeComment`).
 */
import { MAX_COMMENT_LENGTH, MAX_NAME_LENGTH, type TimelineEntry } from "../shared/api.js";
import { TIMELINE_COLUMNS, toEntry, type TimelineRow } from "./queries.js";

/** Bot rows use this as their actor; a session may never claim it. */
const BOT_ACTOR = "githubstatus";

/**
 * Names that would let someone impersonate the incident bot in a thread about
 * the incident bot. Broader than an exact match because `github-status`,
 * `githubstatus1` and `GitHub` all read as official at a glance (SPEC 8).
 */
const RESERVED_NAME = /^\s*github/i;

export type WriteFailure =
  | "no-such-issue"
  /** The thread is frozen: closed, and this comment was stamped after it closed. */
  | "closed"
  /** Session id exists with a different token: someone else's identity. */
  | "forbidden"
  | "invalid";

export type WriteResult<T> = { ok: true; value: T } | { ok: false; reason: WriteFailure };

function fail<T>(reason: WriteFailure): WriteResult<T> {
  return { ok: false, reason };
}

/**
 * SHA-256 of the session token, hex.
 *
 * The token is a client-generated random string that only ever travels over
 * TLS in a request body. Storing the digest means a dump of the sessions table
 * does not let the holder post as anyone in it.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  if (RESERVED_NAME.test(name)) return null;
  // The actor column carries either a session id or the literal bot actor, so a
  // name that *is* the bot actor would be ambiguous on read as well as a lie.
  if (name === BOT_ACTOR) return null;
  return name;
}

interface SessionRow {
  token_hash: string;
  display_name: string;
}

/**
 * Resolve a session, creating it on first sight.
 *
 * A session id is client-generated and free to mint, so this is not
 * authentication and must not be described as such — it stops one person
 * posting under another's established name, which is the actual threat (SPEC 8).
 */
async function resolveSession(
  db: D1Database,
  sessionId: string,
  token: string,
  displayName: string,
  now: number,
): Promise<WriteResult<string>> {
  const name = validateName(displayName);
  if (name === null) return fail("invalid");

  const tokenHash = await hashToken(token);

  // Insert-then-read rather than read-then-insert: two first posts from the
  // same new session racing each other both land here, and the loser must see
  // the winner's row instead of overwriting its token hash.
  await db
    .prepare(
      `INSERT INTO sessions (id, token_hash, display_name, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(sessionId, tokenHash, name, now)
    .run();

  const row = await db
    .prepare(`SELECT token_hash, display_name FROM sessions WHERE id = ?1`)
    .bind(sessionId)
    .first<SessionRow>();

  if (!row) return fail("invalid");
  if (row.token_hash !== tokenHash) return fail("forbidden");

  // The established name wins: `displayName` on a comment only ever seeds a new
  // session. Renaming is an explicit, token-checked call.
  return { ok: true, value: row.display_name };
}

export interface CommentInput {
  issueNumber: number;
  sessionId: string;
  token: string;
  displayName: string;
  body: string;
  /** Stamped at the edge on receipt, never at insert time. */
  createdAt: number;
}

export async function writeComment(
  db: D1Database,
  input: CommentInput,
): Promise<WriteResult<TimelineEntry>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > MAX_COMMENT_LENGTH) return fail("invalid");

  const session = await resolveSession(
    db,
    input.sessionId,
    input.token,
    input.displayName,
    input.createdAt,
  );
  if (!session.ok) return session;

  // The author's name is stamped onto the row rather than joined from
  // `sessions` on read. The timeline query runs on every poll from every
  // viewer, and a join would add a row read per comment to the hottest query on
  // the site. The tradeoff is that a later rename does not retitle old
  // comments — which the append-only feed wants anyway: rewriting a row already
  // behind someone's cursor would change history they will never re-fetch.
  const meta = JSON.stringify({ name: session.value });
  const id = crypto.randomUUID();

  const results = await db.batch([
    // The close race (SPEC 9.3). The state test is part of the INSERT rather
    // than a SELECT the route ran a moment ago: a read-then-write gap is
    // exactly when the cron closes the issue, and this is the busiest the
    // thread ever gets. `?5 < resolved_at` is what keeps a comment someone
    // watched themselves type from being dropped because the incident resolved
    // while it was in flight. `resolved_at` is NULL on an open issue, so that
    // comparison is NULL — never true — and the state test carries it.
    db
      .prepare(
        `INSERT INTO timeline (id, issue_num, kind, actor, body, meta, created_at)
         SELECT ?1, number, 'comment', ?2, ?3, ?4, ?5
           FROM issues
          WHERE number = ?6
            AND (state = 'open' OR ?5 < resolved_at)`,
      )
      .bind(id, input.sessionId, body, meta, input.createdAt, input.issueNumber),
    // Denormalised so the issues list never counts comment rows (SPEC 7.2).
    // Conditional on the insert above having happened, and in the same batch —
    // D1 runs a batch as one transaction, so the count cannot drift from the
    // rows even if the insert was rejected.
    db
      .prepare(
        `UPDATE issues SET comment_count = comment_count + 1
          WHERE number = ?1 AND EXISTS (SELECT 1 FROM timeline WHERE id = ?2)`,
      )
      .bind(input.issueNumber, id),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) {
    // Nothing was written. Distinguish "there is no such issue" from "the thread
    // is frozen" only now, on the failure path, so the happy path stays at one
    // round trip.
    const issue = await db
      .prepare(`SELECT state FROM issues WHERE number = ?1`)
      .bind(input.issueNumber)
      .first<{ state: string }>();
    return fail(issue ? "closed" : "no-such-issue");
  }

  const row = await db
    .prepare(`SELECT ${TIMELINE_COLUMNS} FROM timeline WHERE id = ?1`)
    .bind(id)
    .first<TimelineRow>();

  return row ? { ok: true, value: toEntry(row) } : fail("invalid");
}

/**
 * Rename a session (SPEC 9.1). Requires the token, which is the whole point:
 * the session id is public, so without this check anyone could rename anyone.
 */
export async function setDisplayName(
  db: D1Database,
  sessionId: string,
  token: string,
  displayName: string,
  now: number,
): Promise<WriteResult<string>> {
  const name = validateName(displayName);
  if (name === null) return fail("invalid");

  const row = await db
    .prepare(`SELECT token_hash, display_name FROM sessions WHERE id = ?1`)
    .bind(sessionId)
    .first<SessionRow>();

  // An unknown session has nothing to rename; it gets its name by posting.
  if (!row) return fail("no-such-issue");
  if (row.token_hash !== (await hashToken(token))) return fail("forbidden");

  await db
    .prepare(`UPDATE sessions SET display_name = ?2, last_seen_at = ?3 WHERE id = ?1`)
    .bind(sessionId, name, now)
    .run();

  return { ok: true, value: name };
}
