/**
 * API routes (SPEC 9.1). Read-only for now — the write path is step 6.
 */
import type { IssueState } from "../reconcile/types.js";
import {
  getIssueDetail,
  getIssueSummary,
  getTimeline,
  listIssues,
  TIMELINE_PAGE_SIZE,
} from "../store/queries.js";
import {
  POLICY,
  jsonResponse,
  policyForIssue,
  withEdgeCache,
  type CachePolicy,
} from "./cache.js";

const ISSUE_PATH = /^\/api\/issues\/(\d+)$/;
const TIMELINE_PATH = /^\/api\/issues\/(\d+)\/timeline$/;

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Errors must never be cached at the edge; a cached 404 would outlive the
      // ingestion run that would have created the issue.
      "cache-control": "no-store",
    },
  });
}

function parseState(raw: string | null): IssueState | null {
  if (raw === null || raw === "open") return "open";
  if (raw === "closed") return "closed";
  return null;
}

function parsePositiveInt(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** The cursor doubles as the validator: same cursor means same timeline. */
function cursorEtag(issueNumber: number, cursor: number, policy: CachePolicy): string {
  return `"i${issueNumber}-c${cursor}-m${policy.maxAge}"`;
}

async function handleList(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const state = parseState(url.searchParams.get("state"));
  if (state === null) return errorResponse(400, "state must be 'open' or 'closed'");

  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  if (page === null || page < 1) return errorResponse(400, "page must be a positive integer");

  const result = await listIssues(db, state, page);
  return jsonResponse({ data: result, policy: POLICY.list });
}

async function handleIssue(db: D1Database, number: number, now: number): Promise<Response> {
  const issue = await getIssueDetail(db, number);
  if (!issue) return errorResponse(404, "no such issue");

  const policy = policyForIssue(issue, now);
  return jsonResponse({
    data: issue,
    policy,
    etag: cursorEtag(number, issue.cursor, policy),
  });
}

async function handleTimeline(
  request: Request,
  db: D1Database,
  number: number,
  now: number,
): Promise<Response> {
  const url = new URL(request.url);
  const since = parsePositiveInt(url.searchParams.get("since"), 0);
  if (since === null) return errorResponse(400, "since must be a non-negative integer");

  // The issue row is read first because the cache policy depends on its state,
  // and because polling a number that does not exist should 404 rather than
  // return an empty timeline forever.
  const issue = await getIssueSummary(db, number);
  if (!issue) return errorResponse(404, "no such issue");

  const page = await getTimeline(db, number, since, TIMELINE_PAGE_SIZE);
  const policy = policyForIssue(issue, now);

  return jsonResponse({
    data: { ...page, state: issue.state, updatedAt: issue.updatedAt },
    policy,
    etag: cursorEtag(number, page.cursor, policy),
  });
}

export async function handleApiRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  now: number = Date.now(),
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "the API is read-only");
  }

  const { pathname } = new URL(request.url);

  if (pathname === "/api/issues") {
    return withEdgeCache(request, ctx, () => handleList(request, env.DB));
  }

  const issueMatch = ISSUE_PATH.exec(pathname);
  if (issueMatch) {
    return withEdgeCache(request, ctx, () =>
      handleIssue(env.DB, Number(issueMatch[1]), now),
    );
  }

  const timelineMatch = TIMELINE_PATH.exec(pathname);
  if (timelineMatch) {
    return withEdgeCache(request, ctx, () =>
      handleTimeline(request, env.DB, Number(timelineMatch[1]), now),
    );
  }

  return errorResponse(404, "no such endpoint");
}
