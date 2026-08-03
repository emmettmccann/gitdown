import { describe, expect, it } from "vitest";
import { BACKFILL_KEY, BACKFILL_WINDOW_DAYS, backfill, poll } from "../../src/ingest/index.js";
import { MemoryIssueStore } from "../helpers/memory-store.js";
import incidentsFixture from "../fixtures/incidents.json";
import summaryFixture from "../fixtures/summary.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

const DAY = 24 * 60 * 60 * 1000;

/** Newest incident in the recorded history, used to anchor the fake clock. */
const NEWEST = Math.max(
  ...(incidentsFixture as { incidents: { created_at: string }[] }).incidents.map((i) =>
    Date.parse(i.created_at),
  ),
);

function stubFetch(body: unknown): typeof fetch {
  return (async () => Response.json(body)) as typeof fetch;
}

function countingFetch(body: unknown) {
  let calls = 0;
  const fn = (async () => {
    calls += 1;
    return Response.json(body);
  }) as typeof fetch;
  return { fetch: fn, calls: () => calls };
}

describe("backfill", () => {
  it("seeds only the configured window of history", async () => {
    const store = new MemoryIssueStore();
    const now = () => NEWEST + DAY;

    const result = await backfill(store, { fetch: stubFetch(incidentsFixture), now });

    const cutoff = now() - BACKFILL_WINDOW_DAYS * DAY;
    const expected = (incidentsFixture as { incidents: { created_at: string }[] }).incidents.filter(
      (i) => Date.parse(i.created_at) >= cutoff,
    ).length;

    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(50); // the window really is filtering
    expect(result!.opened).toBe(expected);
    expect(store.issueCount).toBe(expected);
  });

  it("seeds nothing when the window predates all recorded history", async () => {
    // GitHub is usually fine, so a fresh deploy may legitimately have an empty
    // issue list (SPEC 4.6).
    const store = new MemoryIssueStore();
    const result = await backfill(store, {
      fetch: stubFetch(incidentsFixture),
      now: () => NEWEST + 365 * DAY,
    });

    expect(result!.opened).toBe(0);
    expect(store.issueCount).toBe(0);
  });

  it("records completion so it never runs twice", async () => {
    const store = new MemoryIssueStore();
    const { fetch, calls } = countingFetch(incidentsFixture);
    const now = () => NEWEST + DAY;

    await backfill(store, { fetch, now });
    expect(await store.getSyncState(BACKFILL_KEY)).not.toBeNull();
    const afterFirst = calls();

    const second = await backfill(store, { fetch, now });
    expect(second).toBeNull();
    expect(calls()).toBe(afterFirst); // did not even fetch
  });

  it("leaves backfill pending if it fails part-way", async () => {
    // Marked complete on a partial run, the missing history would never be
    // seeded.
    const store = new MemoryIssueStore();
    const failing = Object.create(store) as MemoryIssueStore;
    failing.apply = async () => {
      throw new Error("d1 unavailable");
    };

    await expect(
      backfill(failing, { fetch: stubFetch(incidentsFixture), now: () => NEWEST + DAY }),
    ).rejects.toThrow("d1 unavailable");

    expect(await store.getSyncState(BACKFILL_KEY)).toBeNull();
  });

  it("ignores the page cursor, since it deliberately reprocesses old feeds", async () => {
    const store = new MemoryIssueStore();
    await backfill(store, { fetch: stubFetch(incidentsFixture), now: () => NEWEST + DAY });

    // A live poll straight afterwards must still be able to run.
    const result = await poll(store, { fetch: stubFetch(summaryFixture) });
    expect(result.skipped).toBe(false);
  });
});

describe("poll", () => {
  it("reconciles the live summary feed", async () => {
    const store = new MemoryIssueStore();
    const live = {
      ...(summaryFixture as Record<string, unknown>),
      incidents: [richIncidentFixture],
    };

    const result = await poll(store, { fetch: stubFetch(live) });

    expect(result.opened).toBe(1);
    expect(store.issueCount).toBe(1);
  });

  it("skips when the status page has not moved", async () => {
    const store = new MemoryIssueStore();
    const fetch = stubFetch(summaryFixture);

    await poll(store, { fetch });
    expect((await poll(store, { fetch })).skipped).toBe(true);
  });

  it("surfaces rejected incidents rather than swallowing them", async () => {
    const store = new MemoryIssueStore();
    const live = {
      ...(summaryFixture as Record<string, unknown>),
      incidents: [{ id: "broken", status: "vibing" }],
    };

    const result = await poll(store, { fetch: stubFetch(live) });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.id).toBe("broken");
  });
});

describe("catching up on incidents that resolved between polls", () => {
  const RICH_ID = (richIncidentFixture as { id: string }).id;

  /** A summary feed, with a page cursor that moves so polls are not skipped. */
  function summaryAt(incidents: unknown[], tick: number): unknown {
    const base = summaryFixture as { page: Record<string, unknown> };
    return {
      ...(summaryFixture as Record<string, unknown>),
      page: { ...base.page, updated_at: `2026-07-20T04:${String(tick).padStart(2, "0")}:00.000Z` },
      incidents,
    };
  }

  /** The fixture as it stood before its resolving update was posted. */
  function stillOpen(): unknown {
    const raw = richIncidentFixture as Record<string, unknown>;
    const updates = (raw["incident_updates"] as { status: string }[]).filter(
      (update) => update.status !== "resolved",
    );
    return {
      ...raw,
      status: "monitoring",
      resolved_at: null,
      updated_at: "2026-07-20T04:43:50.571Z",
      incident_updates: updates,
    };
  }

  /** Routes by path, so a test can assert whether the big feed was fetched. */
  function routedFetch(bodies: { summary: unknown; incidents?: unknown | Error }) {
    const paths: string[] = [];
    const fn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      paths.push(new URL(url).pathname);
      if (url.endsWith("/incidents.json")) {
        if (bodies.incidents === undefined) throw new Error("unexpected incidents.json fetch");
        if (bodies.incidents instanceof Error) throw bodies.incidents;
        return Response.json(bodies.incidents);
      }
      return Response.json(bodies.summary);
    }) as typeof fetch;
    return { fetch: fn, paths };
  }

  /** The archive feed, which — unlike the summary — keeps resolved incidents. */
  const archive = {
    ...(incidentsFixture as Record<string, unknown>),
    incidents: [richIncidentFixture],
  };

  it("closes an issue whose incident vanished from the summary feed", async () => {
    // The regression: resolution is the one transition that *removes* an
    // incident from summary.json, so reconcile alone can never see it.
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });
    expect(store.issue(RICH_ID)!.state).toBe("open");

    const result = await poll(store, {
      fetch: routedFetch({ summary: summaryAt([], 2), incidents: archive }).fetch,
    });

    expect(result.closed).toBe(1);
    const issue = store.issue(RICH_ID)!;
    expect(issue.state).toBe("closed");
    expect(issue.status).toBe("resolved");
    expect(issue.resolvedAt).not.toBeNull();
    expect(store.kinds(RICH_ID).at(-1)).toBe("closed");
  });

  it("writes the resolving update as a comment, not just the close", async () => {
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });
    const before = store.kinds(RICH_ID).filter((kind) => kind === "status_update").length;

    await poll(store, {
      fetch: routedFetch({ summary: summaryAt([], 2), incidents: archive }).fetch,
    });

    const after = store.kinds(RICH_ID).filter((kind) => kind === "status_update").length;
    expect(after).toBe(before + 1);
  });

  it("does not fetch the archive when the summary explains every open issue", async () => {
    // The common case by far, and the expensive feed is ~55x the summary.
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });

    const routed = routedFetch({ summary: summaryAt([stillOpen()], 2) });
    await poll(store, { fetch: routed.fetch });

    expect(routed.paths).toEqual(["/api/v2/summary.json"]);
  });

  it("does not fetch the archive when nothing is open at all", async () => {
    const store = new MemoryIssueStore();
    const routed = routedFetch({ summary: summaryAt([], 1) });

    await poll(store, { fetch: routed.fetch });

    expect(routed.paths).toEqual(["/api/v2/summary.json"]);
  });

  it("retries the catch-up even though the page cursor already advanced", async () => {
    // The summary reconcile advances the cursor before catch-up runs. If the
    // catch-up were cursor-gated, one failed fetch would strand the issue open
    // permanently — which is the very bug this whole path exists to fix.
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });

    const failing = summaryAt([], 2);
    await expect(
      poll(store, { fetch: routedFetch({ summary: failing, incidents: new Error("down") }).fetch }),
    ).rejects.toThrow(/down/);
    expect(store.issue(RICH_ID)!.state).toBe("open");

    // Same summary as the failed run, so the cursor short-circuits reconcile.
    const routed = routedFetch({ summary: failing, incidents: archive });
    const result = await poll(store, { fetch: routed.fetch });

    expect(routed.paths).toContain("/api/v2/incidents.json");
    expect(result.closed).toBe(1);
    expect(store.issue(RICH_ID)!.state).toBe("closed");
  });

  it("leaves the issue open when the archive says it is still unresolved", async () => {
    // A transient absence from the summary is not a resolution.
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });

    const result = await poll(store, {
      fetch: routedFetch({
        summary: summaryAt([], 2),
        incidents: { ...(incidentsFixture as Record<string, unknown>), incidents: [stillOpen()] },
      }).fetch,
    });

    expect(result.closed).toBe(0);
    expect(store.issue(RICH_ID)!.state).toBe("open");
  });

  it("only reconciles the incidents that went missing", async () => {
    // The archive carries ~50 incidents spanning months; reconciling all of
    // them every time would cost a storage read apiece for no reason.
    const store = new MemoryIssueStore();

    await poll(store, { fetch: routedFetch({ summary: summaryAt([stillOpen()], 1) }).fetch });
    expect(store.issueCount).toBe(1);

    const result = await poll(store, {
      fetch: routedFetch({ summary: summaryAt([], 2), incidents: incidentsFixture }).fetch,
    });

    // Ours closed; every other incident in the archive stayed unknown.
    expect(result.closed).toBe(1);
    expect(store.issue(RICH_ID)!.state).toBe("closed");
    expect(store.issueCount).toBe(1);
  });
});
