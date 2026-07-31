/**
 * Reconstructs how an incident looked to a poller partway through, so a
 * recorded outage can be replayed one poll at a time.
 *
 * The interesting reconcile bugs only occur across successive polls — a missed
 * update, a duplicated comment, a close that fires twice — and none of them are
 * reachable by feeding the final payload in once.
 */
import type { Incident } from "../../src/statuspage/schema.js";

/**
 * The incident as it stood immediately after its `n`th update was posted.
 *
 * `incident_updates` is already oldest-first (normalised at the parse
 * boundary), so truncation is enough; the derived fields are then recomputed
 * the way Statuspage would have had them at that moment.
 */
export function snapshotAfter(incident: Incident, n: number): Incident {
  const updates = incident.incident_updates.slice(0, n);
  const last = updates.at(-1);
  if (!last) throw new Error("snapshotAfter needs at least one update");

  const monitoring = updates.find((u) => u.status === "monitoring");
  const resolved = updates.find((u) => u.status === "resolved");

  return {
    ...incident,
    status: last.status,
    // Statuspage bumps this on any change; the latest touched update is the
    // closest honest approximation available from a recorded payload.
    updated_at: Math.max(...updates.map((u) => u.updated_at)),
    monitoring_at: monitoring?.created_at ?? null,
    resolved_at: resolved?.created_at ?? null,
    incident_updates: updates,
  };
}

/** Every intermediate state of an incident, from first update to last. */
export function allSnapshots(incident: Incident): Incident[] {
  return incident.incident_updates.map((_, index) => snapshotAfter(incident, index + 1));
}
