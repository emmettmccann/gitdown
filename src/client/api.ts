/**
 * Typed wrappers over the read API.
 *
 * Response types come from the shared contract (src/shared/api.ts), which the
 * Worker builds against, so a change to the API shape breaks the client at
 * compile time rather than at runtime in front of whoever showed up during an
 * outage.
 */
import type {
  IssueDetail,
  IssueListPage,
  IssueState,
  TimelineResponse,
} from "../shared/api.js";

export type { IssueDetail, IssueListPage, TimelineResponse };

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
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
