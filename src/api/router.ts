/**
 * API routes (SPEC 9.1).
 *
 * Reads are edge-cached and idempotent; writes are neither, and are kept
 * visibly apart below. Nothing on the write path may be cached — a cached
 * `201` would replay someone else's comment back at the next poster.
 */
import type { IssueState } from "../reconcile/types.js";
import {
  getIssueDetail,
  getIssueSummary,
  getTimeline,
  listIssues,
  TIMELINE_PAGE_SIZE,
} from "../store/queries.js";
import { setDisplayName, writeComment, type WriteFailure } from "../store/writes.js";
import type { CommentRequest, NameRequest } from "../shared/api.js";
import {
  POLICY,
  jsonResponse,
  policyForIssue,
  withEdgeCache,
  type CachePolicy,
} from "./cache.js";

const ISSUE_PATH = /^\/api\/issues\/(\d+)$/;
const TIMELINE_PATH = /^\/api\/issues\/(\d+)\/timeline$/;
const COMMENTS_PATH = /^\/api\/issues\/(\d+)\/comments$/;
const SESSION_NAME_PATH = "/api/session/name";

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

// ---------------------------------------------------------------- write path

/** Writes are never cached, so they carry no policy — just `no-store`. */
function writeResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const WRITE_ERROR: Record<WriteFailure, { status: number; message: string }> = {
  "no-such-issue": { status: 404, message: "no such issue" },
  // SPEC 9.3: closed is frozen, and the client swaps in the locked state.
  closed: { status: 409, message: "this conversation has been locked" },
  forbidden: { status: 403, message: "that session belongs to someone else" },
  invalid: { status: 400, message: "comment or display name is not acceptable" },
};

function failureResponse(reason: WriteFailure): Response {
  const { status, message } = WRITE_ERROR[reason];
  return errorResponse(status, message);
}

/** Parses a JSON body without trusting any of it to be the shape it claims. */
async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

async function handleComment(
  request: Request,
  db: D1Database,
  issueNumber: number,
  now: number,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "body must be a JSON object");

  const fields: Partial<CommentRequest> = {
    sessionId: readString(body, "sessionId") ?? undefined,
    token: readString(body, "token") ?? undefined,
    displayName: readString(body, "displayName") ?? undefined,
    body: readString(body, "body") ?? undefined,
  };

  if (!fields.sessionId || !fields.token || !fields.displayName || fields.body === undefined) {
    return errorResponse(400, "sessionId, token, displayName and body are required");
  }

  const result = await writeComment(db, {
    issueNumber,
    sessionId: fields.sessionId,
    token: fields.token,
    displayName: fields.displayName,
    body: fields.body,
    // Stamped here, on receipt at the edge — not at insert time, and not from
    // anything the client sent (SPEC 9.2).
    createdAt: now,
  });

  if (!result.ok) return failureResponse(result.reason);
  return writeResponse({ entry: result.value }, 201);
}

async function handleRename(request: Request, db: D1Database, now: number): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "body must be a JSON object");

  const fields: Partial<NameRequest> = {
    sessionId: readString(body, "sessionId") ?? undefined,
    token: readString(body, "token") ?? undefined,
    displayName: readString(body, "displayName") ?? undefined,
  };

  if (!fields.sessionId || !fields.token || !fields.displayName) {
    return errorResponse(400, "sessionId, token and displayName are required");
  }

  const result = await setDisplayName(
    db,
    fields.sessionId,
    fields.token,
    fields.displayName,
    now,
  );

  if (!result.ok) {
    // The shared failure map words this one for issues; a rename of a session
    // that never posted is its own thing.
    if (result.reason === "no-such-issue") return errorResponse(404, "no such session");
    return failureResponse(result.reason);
  }
  return writeResponse({ displayName: result.value }, 200);
}

export async function handleApiRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  now: number = Date.now(),
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "POST") {
    const commentMatch = COMMENTS_PATH.exec(pathname);
    if (commentMatch) {
      return handleComment(request, env.DB, Number(commentMatch[1]), now);
    }
    return errorResponse(404, "no such endpoint");
  }

  if (request.method === "PUT") {
    if (pathname === SESSION_NAME_PATH) return handleRename(request, env.DB, now);
    return errorResponse(404, "no such endpoint");
  }

  if (request.method !== "GET") {
    return errorResponse(405, "unsupported method");
  }

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
