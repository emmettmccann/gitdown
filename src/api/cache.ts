/**
 * Edge caching for the read path.
 *
 * This is the mechanism the cost model rests on (SPEC 7.1). During a spike
 * nearly every request is a poll for one hot issue; served from `caches.default`
 * those polls never reach D1, so database load stops scaling with viewer count.
 * The Worker still runs — a Worker route always invokes the Worker — but Worker
 * requests are the cheap axis.
 */
import type { IssueSummary } from "../store/queries.js";

export interface CachePolicy {
  maxAge: number;
  immutable?: boolean;
}

const YEAR_SECONDS = 31_536_000;

export const POLICY = {
  /** The issues list: changes only when ingestion writes. */
  list: { maxAge: 10 } satisfies CachePolicy,
  /** A live thread. Short enough to feel current, long enough to collapse a spike. */
  live: { maxAge: 5 } satisfies CachePolicy,
  /** A frozen thread: it can never change again (SPEC 7.3). */
  frozen: { maxAge: YEAR_SECONDS, immutable: true } satisfies CachePolicy,
} as const;

/**
 * How long after upstream resolution a thread may be cached forever.
 *
 * Two things have to have happened first, and both are measured from the
 * *upstream* `resolved_at` because that is the only close timestamp we store:
 *
 *   - up to 60s for the cron to notice the resolution and close our issue, and
 *   - the 60s settling window from SPEC 9.3, during which writes accepted just
 *     before the close may still be landing.
 *
 * Marking a thread immutable while a comment could still arrive would strand
 * that comment behind a year-long cache entry, on the busiest thread the site
 * ever has. The cost of being conservative is 120 seconds of ordinary caching.
 */
export const FREEZE_DELAY_MS = 120_000;

export function policyForIssue(issue: IssueSummary, now: number): CachePolicy {
  if (issue.state !== "closed") return POLICY.live;
  if (issue.resolvedAt === null) return POLICY.live;
  return now - issue.resolvedAt > FREEZE_DELAY_MS ? POLICY.frozen : POLICY.live;
}

export function cacheControl(policy: CachePolicy): string {
  const directives = [`public`, `max-age=${policy.maxAge}`];
  if (policy.immutable) directives.push("immutable");
  return directives.join(", ");
}

export interface CachedPayload {
  data: unknown;
  policy: CachePolicy;
  /** Strong validator for conditional requests; usually the timeline cursor. */
  etag?: string;
}

export function jsonResponse(payload: CachedPayload, status = 200): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl(payload.policy),
  });
  if (payload.etag) headers.set("etag", payload.etag);
  return new Response(JSON.stringify(payload.data), { status, headers });
}

function notModified(response: Response): Response {
  const headers = new Headers();
  for (const header of ["cache-control", "etag"]) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  return new Response(null, { status: 304, headers });
}

function matchesEtag(request: Request, response: Response): boolean {
  const etag = response.headers.get("etag");
  if (!etag) return false;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (!ifNoneMatch) return false;
  // A cache may weaken the validator on the way back, so compare unprefixed.
  const strip = (value: string) => value.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => strip(candidate) === strip(etag));
}

/**
 * Serve `build()` through the edge cache.
 *
 * The 304 check runs against whichever response we ended up with, cached or
 * fresh, so an idle poller costs a few bytes and no body at all.
 */
export async function withEdgeCache(
  request: Request,
  ctx: ExecutionContext,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = caches.default;

  const hit = await cache.match(request);
  if (hit) {
    return matchesEtag(request, hit) ? notModified(hit) : hit;
  }

  const response = await build();

  // Only success responses are worth storing; an error cached for a year would
  // be unrecoverable without a purge.
  if (response.status === 200) {
    ctx.waitUntil(cache.put(request, response.clone()));
  }

  return matchesEtag(request, response) ? notModified(response) : response;
}
