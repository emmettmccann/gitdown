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
