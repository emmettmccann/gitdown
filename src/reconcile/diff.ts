/**
 * Pure diffing of a Statuspage incident against what we already stored.
 *
 * Idempotency is load-bearing (SPEC 4.3) and is achieved twice over, on purpose:
 *
 *  1. **By state comparison.** Every event is emitted only when stored state and
 *     incoming state actually differ, so re-diffing an unchanged incident
 *     produces nothing. This is the real guarantee, and it does not depend on
 *     the `src_updated_at` fast path in `reconcile` being correct.
 *  2. **By stable event ids.** Every emitted id is a deterministic function of
 *     the upstream payload, so if cron and the webhook reconcile the same state
 *     concurrently, both compute identical ids and the unique constraint on
 *     `timeline.id` collapses the duplicate.
 *
 * (1) makes the common case cheap; (2) makes the race safe. Neither alone is
 * sufficient.
 */
import type { Incident, IncidentStatus } from "../statuspage/schema.js";
import type {
  AmendedUpdate,
  IssueChange,
  IssuePatch,
  IssueState,
  StoredIssue,
  StoredUpdate,
  TimelineEvent,
} from "./types.js";

/** Statuspage statuses that mean the incident is over. */
const CLOSED_STATUSES: ReadonlySet<IncidentStatus> = new Set([
  "resolved",
  "postmortem",
]);

export function issueStateFor(status: IncidentStatus): IssueState {
  return CLOSED_STATUSES.has(status) ? "closed" : "open";
}

export function impactLabel(impact: string): string {
  return `impact:${impact}`;
}

/**
 * The label set for an incident: its impact plus every component it touched.
 *
 * Component *membership* comes from `incident.components[]`, whose `status`
 * field is deliberately ignored — it reports live component state rather than
 * state during the incident (see the note in statuspage/schema.ts).
 */
export function labelsFor(incident: Incident): string[] {
  const components = incident.components.map((c) => c.name).sort();
  return [impactLabel(incident.impact), ...components];
}

function componentNames(incident: Incident): string[] {
  return incident.components.map((c) => c.name).sort();
}

/**
 * Ids for events that are not backed by a Statuspage object of their own.
 *
 * `incident.updated_at` is included because these events can legitimately recur:
 * an incident escalated minor -> major -> minor adds the same label twice, and
 * without the timestamp the second addition would be silently swallowed as a
 * duplicate of the first.
 */
function derivedId(incident: Incident, suffix: string): string {
  return `${incident.id}:${incident.updated_at}:${suffix}`;
}

function patchFor(incident: Incident): IssuePatch {
  return {
    title: incident.name,
    state: issueStateFor(incident.status),
    impact: incident.impact,
    status: incident.status,
    components: componentNames(incident),
    shortlink: incident.shortlink,
    startedAt: incident.started_at,
    resolvedAt: incident.resolved_at,
    createdAt: incident.created_at,
    updatedAt: incident.updated_at,
    srcUpdatedAt: incident.updated_at,
  };
}

/**
 * Timeline rows for one incident update: the bot comment, followed by a row per
 * component transition it carried.
 */
function eventsForUpdate(
  update: Incident["incident_updates"][number],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      kind: "status_update",
      id: update.id,
      createdAt: update.created_at,
      sourceUpdatedAt: update.updated_at,
      status: update.status,
      body: update.body,
    },
  ];

  for (const change of update.affected_components ?? []) {
    events.push({
      kind: "component_changed",
      // Deterministic and unique: one transition per component per update.
      id: `${update.id}:component:${change.code}`,
      createdAt: update.created_at,
      component: change.name,
      from: change.old_status,
      to: change.new_status,
    });
  }

  return events;
}

function diffLabels(
  incident: Incident,
  stored: StoredIssue,
): TimelineEvent[] {
  const before = new Set([impactLabel(stored.impact), ...stored.components]);
  const after = new Set(labelsFor(incident));

  const events: TimelineEvent[] = [];
  for (const label of [...before].filter((l) => !after.has(l)).sort()) {
    events.push({
      kind: "label_removed",
      id: derivedId(incident, `label-removed:${label}`),
      createdAt: incident.updated_at,
      label,
    });
  }
  for (const label of [...after].filter((l) => !before.has(l)).sort()) {
    events.push({
      kind: "label_added",
      id: derivedId(incident, `label-added:${label}`),
      createdAt: incident.updated_at,
      label,
    });
  }
  return events;
}

/** First sighting: the issue is born with its labels, so emit no label events. */
function diffNewIncident(incident: Incident): IssueChange {
  const append: TimelineEvent[] = [
    {
      kind: "opened",
      id: `${incident.id}:opened`,
      createdAt: incident.created_at,
      title: incident.name,
    },
  ];

  for (const update of incident.incident_updates) {
    append.push(...eventsForUpdate(update));
  }

  // An incident can be resolved before we ever see it — backfill, or ingestion
  // having been down. The issue is then opened and closed in one change set.
  if (issueStateFor(incident.status) === "closed") {
    append.push({
      kind: "closed",
      id: derivedId(incident, "closed"),
      createdAt: incident.resolved_at ?? incident.updated_at,
    });
  }

  return {
    incidentId: incident.id,
    isNew: true,
    patch: patchFor(incident),
    append,
    amend: [],
    remove: [],
  };
}

function diffKnownIncident(incident: Incident, stored: StoredIssue): IssueChange {
  const known = new Map<string, StoredUpdate>(
    stored.knownUpdates.map((u) => [u.id, u]),
  );

  const append: TimelineEvent[] = [];
  const amend: AmendedUpdate[] = [];

  // incident_updates is normalised oldest-first at the parse boundary, so
  // appending in array order yields a timeline that reads forwards.
  for (const update of incident.incident_updates) {
    const seen = known.get(update.id);
    if (!seen) {
      append.push(...eventsForUpdate(update));
    } else if (update.updated_at !== seen.updatedAt) {
      // Same id, newer updated_at: an operator edited the body after posting.
      // This mutates the existing row rather than adding a new one, so the
      // thread does not grow a duplicate comment (SPEC 4.6).
      amend.push({ id: update.id, body: update.body, editedAt: update.updated_at });
    }
  }

  // Present last sync, absent now: the operator deleted the update. Soft-delete
  // rather than dropping the row, so the timeline keeps its shape.
  const incoming = new Set(incident.incident_updates.map((u) => u.id));
  const remove = stored.knownUpdates
    .filter((u) => !u.deleted && !incoming.has(u.id))
    .map((u) => u.id)
    .sort();

  if (incident.name !== stored.title) {
    append.push({
      kind: "renamed",
      id: derivedId(incident, "renamed"),
      createdAt: incident.updated_at,
      from: stored.title,
      to: incident.name,
    });
  }

  append.push(...diffLabels(incident, stored));

  const state = issueStateFor(incident.status);
  if (state !== stored.state) {
    append.push(
      state === "closed"
        ? {
            kind: "closed",
            id: derivedId(incident, "closed"),
            createdAt: incident.resolved_at ?? incident.updated_at,
          }
        : {
            kind: "reopened",
            id: derivedId(incident, "reopened"),
            createdAt: incident.updated_at,
          },
    );
  }

  return {
    incidentId: incident.id,
    isNew: false,
    patch: patchFor(incident),
    append,
    amend,
    remove,
  };
}

/**
 * Compute everything that should change for one incident.
 *
 * Emission order is the display order, since the timeline is ordered by
 * insertion sequence (SPEC 6): the story first, then the metadata changes we
 * noticed alongside it, then the close. Metadata events are stamped with
 * `incident.updated_at` because that is genuinely when we learned of them —
 * Statuspage does not say when a title or impact actually changed.
 */
export function diffIncident(
  incident: Incident,
  stored: StoredIssue | null,
): IssueChange {
  return stored ? diffKnownIncident(incident, stored) : diffNewIncident(incident);
}
