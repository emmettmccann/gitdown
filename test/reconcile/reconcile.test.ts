import { describe, expect, it } from "vitest";
import { PAGE_CURSOR_KEY, reconcile } from "../../src/reconcile/reconcile.js";
import { diffIncident } from "../../src/reconcile/diff.js";
import { parseIncidentsResponse, type ParsedFeed } from "../../src/statuspage/parse.js";
import type { Incident } from "../../src/statuspage/schema.js";
import { MemoryIssueStore } from "../helpers/memory-store.js";
import { allSnapshots, snapshotAfter } from "../helpers/replay.js";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

const PAGE = (incidentsFixture as { page: { updated_at: string } }).page;

function feedOf(incidents: unknown[], pageUpdatedAt?: string): ParsedFeed {
  return parseIncidentsResponse({
    page: pageUpdatedAt ? { ...PAGE, updated_at: pageUpdatedAt } : PAGE,
    incidents,
  });
}

/** Wraps already-parsed incidents back into a feed, bumping the page cursor. */
function feedFrom(incidents: Incident[], tick: number): ParsedFeed {
  return {
    page: { ...feedOf([]).page, updated_at: 1_000_000 + tick },
    components: [],
    incidents,
    rejected: [],
  };
}

const RICH = parseIncidentsResponse({ page: PAGE, incidents: [richIncidentFixture] })
  .incidents[0]!;

describe("replaying a real incident poll by poll", () => {
  it("builds the full thread across 18 polls", async () => {
    const store = new MemoryIssueStore();

    for (const [index, snapshot] of allSnapshots(RICH).entries()) {
      await reconcile(feedFrom([snapshot], index), store);
    }

    const issue = store.issue(RICH.id)!;
    expect(issue.number).toBe(1);
    expect(issue.state).toBe("closed");
    expect(issue.title).toBe("Incident with GitHub Actions");
    expect(issue.impact).toBe("critical");

    const kinds = store.kinds(RICH.id);
    expect(kinds[0]).toBe("opened");
    expect(kinds.at(-1)).toBe("closed");
    expect(kinds.filter((k) => k === "status_update")).toHaveLength(18);
    expect(kinds.filter((k) => k === "closed")).toHaveLength(1);
    expect(kinds.filter((k) => k === "opened")).toHaveLength(1);
  });

  it("writes once per poll that actually changed something", async () => {
    const store = new MemoryIssueStore();
    const snapshots = allSnapshots(RICH);

    for (const [index, snapshot] of snapshots.entries()) {
      await reconcile(feedFrom([snapshot], index), store);
    }

    expect(store.applyCount).toBe(snapshots.length);
  });

  it("keeps the timeline in chronological order", async () => {
    const store = new MemoryIssueStore();
    for (const [index, snapshot] of allSnapshots(RICH).entries()) {
      await reconcile(feedFrom([snapshot], index), store);
    }

    const statusRows = store
      .timeline(RICH.id)
      .filter((row) => row.event.kind === "status_update");
    const times = statusRows.map((row) => row.event.createdAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("idempotency", () => {
  it("writes nothing when the same feed is reconciled again", async () => {
    const store = new MemoryIssueStore();
    const feed = feedOf([richIncidentFixture]);

    await reconcile(feed, store);
    const rowsAfterFirst = store.totalRows;
    const appliesAfterFirst = store.applyCount;

    await reconcile(feed, store);

    expect(store.totalRows).toBe(rowsAfterFirst);
    expect(store.applyCount).toBe(appliesAfterFirst);
    expect(store.issueCount).toBe(1);
  });

  it("still writes nothing with the fast path disabled", async () => {
    // Proves correctness comes from state comparison, not from the
    // src_updated_at shortcut, which is only a cost optimisation.
    const store = new MemoryIssueStore();
    const feed = feedOf([richIncidentFixture]);
    const options = { fastPath: false, usePageCursor: false };

    await reconcile(feed, store, options);
    const rows = store.totalRows;
    const applies = store.applyCount;

    await reconcile(feed, store, options);

    expect(store.totalRows).toBe(rows);
    expect(store.applyCount).toBe(applies);
  });

  it("collapses duplicate rows when the same change is applied twice", async () => {
    // The shape of a cron/webhook race: both compute the same change set from
    // the same upstream state and both write it.
    const store = new MemoryIssueStore();
    const change = diffIncident(RICH, null);

    await store.apply(change);
    const rows = store.totalRows;
    await store.apply(change);

    expect(store.totalRows).toBe(rows);
    expect(store.kinds(RICH.id).filter((k) => k === "opened")).toHaveLength(1);
  });

  it("does not re-amend an edit it has already applied", async () => {
    // Regression: the status_update event initially carried only createdAt, so
    // storage could not persist the upstream updated_at. Every poll then saw
    // every comment as freshly edited — unbounded write amplification, and an
    // "edited" marker on comments nobody had touched.
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([RICH], 0), store);

    // Statuspage bumps incident.updated_at whenever an update is edited — the
    // recorded fixture's updated_at postdates its resolved_at for exactly that
    // reason. An edit that did not bump it would be invisible to the fast path.
    const edited: Incident = {
      ...RICH,
      updated_at: RICH.updated_at + 60_000,
      incident_updates: RICH.incident_updates.map((u, i) =>
        i === 0 ? { ...u, body: "Corrected wording.", updated_at: u.updated_at + 60_000 } : u,
      ),
    };

    await reconcile(feedFrom([edited], 1), store);
    const appliesAfterEdit = store.applyCount;

    await reconcile(feedFrom([edited], 2), store);
    expect(store.applyCount).toBe(appliesAfterEdit);

    const first = store.timeline(RICH.id).find((row) => row.event.kind === "status_update")!;
    expect(first.body).toBe("Corrected wording.");
    expect(first.editedAt).toBeDefined();
  });

  it("does not treat an unedited update as edited", async () => {
    // Statuspage sets updated_at ahead of created_at on plenty of updates that
    // were never touched, so equality with created_at is not the test.
    const store = new MemoryIssueStore();
    const untouched = RICH.incident_updates.filter((u) => u.updated_at !== u.created_at);
    expect(untouched.length).toBeGreaterThan(0);

    await reconcile(feedFrom([RICH], 0), store);
    await reconcile(feedFrom([RICH], 1), store);

    const edits = store.timeline(RICH.id).filter((row) => row.editedAt !== undefined);
    expect(edits).toEqual([]);
  });

  it("does not reopen and reclose an already-closed incident", async () => {
    const store = new MemoryIssueStore();

    for (let i = 0; i < 3; i++) {
      await reconcile(feedFrom([RICH], i), store);
    }

    expect(store.kinds(RICH.id).filter((k) => k === "closed")).toHaveLength(1);
    expect(store.kinds(RICH.id).filter((k) => k === "reopened")).toHaveLength(0);
  });
});

describe("the page cursor", () => {
  it("short-circuits when nothing on the status page has moved", async () => {
    const store = new MemoryIssueStore();
    const feed = feedOf([richIncidentFixture]);

    await reconcile(feed, store);
    const result = await reconcile(feed, store);

    expect(result.skipped).toBe(true);
    expect(result.opened).toBe(0);
  });

  it("processes again once the page timestamp moves", async () => {
    const store = new MemoryIssueStore();

    await reconcile(feedOf([snapshotAfter(RICH, 1)], "2026-07-19T23:34:03.512Z"), store);
    const result = await reconcile(feedOf([richIncidentFixture], "2026-07-20T04:44:03.085Z"), store);

    expect(result.skipped).toBe(false);
    expect(store.kinds(RICH.id).filter((k) => k === "status_update")).toHaveLength(18);
  });

  it("advances the cursor only after every incident is applied", async () => {
    const store = new MemoryIssueStore();
    const feed = feedOf([richIncidentFixture]);

    // A store that fails mid-run must not leave the cursor advanced, or the
    // next poll would skip the incidents it never processed.
    const failing = Object.create(store) as MemoryIssueStore;
    failing.apply = async () => {
      throw new Error("d1 unavailable");
    };

    await expect(reconcile(feed, failing)).rejects.toThrow("d1 unavailable");
    expect(await store.getSyncState(PAGE_CURSOR_KEY)).toBeNull();
  });
});

describe("backfill", () => {
  it("ingests the recorded 50-incident history", async () => {
    const store = new MemoryIssueStore();
    const result = await reconcile(feedOf((incidentsFixture as { incidents: unknown[] }).incidents), store);

    expect(result.opened).toBe(50);
    expect(result.closed).toBe(50);
    expect(store.issueCount).toBe(50);
  });

  it("numbers issues so they ascend with time, like a real repo", async () => {
    const store = new MemoryIssueStore();
    const raw = (incidentsFixture as { incidents: unknown[] }).incidents;
    await reconcile(feedOf(raw), store);

    const parsed = parseIncidentsResponse(incidentsFixture as unknown).incidents;
    const byNumber = [...parsed].sort(
      (a, b) => store.issue(a.id)!.number - store.issue(b.id)!.number,
    );
    const times = byNumber.map((incident) => incident.created_at);

    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("is safe to run over the same history twice", async () => {
    const store = new MemoryIssueStore();
    const raw = (incidentsFixture as { incidents: unknown[] }).incidents;

    await reconcile(feedOf(raw), store, { usePageCursor: false });
    const rows = store.totalRows;
    await reconcile(feedOf(raw), store, { usePageCursor: false });

    expect(store.issueCount).toBe(50);
    expect(store.totalRows).toBe(rows);
  });
});

describe("reporting", () => {
  it("carries validation rejections through to the caller", async () => {
    const store = new MemoryIssueStore();
    const feed = feedOf([{ id: "broken", status: "vibing" }, richIncidentFixture]);

    const result = await reconcile(feed, store);

    expect(result.opened).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.id).toBe("broken");
  });

  it("counts unchanged incidents separately from changed ones", async () => {
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([snapshotAfter(RICH, 1)], 0), store);

    const result = await reconcile(feedFrom([snapshotAfter(RICH, 2)], 1), store);
    expect(result.changed).toBe(1);
    expect(result.unchanged).toBe(0);

    const noop = await reconcile(feedFrom([snapshotAfter(RICH, 2)], 2), store);
    expect(noop.changed).toBe(0);
    expect(noop.unchanged).toBe(1);
  });
});

describe("a poll served a stale copy", () => {
  // Statuspage sits behind a CDN, so a poll can be handed a copy of an incident
  // from before an update we have already stored — the newest one, most often,
  // since that is the only one a slightly stale copy can be missing.
  //
  // Left alone this put "This comment was removed upstream." on live threads:
  // the absent update read as an operator deletion, the row was struck through,
  // and nothing ever put it back. Both halves are covered here — not taking the
  // stale copy's word for it, and recovering if something already has.
  const stale = snapshotAfter(RICH, 5);
  const fresh = snapshotAfter(RICH, 6);
  const newestId = fresh.incident_updates.at(-1)!.id;

  const deletedAtOf = (store: MemoryIssueStore, id: string) =>
    store.timeline(RICH.id).find((row) => row.event.id === id)?.deletedAt;

  it("does not read the missing newest update as a deletion", async () => {
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([fresh], 1), store);

    const result = await reconcile(feedFrom([stale], 2), store);

    expect(result.stale).toBe(1);
    expect(deletedAtOf(store, newestId)).toBeUndefined();
  });

  it("drops the stale copy whole rather than half-applying it", async () => {
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([fresh], 1), store);
    const before = { ...store.issue(RICH.id)! };
    const kindsBefore = store.kinds(RICH.id);
    const writesBefore = store.applyCount;

    await reconcile(feedFrom([stale], 2), store);

    // Notably `srcUpdatedAt`: rolling it backwards would make the next fresh
    // poll re-diff an incident it has already applied. The label diff is the
    // other half — a stale impact would flap the labels off and back on.
    expect(store.issue(RICH.id)).toEqual(before);
    expect(store.kinds(RICH.id)).toEqual(kindsBefore);
    expect(store.applyCount).toBe(writesBefore);
  });

  it("is not the fast path in disguise", async () => {
    // `fastPath` is a cost optimisation the other tests switch off to prove
    // correctness does not rest on it. Refusing a stale payload is not one, so
    // it has to hold with the flag off too.
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([fresh], 1), store, { fastPath: false });

    await reconcile(feedFrom([stale], 2), store, { fastPath: false });

    expect(deletedAtOf(store, newestId)).toBeUndefined();
  });

  it("puts back a row an earlier poll had already struck through", async () => {
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([fresh], 1), store);

    // The damage as it exists in production, applied directly: the guard above
    // is what stops it happening now, so it cannot be reproduced through it.
    await store.apply({
      incidentId: RICH.id,
      isNew: false,
      patch: diffIncident(fresh, null).patch,
      append: [],
      amend: [],
      remove: [newestId],
      restore: [],
    });
    expect(deletedAtOf(store, newestId)).toBeDefined();

    await reconcile(feedFrom([snapshotAfter(RICH, 7)], 2), store);

    expect(deletedAtOf(store, newestId)).toBeUndefined();
  });

  it("still soft-deletes an update the operator really did remove", async () => {
    const store = new MemoryIssueStore();
    await reconcile(feedFrom([fresh], 1), store);

    // Same payload minus one update, with the bumped `updated_at` a real
    // deletion carries — so it is current, not stale.
    const dropped = fresh.incident_updates[2]!.id;
    const edited: Incident = {
      ...fresh,
      updated_at: fresh.updated_at + 1_000,
      incident_updates: fresh.incident_updates.filter((u) => u.id !== dropped),
    };

    const result = await reconcile(feedFrom([edited], 2), store);

    expect(result.stale).toBe(0);
    expect(deletedAtOf(store, dropped)).toBeDefined();
  });
});
