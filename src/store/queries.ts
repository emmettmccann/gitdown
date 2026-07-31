/**
 * Read queries for the API.
 *
 * D1 bills per row read, so every query here selects named columns rather than
 * `*`, filters on an index, and carries a LIMIT. The timeline cursor query in
 * particular is the one that runs on every poll from every viewer, so it is
 * written to touch only rows the caller has not already seen (SPEC 7.1).
 */
import type { IssueState } from "../reconcile/types.js";

export const ISSUES_PER_PAGE = 25;
/** Incidents rarely exceed this; the cursor covers anything longer. */
export const TIMELINE_PAGE_SIZE = 200;

export interface IssueSummary {
  number: number;
  title: string;
  state: IssueState;
  impact: string;
  status: string;
  labels: string[];
  commentCount: number;
  shortlink: string;
  startedAt: number;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TimelineEntry {
  seq: number;
  id: string;
  kind: string;
  actor: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
}

export interface IssueDetail extends IssueSummary {
  events: TimelineEntry[];
  /** Highest seq returned; what the client polls from next. */
  cursor: number;
}

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

export interface IssueListPage {
  issues: IssueSummary[];
  page: number;
  hasMore: boolean;
}

export async function listIssues(
  db: D1Database,
  state: IssueState,
  page: number,
): Promise<IssueListPage> {
  const offset = (page - 1) * ISSUES_PER_PAGE;
  // One extra row is fetched purely to answer "is there a next page" without a
  // second COUNT(*) query over the whole table.
  const result = await db
    .prepare(
      `SELECT ${ISSUE_COLUMNS} FROM issues
        WHERE state = ?1
        ORDER BY updated_at DESC, number DESC
        LIMIT ?2 OFFSET ?3`,
    )
    .bind(state, ISSUES_PER_PAGE + 1, offset)
    .all<IssueRow>();

  const rows = result.results;
  const hasMore = rows.length > ISSUES_PER_PAGE;
  return {
    issues: rows.slice(0, ISSUES_PER_PAGE).map(toSummary),
    page,
    hasMore,
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

export interface TimelinePage {
  events: TimelineEntry[];
  cursor: number;
  hasMore: boolean;
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
