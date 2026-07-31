import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { D1IssueStore } from "../../src/store/d1.js";
import { diffIncident } from "../../src/reconcile/diff.js";
import { PAGE_CURSOR_KEY, reconcile } from "../../src/reconcile/reconcile.js";
import { BOT_ACTOR, type IssueChange } from "../../src/reconcile/types.js";
import { parseIncidentsResponse, type ParsedFeed } from "../../src/statuspage/parse.js";
import type { Incident } from "../../src/statuspage/schema.js";
import { allSnapshots, snapshotAfter } from "../helpers/replay.js";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

const PAGE = (incidentsFixture as { page: unknown }).page;
const RICH = parseIncidentsResponse({ page: PAGE, incidents: [richIncidentFixture] })
  .incidents[0]!;

/** Feed wrapper that advances the page cursor, so successive polls are not skipped. */
function feedAt(incidents: Incident[], tick: number): ParsedFeed {
  const base = parseIncidentsResponse({ page: PAGE, incidents: [] });
  return {
    page: { ...base.page, updated_at: 1_000_000 + tick },
    components: [],
    incidents,
    rejected: [],
  };
}

async function rows<T>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all<T>();
  return result.results;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM timeline"),
    env.DB.prepare("DELETE FROM issues"),
    env.DB.prepare("DELETE FROM sync_state"),
    env.DB.prepare("DELETE FROM sqlite_sequence"),
  ]);
});

describe("loading", () => {
  it("returns null for an incident it has never seen", async () => {
    const store = new D1IssueStore(env.DB);
    expect(await store.loadByIncidentId("nope")).toBeNull();
  });

  it("round-trips issue state and known updates", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const stored = (await store.loadByIncidentId(RICH.id))!;
    expect(stored.title).toBe("Incident with GitHub Actions");
    expect(stored.state).toBe("closed");
    expect(stored.impact).toBe("critical");
    expect(stored.components).toContain("Actions");
    expect(stored.srcUpdatedAt).toBe(RICH.updated_at);
    expect(stored.knownUpdates).toHaveLength(18);
    expect(stored.knownUpdates.every((u) => u.updatedAt > 0)).toBe(true);
  });
});

describe("applying a change set", () => {
  it("writes the issue and its timeline in one go", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const [issue] = await rows<{ number: number; state: string; components: string }>(
      "SELECT number, state, components FROM issues",
    );
    expect(issue!.number).toBe(1);
    expect(issue!.state).toBe("closed");
    expect(JSON.parse(issue!.components)).toContain("Actions");

    const timeline = await rows<{ kind: string }>(
      "SELECT kind FROM timeline ORDER BY seq",
    );
    expect(timeline[0]!.kind).toBe("opened");
    expect(timeline.at(-1)!.kind).toBe("closed");
  });

  it("stores structured meta per event kind", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const [component] = await rows<{ meta: string; body: string | null }>(
      "SELECT meta, body FROM timeline WHERE kind = 'component_changed' ORDER BY seq LIMIT 1",
    );
    expect(JSON.parse(component!.meta)).toEqual({
      component: "Actions",
      from: "operational",
      to: "degraded_performance",
    });
    expect(component!.body).toBeNull();

    const [update] = await rows<{ meta: string; body: string }>(
      "SELECT meta, body FROM timeline WHERE kind = 'status_update' ORDER BY seq LIMIT 1",
    );
    expect(JSON.parse(update!.meta)).toEqual({ status: "investigating" });
    expect(update!.body).toContain("investigating");
  });

  it("attributes every bot row to the bot actor", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const actors = await rows<{ actor: string }>("SELECT DISTINCT actor FROM timeline");
    expect(actors).toEqual([{ actor: BOT_ACTOR }]);
  });

  it("rolls the whole change set back if any statement fails", async () => {
    // The fast path keys off src_updated_at, so an issue row written without
    // its timeline rows would look up-to-date forever and never self-heal.
    const store = new D1IssueStore(env.DB);
    const change = diffIncident(RICH, null);
    const broken: IssueChange = {
      ...change,
      append: change.append.map((event, i) =>
        i === 2 ? { ...event, createdAt: "not-a-number" as unknown as number } : event,
      ),
    };

    await expect(store.apply(broken)).rejects.toThrow();

    expect(await rows("SELECT number FROM issues")).toEqual([]);
    expect(await rows("SELECT seq FROM timeline")).toEqual([]);
  });
});

describe("the unique constraint on timeline ids", () => {
  it("collapses a duplicate apply instead of double-writing", async () => {
    // The shape of a cron/webhook race (SPEC 4.3).
    const store = new D1IssueStore(env.DB);
    const change = diffIncident(RICH, null);

    await store.apply(change);
    const before = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM timeline");
    await store.apply(change);
    const after = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM timeline");

    expect(after[0]!.n).toBe(before[0]!.n);
    expect(await rows("SELECT number FROM issues")).toHaveLength(1);
  });
});

describe("amendments and deletions", () => {
  it("rewrites the body and advances source_updated_at", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const target = RICH.incident_updates[0]!;
    const edited: Incident = {
      ...RICH,
      updated_at: RICH.updated_at + 60_000,
      incident_updates: RICH.incident_updates.map((u, i) =>
        i === 0 ? { ...u, body: "Corrected wording.", updated_at: u.updated_at + 60_000 } : u,
      ),
    };

    await store.apply(diffIncident(edited, (await store.loadByIncidentId(RICH.id))!));

    const [row] = await rows<{ body: string; edited_at: number; source_updated_at: number }>(
      "SELECT body, edited_at, source_updated_at FROM timeline WHERE id = ?1",
      target.id,
    );
    expect(row!.body).toBe("Corrected wording.");
    expect(row!.edited_at).toBe(target.updated_at + 60_000);
    expect(row!.source_updated_at).toBe(target.updated_at + 60_000);

    // The mirrored source_updated_at is what stops the next poll re-amending.
    const stored = (await store.loadByIncidentId(RICH.id))!;
    expect(diffIncident(edited, stored).amend).toEqual([]);
  });

  it("soft-deletes an update that vanished upstream", async () => {
    const store = new D1IssueStore(env.DB);
    await store.apply(diffIncident(RICH, null));

    const removed = RICH.incident_updates[2]!;
    const trimmed: Incident = {
      ...RICH,
      updated_at: RICH.updated_at + 1000,
      incident_updates: RICH.incident_updates.filter((u) => u.id !== removed.id),
    };

    await store.apply(diffIncident(trimmed, (await store.loadByIncidentId(RICH.id))!));

    const [row] = await rows<{ deleted_at: number | null }>(
      "SELECT deleted_at FROM timeline WHERE id = ?1",
      removed.id,
    );
    expect(row!.deleted_at).not.toBeNull();

    // Row kept, not dropped: the timeline keeps its shape.
    expect(await rows("SELECT seq FROM timeline WHERE id = ?1", removed.id)).toHaveLength(1);
  });
});

describe("replaying a real incident against D1", () => {
  it("builds the full thread across 18 polls", async () => {
    const store = new D1IssueStore(env.DB);

    for (const [index, snapshot] of allSnapshots(RICH).entries()) {
      await reconcile(feedAt([snapshot], index), store);
    }

    const kinds = (await rows<{ kind: string }>("SELECT kind FROM timeline ORDER BY seq")).map(
      (r) => r.kind,
    );
    expect(kinds[0]).toBe("opened");
    expect(kinds.at(-1)).toBe("closed");
    expect(kinds.filter((k) => k === "status_update")).toHaveLength(18);
    expect(kinds.filter((k) => k === "closed")).toHaveLength(1);

    const [issue] = await rows<{ state: string; resolved_at: number }>(
      "SELECT state, resolved_at FROM issues",
    );
    expect(issue!.state).toBe("closed");
    expect(issue!.resolved_at).toBe(RICH.resolved_at);
  });

  it("assigns seq in insertion order so the cursor is monotonic", async () => {
    const store = new D1IssueStore(env.DB);
    for (const [index, snapshot] of allSnapshots(RICH).entries()) {
      await reconcile(feedAt([snapshot], index), store);
    }

    const seqs = (await rows<{ seq: number }>("SELECT seq FROM timeline ORDER BY seq")).map(
      (r) => r.seq,
    );
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("writes nothing on a poll that changed nothing", async () => {
    const store = new D1IssueStore(env.DB);
    const feed = feedAt([RICH], 0);

    await reconcile(feed, store);
    const before = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM timeline");

    await reconcile(feedAt([RICH], 1), store);
    const after = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM timeline");

    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe("backfill ordering", () => {
  it("numbers issues so they ascend with time", async () => {
    const store = new D1IssueStore(env.DB);
    const feed = parseIncidentsResponse(incidentsFixture as unknown);
    await reconcile(feed, store, { usePageCursor: false });

    const ordered = await rows<{ number: number; created_at: number }>(
      "SELECT number, created_at FROM issues ORDER BY number",
    );
    expect(ordered).toHaveLength(50);
    const times = ordered.map((r) => r.created_at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("sync state", () => {
  it("round-trips and overwrites", async () => {
    const store = new D1IssueStore(env.DB);
    expect(await store.getSyncState("k")).toBeNull();

    await store.setSyncState("k", "one");
    expect(await store.getSyncState("k")).toBe("one");

    await store.setSyncState("k", "two");
    expect(await store.getSyncState("k")).toBe("two");
  });

  it("is what makes the page cursor short-circuit work end to end", async () => {
    const store = new D1IssueStore(env.DB);
    const feed = feedAt([snapshotAfter(RICH, 1)], 0);

    await reconcile(feed, store);
    expect(await store.getSyncState(PAGE_CURSOR_KEY)).toBe(String(feed.page.updated_at));

    const second = await reconcile(feed, store);
    expect(second.skipped).toBe(true);
  });
});
