/**
 * HTTP client for githubstatus.com.
 *
 * Deliberately thin: `fetch` is native to the Workers runtime, so this exists
 * only to centralise the base URL, the identifying User-Agent (SPEC 10.5), the
 * timeout, and the "never parse a non-200 body" rule.
 */
import { parseSummary, parseIncidentsResponse, type ParsedFeed } from "./parse.js";

export const STATUSPAGE_BASE = "https://www.githubstatus.com";

/**
 * We poll a public endpoint once a minute, which is unobjectionable — but be
 * identifiable about it rather than anonymous.
 */
const USER_AGENT = "gitdown/0.1 (+https://gitdown.chat; status-page mirror)";

const TIMEOUT_MS = 10_000;

export class StatuspageFetchError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "StatuspageFetchError";
    this.status = status;
  }
}

export interface ClientOptions {
  /** Injected in tests; defaults to the runtime's global fetch. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

async function getJson(path: string, options: ClientOptions = {}): Promise<unknown> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = `${options.baseUrl ?? STATUSPAGE_BASE}${path}`;

  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new StatuspageFetchError(
      `request to ${path} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    // Statuspage serves an HTML error page on failure; parsing it would produce
    // a far more confusing error than the status code does.
    throw new StatuspageFetchError(`${path} returned ${response.status}`, response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new StatuspageFetchError(`${path} returned a body that was not JSON`, response.status);
  }
}

/** Current state: page, components, and unresolved incidents in one request. */
export async function fetchSummary(options?: ClientOptions): Promise<ParsedFeed> {
  return parseSummary(await getJson("/api/v2/summary.json", options));
}

/** The most recent ~50 incidents, including resolved ones. */
export async function fetchIncidents(options?: ClientOptions): Promise<ParsedFeed> {
  return parseIncidentsResponse(await getJson("/api/v2/incidents.json", options));
}
