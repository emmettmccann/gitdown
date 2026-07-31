/**
 * Read queries for the API.
 *
 * D1 bills per row read, so every query here selects named columns rather than
 * `*`, filters on an index, and carries a LIMIT. The timeline cursor query in
 * particular is the one that runs on every poll from every viewer, so it is
 * written to touch only rows the caller has not already seen (SPEC 7.1).
 */
import type {
  IssueDetail,
  IssueListPage,
  IssueState,
  IssueSummary,
  TimelineEntry,
  TimelinePage,
} from "../shared/api.js";

export type { IssueDetail, IssueListPage, IssueSummary, TimelineEntry, TimelinePage };

export const ISSUES_PER_PAGE = 25;
/** Incidents rarely exceed this; the cursor covers anything longer. */
export const TIMELINE_PAGE_SIZE = 200;

interface IssueRow {
  number: number;
  title: string;
  state: string;
  impact: string;
  status: string;
  components: string;
  comment_count: number;
  shortlink: string;
  started_at: number;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

interface TimelineRow {
  seq: number;
  id: string;
  kind: string;
  actor: string;
  body: string | null;
  meta: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

const ISSUE_COLUMNS = `number, title, state, impact, status, components, comment_count,
                       shortlink, started_at, resolved_at, created_at, updated_at`;

const TIMELINE_COLUMNS = `seq, id, kind, actor, body, meta, created_at, edited_at, deleted_at`;

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toSummary(row: IssueRow): IssueSummary {
  return {
    number: row.number,
    title: row.title,
    state: row.state as IssueState,
    impact: row.impact,
    status: row.status,
    labels: [`impact:${row.impact}`, ...parseJsonArray(row.components)],
    commentCount: row.comment_count,
    shortlink: row.shortlink,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEntry(row: TimelineRow): TimelineEntry {
  const deleted = row.deleted_at !== null;
  return {
    seq: row.seq,
    id: row.id,
    kind: row.kind,
    actor: row.actor,
    // A removed update keeps its row so the timeline keeps its shape, but its
    // text must not be served — the client renders the "hidden" treatment.
    body: deleted ? null : row.body,
    meta: deleted ? null : parseMeta(row.meta),
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deleted,
  };
}

export async function listIssues(
  db: D1Database,
  state: IssueState,
  page: number,
): Promise<IssueListPage> {
  const offset = (page - 1) * ISSUES_PER_PAGE;

  const [listResult, countResult] = await db.batch<IssueRow | { state: string; n: number }>([
    // Newest-opened first. Reconcile hands out numbers oldest-first, so
    // `number DESC` is open-date order without reading a timestamp column, and
    // it is stable under pagination: a comment landing on an old issue cannot
    // shuffle it up the list and push a row the reader has already seen onto
    // the next page.
    //
    // One extra row is fetched purely to answer "is there a next page" without
    // a second count query over the whole table.
    db
      .prepare(
        `SELECT ${ISSUE_COLUMNS} FROM issues
          WHERE state = ?1
          ORDER BY number DESC
          LIMIT ?2 OFFSET ?3`,
      )
      .bind(state, ISSUES_PER_PAGE + 1, offset),
    // Bounded by the number of incidents ever recorded — thousands at most, and
    // cached for 10s at the edge. This is the aggregate SPEC 7.2 permits; the
    // one it forbids is COUNT(*) over comments, which grows without limit.
    db.prepare(`SELECT state, COUNT(*) AS n FROM issues GROUP BY state`),
  ]);

  const rows = (listResult?.results ?? []) as IssueRow[];
  const hasMore = rows.length > ISSUES_PER_PAGE;

  const counts = { open: 0, closed: 0 };
  for (const row of (countResult?.results ?? []) as { state: string; n: number }[]) {
    if (row.state === "open" || row.state === "closed") counts[row.state] = row.n;
  }

  return {
    issues: rows.slice(0, ISSUES_PER_PAGE).map(toSummary),
    page,
    hasMore,
    counts,
  };
}

export async function getIssueSummary(
  db: D1Database,
  number: number,
): Promise<IssueSummary | null> {
  const row = await db
    .prepare(`SELECT ${ISSUE_COLUMNS} FROM issues WHERE number = ?1`)
    .bind(number)
    .first<IssueRow>();
  return row ? toSummary(row) : null;
}

/**
 * Timeline rows after `since`.
 *
 * The (issue_num, seq) index makes this a range scan that reads only new rows,
 * so a poll on a quiet thread reads nothing at all.
 */
export async function getTimeline(
  db: D1Database,
  issueNumber: number,
  since = 0,
  limit = TIMELINE_PAGE_SIZE,
): Promise<TimelinePage> {
  const result = await db
    .prepare(
      `SELECT ${TIMELINE_COLUMNS} FROM timeline
        WHERE issue_num = ?1 AND seq > ?2
        ORDER BY seq
        LIMIT ?3`,
    )
    .bind(issueNumber, since, limit + 1)
    .all<TimelineRow>();

  const rows = result.results;
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map(toEntry);

  return {
    events,
    // Unchanged when nothing came back, so an idle poller keeps its place.
    cursor: events.at(-1)?.seq ?? since,
    hasMore,
  };
}

export async function getIssueDetail(
  db: D1Database,
  number: number,
): Promise<IssueDetail | null> {
  const summary = await getIssueSummary(db, number);
  if (!summary) return null;

  const timeline = await getTimeline(db, number);
  return { ...summary, events: timeline.events, cursor: timeline.cursor };
}
