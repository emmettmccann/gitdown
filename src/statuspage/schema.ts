/**
 * Zod schemas for the Atlassian Statuspage v2 API as served by githubstatus.com.
 *
 * This is the only place in the codebase that trusts nothing. Everything
 * downstream — reconcile, the timeline, the rendered page — assumes these types
 * hold. The payload comes from an API we do not control and can also arrive via
 * an unauthenticated webhook path (SPEC 4.4), so shape is checked at runtime,
 * not just at compile time.
 *
 * Enum members are taken from Statuspage's documentation rather than from
 * observed traffic: `identified` and `postmortem` do not appear in any recent
 * githubstatus.com incident but are perfectly legal, and inferring the enum from
 * a sample would mean discovering that mid-outage.
 */
import { z } from "zod";

/** ISO-8601 UTC (`page.time_zone` is always `Etc/UTC`) to epoch milliseconds. */
const Timestamp = z.string().transform((value, ctx) => {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    ctx.addIssue({ code: "custom", message: `not an ISO-8601 timestamp: ${value}` });
    return z.NEVER;
  }
  return ms;
});

const NullableTimestamp = Timestamp.nullable().default(null);

export const IncidentStatus = z.enum([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "postmortem",
]);

export const IncidentImpact = z.enum([
  "none",
  "minor",
  "major",
  "critical",
  "maintenance",
]);

export const ComponentStatus = z.enum([
  "operational",
  "under_maintenance",
  "degraded_performance",
  "partial_outage",
  "major_outage",
]);

/**
 * A single component transition carried by an incident update. This — not
 * `incident.components[]` — is the authoritative record of what changed and
 * when, and it is what drives `component_changed` timeline events.
 */
export const AffectedComponent = z.object({
  code: z.string(),
  name: z.string(),
  old_status: ComponentStatus,
  new_status: ComponentStatus,
});

export const IncidentUpdate = z.object({
  id: z.string(),
  incident_id: z.string(),
  status: IncidentStatus,
  body: z.string(),
  created_at: Timestamp,
  /** Bumped without a new id when an operator edits the body after posting. */
  updated_at: Timestamp,
  /** Operators can backdate this; it is what the status page itself displays. */
  display_at: Timestamp,
  affected_components: z.array(AffectedComponent).nullish().default(null),
});

/**
 * The component records attached to an incident.
 *
 * Careful: `status` here is the component's *current* live status, not its
 * status during the incident — githubstatus.com returns `operational` on a
 * long-resolved outage, with an `updated_at` postdating the incident entirely.
 * Only the membership of this array is meaningful (it names which components the
 * incident touched, which is what we turn into labels). For state transitions,
 * use `IncidentUpdate.affected_components`.
 */
export const IncidentComponent = z.object({
  id: z.string(),
  name: z.string(),
  status: ComponentStatus,
  position: z.number().int(),
  description: z.string().nullish().default(null),
  group: z.boolean().default(false),
  group_id: z.string().nullish().default(null),
});

export const Incident = z.object({
  id: z.string(),
  name: z.string(),
  status: IncidentStatus,
  impact: IncidentImpact,
  shortlink: z.string(),
  created_at: Timestamp,
  updated_at: Timestamp,
  started_at: Timestamp,
  monitoring_at: NullableTimestamp,
  resolved_at: NullableTimestamp,
  page_id: z.string(),
  incident_updates: z.array(IncidentUpdate),
  components: z.array(IncidentComponent).default([]),
});

export const Page = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  time_zone: z.string(),
  /**
   * Moves whenever anything on the page changes, which makes it a cheap global
   * "has anything happened" check that costs zero database rows (SPEC 4.1).
   */
  updated_at: Timestamp,
});

export const Summary = z.object({
  page: Page,
  components: z.array(IncidentComponent).default([]),
  incidents: z.array(Incident).default([]),
});

export const IncidentsResponse = z.object({
  page: Page,
  incidents: z.array(Incident).default([]),
});

export type IncidentStatus = z.infer<typeof IncidentStatus>;
export type IncidentImpact = z.infer<typeof IncidentImpact>;
export type ComponentStatus = z.infer<typeof ComponentStatus>;
export type AffectedComponent = z.infer<typeof AffectedComponent>;
export type IncidentUpdate = z.infer<typeof IncidentUpdate>;
export type IncidentComponent = z.infer<typeof IncidentComponent>;
export type Incident = z.infer<typeof Incident>;
export type Page = z.infer<typeof Page>;
export type Summary = z.infer<typeof Summary>;

/**
 * githubstatus.com carries a component that is not a component — a banner row
 * used to point people at the status page. Left in, it becomes a nonsense label
 * on every issue we open (SPEC 4.2).
 */
const SENTINEL_COMPONENT_IDS = new Set(["0l2p9nhqnxpd"]);

export function isRealComponent(component: IncidentComponent): boolean {
  // Groups are layout containers rather than things that can break.
  return !SENTINEL_COMPONENT_IDS.has(component.id) && !component.group;
}
