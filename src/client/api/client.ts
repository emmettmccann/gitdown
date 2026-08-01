/**
 * Typed wrappers over the API. One `fetch` per endpoint and nothing else —
 * caching, retries and optimistic state all live a layer up, in `queries.ts`.
 *
 * Request and response types come from the shared contract
 * (src/shared/api.ts), which the Worker builds against, so a change to the API
 * shape breaks the client at compile time rather than at runtime in front of
 * whoever showed up during an outage.
 */
import type {
  CommentCreated,
  CommentRequest,
  IssueDetail,
  IssueListPage,
  IssueState,
  NameRequest,
  TimelineResponse,
} from "../../shared/api.js";

export type { IssueDetail, IssueListPage, TimelineResponse };

/**
 * A request that failed for a reason the UI has to tell apart from the rest.
 *
 * `409` in particular is not an error to retry: the thread froze while the
 * comment was in flight (SPEC 9.3), and the composer becomes the locked notice.
 * Reads carry the status too, so the retry policy can stop hammering a `404`
 * that is never going to become a `200`.
 */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function sendJson<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // The server sends `{error}`; a proxy or a truncated response might not.
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, detail?.error ?? `request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function fetchIssues(state: IssueState, page = 1): Promise<IssueListPage> {
  return getJson(`/api/issues?state=${state}&page=${page}`);
}

export function fetchIssue(number: number): Promise<IssueDetail> {
  return getJson(`/api/issues/${number}`);
}

export function fetchTimeline(number: number, since: number): Promise<TimelineResponse> {
  return getJson(`/api/issues/${number}/timeline?since=${since}`);
}

export function postComment(
  number: number,
  request: CommentRequest,
): Promise<CommentCreated> {
  return sendJson(`/api/issues/${number}/comments`, "POST", request);
}

export function putDisplayName(request: NameRequest): Promise<{ displayName: string }> {
  return sendJson(`/api/session/name`, "PUT", request);
}
