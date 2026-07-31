import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest } from "../../src/api/router.js";
import { FREEZE_DELAY_MS } from "../../src/api/cache.js";
import { diffIncident } from "../../src/reconcile/diff.js";
import { D1IssueStore } from "../../src/store/d1.js";
import { ISSUES_PER_PAGE } from "../../src/store/queries.js";
import { parseIncidentsResponse } from "../../src/statuspage/parse.js";
import type { Incident } from "../../src/statuspage/schema.js";
import { snapshotAfter } from "../helpers/replay.js";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

const PAGE = (incidentsFixture as { page: unknown }).page;
const RICH = parseIncidentsResponse({ page: PAGE, incidents: [richIncidentFixture] })
  .incidents[0]!;

/** Distinct URLs per test keep the edge cache from leaking between cases. */
let salt = 0;
function url(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `https://gitdown.chat${path}${separator}t=${salt}`;
}

async function call(path: string, init?: RequestInit, now?: number): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await handleApiRequest(new Request(url(path), init), env, ctx, now);
  await waitOnExecutionContext(ctx);
  return response;
}

async function seed(incident: Incident): Promise<void> {
  await new D1IssueStore(env.DB).apply(diffIncident(incident, null));
}

beforeEach(async () => {
  salt += 1;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM timeline"),
    env.DB.prepare("DELETE FROM issues"),
    env.DB.prepare("DELETE FROM sync_state"),
    env.DB.prepare("DELETE FROM sqlite_sequence"),
  ]);
});

describe("GET /api/issues", () => {
  it("lists open issues by default", async () => {
    await seed(snapshotAfter(RICH, 1));

    const response = await call("/api/issues");
    const body = await response.json<{ issues: { number: number; state: string }[] }>();

    expect(response.status).toBe(200);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]!.state).toBe("open");
  });

  it("filters to closed issues on request", async () => {
    await seed(RICH);

    expect((await call("/api/issues").then((r) => r.json<{ issues: unknown[] }>())).issues).toHaveLength(0);
    const closed = await call("/api/issues?state=closed").then((r) =>
      r.json<{ issues: { number: number }[] }>(),
    );
    expect(closed.issues).toHaveLength(1);
  });

  it("exposes labels built from impact and components", async () => {
    await seed(RICH);
    const body = await call("/api/issues?state=closed").then((r) =>
      r.json<{ issues: { labels: string[] }[] }>(),
    );

    expect(body.issues[0]!.labels).toContain("impact:critical");
    expect(body.issues[0]!.labels).toContain("Actions");
  });

  it("paginates without a second count query", async () => {
    const feed = parseIncidentsResponse(incidentsFixture as unknown);
    const store = new D1IssueStore(env.DB);
    for (const incident of feed.incidents) {
      await store.apply(diffIncident(incident, null));
    }

    const first = await call("/api/issues?state=closed").then((r) =>
      r.json<{ issues: unknown[]; hasMore: boolean; page: number }>(),
    );
    expect(first.issues).toHaveLength(ISSUES_PER_PAGE);
    expect(first.hasMore).toBe(true);
    expect(first.page).toBe(1);

    const third = await call("/api/issues?state=closed&page=3").then((r) =>
      r.json<{ issues: unknown[]; hasMore: boolean }>(),
    );
    expect(third.hasMore).toBe(false);
  });

  it("rejects an unknown state", async () => {
    const response = await call("/api/issues?state=onfire");
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a non-numeric page", async () => {
    expect((await call("/api/issues?page=two")).status).toBe(400);
    expect((await call("/api/issues?page=0")).status).toBe(400);
  });
});

describe("GET /api/issues/:n", () => {
  it("returns the issue with its timeline", async () => {
    await seed(RICH);
    const body = await call("/api/issues/1").then((r) =>
      r.json<{ number: number; events: { kind: string }[]; cursor: number }>(),
    );

    expect(body.number).toBe(1);
    expect(body.events[0]!.kind).toBe("opened");
    expect(body.events.filter((e) => e.kind === "status_update")).toHaveLength(18);
    expect(body.cursor).toBeGreaterThan(0);
  });

  it("404s for an issue that does not exist", async () => {
    const response = await call("/api/issues/999");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("withholds the body of a removed update but keeps its place", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const removed = RICH.incident_updates[2]!;
    const trimmed: Incident = {
      ...RICH,
      updated_at: RICH.updated_at + 1000,
      incident_updates: RICH.incident_updates.filter((u) => u.id !== removed.id),
    };
    await store.apply(diffIncident(trimmed, (await store.loadByIncidentId(RICH.id))!));

    const body = await call("/api/issues/1").then((r) =>
      r.json<{ events: { id: string; body: string | null; deleted: boolean }[] }>(),
    );
    const hidden = body.events.find((e) => e.id === removed.id)!;

    expect(hidden.deleted).toBe(true);
    expect(hidden.body).toBeNull();
  });
});

describe("GET /api/issues/:n/timeline", () => {
  it("returns only rows after the cursor", async () => {
    await seed(RICH);
    const full = await call("/api/issues/1/timeline").then((r) =>
      r.json<{ events: { seq: number }[]; cursor: number }>(),
    );

    const midpoint = full.events[5]!.seq;
    const rest = await call(`/api/issues/1/timeline?since=${midpoint}`).then((r) =>
      r.json<{ events: { seq: number }[] }>(),
    );

    expect(rest.events.every((e) => e.seq > midpoint)).toBe(true);
    expect(rest.events).toHaveLength(full.events.length - 6);
  });

  it("returns nothing and holds the cursor when the thread is quiet", async () => {
    await seed(RICH);
    const full = await call("/api/issues/1/timeline").then((r) =>
      r.json<{ cursor: number }>(),
    );

    const idle = await call(`/api/issues/1/timeline?since=${full.cursor}`).then((r) =>
      r.json<{ events: unknown[]; cursor: number }>(),
    );

    expect(idle.events).toEqual([]);
    expect(idle.cursor).toBe(full.cursor);
  });

  it("rejects a malformed cursor", async () => {
    await seed(RICH);
    expect((await call("/api/issues/1/timeline?since=abc")).status).toBe(400);
  });

  it("404s rather than serving an empty timeline for a missing issue", async () => {
    expect((await call("/api/issues/42/timeline")).status).toBe(404);
  });
});

describe("caching", () => {
  it("caches the list briefly", async () => {
    await seed(RICH);
    const response = await call("/api/issues?state=closed");
    expect(response.headers.get("cache-control")).toBe("public, max-age=10");
  });

  it("caches a live thread briefly", async () => {
    await seed(snapshotAfter(RICH, 1));
    const response = await call("/api/issues/1");
    expect(response.headers.get("cache-control")).toBe("public, max-age=5");
  });

  it("caches a settled closed thread forever", async () => {
    // Closed is permanent (SPEC 7.3), so the thread can never change again.
    await seed(RICH);
    const response = await call("/api/issues/1", undefined, RICH.resolved_at! + FREEZE_DELAY_MS + 1);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("does not freeze a thread that only just closed", async () => {
    // Writes accepted just before the close may still be landing; freezing now
    // would strand them behind a year-long cache entry (SPEC 9.3).
    await seed(RICH);
    const response = await call("/api/issues/1", undefined, RICH.resolved_at! + 1_000);
    expect(response.headers.get("cache-control")).toBe("public, max-age=5");
  });

  it("answers a repeat poll with 304 and no body", async () => {
    await seed(RICH);
    const first = await call("/api/issues/1/timeline");
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();

    const second = await call("/api/issues/1/timeline", {
      headers: { "if-none-match": etag },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("tolerates a weakened validator from an intermediary", async () => {
    await seed(RICH);
    const first = await call("/api/issues/1/timeline");
    const etag = first.headers.get("etag")!;

    const second = await call("/api/issues/1/timeline", {
      headers: { "if-none-match": `W/${etag}` },
    });
    expect(second.status).toBe(304);
  });

  it("changes the validator when the timeline grows", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(snapshotAfter(RICH, 1), null));
    const before = (await call("/api/issues/1/timeline")).headers.get("etag");

    await store.apply(
      diffIncident(snapshotAfter(RICH, 2), (await store.loadByIncidentId(RICH.id))!),
    );
    salt += 1; // bypass the edge cache, as a real 5s expiry would
    const after = (await call("/api/issues/1/timeline")).headers.get("etag");

    expect(after).not.toBe(before);
  });

  it("never caches an error", async () => {
    const response = await call("/api/issues/999");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
  });
});

describe("method and route handling", () => {
  it("rejects writes while the API is read-only", async () => {
    const response = await call("/api/issues", { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("404s an unknown endpoint", async () => {
    expect((await call("/api/nope")).status).toBe(404);
  });
});
