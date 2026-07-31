import { describe, expect, it } from "vitest";
import { diffIncident, issueStateFor, labelsFor } from "../../src/reconcile/diff.js";
import { isEmptyChange, type StoredIssue } from "../../src/reconcile/types.js";
import { parseIncidentsResponse } from "../../src/statuspage/parse.js";
import type { Incident } from "../../src/statuspage/schema.js";
import { snapshotAfter } from "../helpers/replay.js";
import incidentsFixture from "../fixtures/incidents.json";
import richIncidentFixture from "../fixtures/incident-actions-critical.json";

function parseOne(raw: unknown): Incident {
  const feed = parseIncidentsResponse({
    page: (incidentsFixture as { page: unknown }).page,
    incidents: [raw],
  });
  expect(feed.rejected).toEqual([]);
  return feed.incidents[0]!;
}

const RICH = parseOne(richIncidentFixture);

/** The stored state that would result from having reconciled `incident`. */
function storedFrom(incident: Incident, overrides: Partial<StoredIssue> = {}): StoredIssue {
  return {
    incidentId: incident.id,
    number: 1,
    title: incident.name,
    state: issueStateFor(incident.status),
    impact: incident.impact,
    status: incident.status,
    components: incident.components.map((c) => c.name).sort(),
    srcUpdatedAt: incident.updated_at,
    knownUpdates: incident.incident_updates.map((u) => ({
      id: u.id,
      updatedAt: u.updated_at,
      deleted: false,
    })),
    ...overrides,
  };
}

describe("first sighting", () => {
  it("opens the issue and replays every update in order", () => {
    const change = diffIncident(RICH, null);

    expect(change.isNew).toBe(true);
    expect(change.append[0]).toMatchObject({ kind: "opened", title: RICH.name });

    const statusUpdates = change.append.filter((e) => e.kind === "status_update");
    expect(statusUpdates).toHaveLength(18);
    expect(statusUpdates[0]).toMatchObject({ status: "investigating" });
    expect(statusUpdates.at(-1)).toMatchObject({ status: "resolved" });
  });

  it("emits a component_changed row per transition, beside its update", () => {
    const change = diffIncident(RICH, null);
    const kinds = change.append.map((e) => e.kind);

    // The first update carries an Actions transition, so the component row must
    // follow immediately rather than being batched to the end.
    expect(kinds.slice(0, 3)).toEqual(["opened", "status_update", "component_changed"]);
    expect(change.append[2]).toMatchObject({
      kind: "component_changed",
      component: "Actions",
      from: "operational",
      to: "degraded_performance",
    });
  });

  it("ignores component entries whose status did not move", () => {
    // Real incidents carry several of these: Statuspage lists every component an
    // update touches, changed or not. "Actions went from major_outage to
    // major_outage" is noise — it is a transition event or it is nothing.
    const noop = RICH.incident_updates
      .flatMap((u) => u.affected_components ?? [])
      .filter((c) => c.old_status === c.new_status);
    expect(noop.length).toBeGreaterThan(0);

    const rendered = diffIncident(RICH, null).append.filter(
      (e) => e.kind === "component_changed",
    );

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((e) => e.from !== e.to)).toBe(true);
  });

  it("closes immediately when the incident is already resolved", () => {
    // Backfill, or ingestion having been down through the whole incident.
    const change = diffIncident(RICH, null);
    expect(change.patch.state).toBe("closed");
    expect(change.append.at(-1)).toMatchObject({ kind: "closed" });
  });

  it("stays open when the incident is still live", () => {
    const live = snapshotAfter(RICH, 1);
    const change = diffIncident(live, null);

    expect(change.patch.state).toBe("open");
    expect(change.append.some((e) => e.kind === "closed")).toBe(false);
  });

  it("does not narrate labels the issue was born with", () => {
    // "githubstatus added the impact:critical label" on an issue that never had
    // anything else is noise, not history.
    const change = diffIncident(RICH, null);
    expect(change.append.some((e) => e.kind === "label_added")).toBe(false);
    expect(change.patch.impact).toBe("critical");
  });
});

describe("no-op diffing", () => {
  it("produces nothing when the incident is unchanged", () => {
    const change = diffIncident(RICH, storedFrom(RICH));
    expect(isEmptyChange(change)).toBe(true);
  });

  it("produces nothing at every stage of a replayed incident", () => {
    // Idempotency must hold at each poll, not just at the end state.
    for (let n = 1; n <= RICH.incident_updates.length; n++) {
      const snapshot = snapshotAfter(RICH, n);
      expect(isEmptyChange(diffIncident(snapshot, storedFrom(snapshot)))).toBe(true);
    }
  });
});

describe("incremental updates", () => {
  it("appends only updates it has not already seen", () => {
    const before = snapshotAfter(RICH, 3);
    const after = snapshotAfter(RICH, 5);

    const change = diffIncident(after, storedFrom(before));
    const appended = change.append.filter((e) => e.kind === "status_update");

    expect(appended).toHaveLength(2);
    expect(appended.map((e) => e.id)).toEqual(
      RICH.incident_updates.slice(3, 5).map((u) => u.id),
    );
  });

  it("treats an edited body as an amendment, not a new comment", () => {
    const stored = storedFrom(RICH);
    const edited: Incident = {
      ...RICH,
      incident_updates: RICH.incident_updates.map((u, i) =>
        i === 0 ? { ...u, body: "Corrected wording.", updated_at: u.updated_at + 60_000 } : u,
      ),
    };

    const change = diffIncident(edited, stored);

    expect(change.append).toHaveLength(0);
    expect(change.amend).toEqual([
      {
        id: RICH.incident_updates[0]!.id,
        body: "Corrected wording.",
        editedAt: RICH.incident_updates[0]!.updated_at + 60_000,
      },
    ]);
  });

  it("soft-deletes updates that disappeared upstream", () => {
    const stored = storedFrom(RICH);
    const removedId = RICH.incident_updates[2]!.id;
    const trimmed: Incident = {
      ...RICH,
      incident_updates: RICH.incident_updates.filter((u) => u.id !== removedId),
    };

    const change = diffIncident(trimmed, stored);
    expect(change.remove).toEqual([removedId]);
  });

  it("does not re-delete an update already soft-deleted", () => {
    const removedId = RICH.incident_updates[2]!.id;
    const stored = storedFrom(RICH, {
      knownUpdates: RICH.incident_updates.map((u) => ({
        id: u.id,
        updatedAt: u.updated_at,
        deleted: u.id === removedId,
      })),
    });
    const trimmed: Incident = {
      ...RICH,
      incident_updates: RICH.incident_updates.filter((u) => u.id !== removedId),
    };

    expect(diffIncident(trimmed, stored).remove).toEqual([]);
  });
});

describe("metadata changes", () => {
  it("records a rename", () => {
    const stored = storedFrom(RICH, { title: "Incident with Actions" });
    const change = diffIncident(RICH, stored);

    expect(change.append).toContainEqual(
      expect.objectContaining({
        kind: "renamed",
        from: "Incident with Actions",
        to: "Incident with GitHub Actions",
      }),
    );
  });

  it("records impact escalation as a label swap", () => {
    const stored = storedFrom(RICH, { impact: "minor" });
    const change = diffIncident(RICH, stored);

    expect(change.append).toContainEqual(
      expect.objectContaining({ kind: "label_removed", label: "impact:minor" }),
    );
    expect(change.append).toContainEqual(
      expect.objectContaining({ kind: "label_added", label: "impact:critical" }),
    );
  });

  it("records a component being drawn into the incident", () => {
    const stored = storedFrom(RICH, { components: ["Actions"] });
    const change = diffIncident(RICH, stored);
    const added = change.append.filter((e) => e.kind === "label_added").map((e) => e.label);

    expect(added).toContain("API Requests");
    expect(added).not.toContain("Actions");
  });

  it("closes when the incident resolves", () => {
    const before = snapshotAfter(RICH, 17);
    const after = snapshotAfter(RICH, 18);
    expect(before.status).not.toBe("resolved");

    const change = diffIncident(after, storedFrom(before));
    expect(change.append.at(-1)).toMatchObject({ kind: "closed" });
    expect(change.patch.state).toBe("closed");
  });

  it("reopens when a resolved incident goes back to investigating", () => {
    const stored = storedFrom(RICH);
    const reopened: Incident = { ...RICH, status: "investigating", resolved_at: null };

    const change = diffIncident(reopened, stored);
    expect(change.append).toContainEqual(expect.objectContaining({ kind: "reopened" }));
    expect(change.patch.state).toBe("open");
  });

  it("treats postmortem as closed", () => {
    expect(issueStateFor("postmortem")).toBe("closed");
    expect(issueStateFor("monitoring")).toBe("open");
  });
});

describe("event id stability", () => {
  it("computes identical ids for identical input", () => {
    // Two concurrent reconciles of the same upstream state must collide on the
    // unique constraint rather than write the thread twice (SPEC 4.3).
    const stored = storedFrom(snapshotAfter(RICH, 3));
    const a = diffIncident(RICH, stored).append.map((e) => e.id);
    const b = diffIncident(RICH, stored).append.map((e) => e.id);

    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("uses the Statuspage update id verbatim for status updates", () => {
    const change = diffIncident(RICH, null);
    const ids = change.append.filter((e) => e.kind === "status_update").map((e) => e.id);
    expect(ids).toEqual(RICH.incident_updates.map((u) => u.id));
  });

  it("distinguishes a label re-added after being removed", () => {
    // minor -> major -> minor: without the timestamp in the derived id, the
    // second `impact:minor` would be swallowed as a duplicate of the first.
    const escalated: Incident = { ...RICH, impact: "major", updated_at: RICH.updated_at + 1000 };
    const relapsed: Incident = { ...RICH, impact: "minor", updated_at: RICH.updated_at + 2000 };

    const first = diffIncident(escalated, storedFrom(RICH, { impact: "minor" }));
    const second = diffIncident(relapsed, storedFrom(escalated, { impact: "major" }));

    const removedMinor = first.append.find((e) => e.kind === "label_removed")!;
    const addedMinor = second.append.find((e) => e.kind === "label_added")!;
    expect(addedMinor.id).not.toBe(removedMinor.id);
  });
});

describe("labels", () => {
  it("combines impact with component names, deterministically ordered", () => {
    const labels = labelsFor(RICH);
    expect(labels[0]).toBe("impact:critical");
    expect(labels.slice(1)).toEqual([...labels.slice(1)].sort());
    expect(labels).toContain("Actions");
  });
});
