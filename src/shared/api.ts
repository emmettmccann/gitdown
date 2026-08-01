/**
 * The API contract, shared verbatim by the Worker and the browser.
 *
 * Deliberately free of any Workers or DOM dependency so both sides can import
 * it: the server builds these shapes out of D1 rows, the client consumes them,
 * and a change to either breaks the other at compile time rather than at
 * runtime in front of whoever showed up during an outage.
 */

export type IssueState = "open" | "closed";

export interface IssueSummary {
  number: number;
  title: string;
  state: IssueState;
  impact: string;
  status: string;
  /** Impact label first, then component names. */
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
  /** Withheld when the entry is deleted. */
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
}

/**
 * What the browser sends to post a comment (SPEC 9.1).
 *
 * `token` is the session secret and appears only in request bodies — never in a
 * URL, where it would land in logs and `Referer` headers.
 */
export interface CommentRequest {
  /** Public: becomes the row's `actor` and identifies the author in the feed. */
  sessionId: string;
  token: string;
  /**
   * Used only if this session id is new. An established session keeps the name
   * the server already holds; renaming is `PUT /api/session/name`, so a stolen
   * session id cannot rename someone by posting.
   */
  displayName: string;
  body: string;
}

export interface CommentCreated {
  entry: TimelineEntry;
}

export interface NameRequest {
  sessionId: string;
  token: string;
  displayName: string;
}

/** The longest comment the server will store. Matches the composer's counter. */
export const MAX_COMMENT_LENGTH = 4000;
export const MAX_NAME_LENGTH = 40;

export interface IssueListPage {
  issues: IssueSummary[];
  page: number;
  hasMore: boolean;
  counts: { open: number; closed: number };
}

export interface TimelinePage {
  events: TimelineEntry[];
  /** Highest seq returned; what the client polls from next. */
  cursor: number;
  hasMore: boolean;
}

export interface IssueDetail extends IssueSummary {
  events: TimelineEntry[];
  cursor: number;
}

/** What the timeline endpoint adds on top of the page itself. */
export interface TimelineResponse extends TimelinePage {
  state: IssueState;
  updatedAt: number;
}
