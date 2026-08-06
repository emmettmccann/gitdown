/**
 * Types for turning a Statuspage incident into gitdown issue changes.
 *
 * The design centres on a *change set* rather than the granular sink methods
 * sketched in SPEC 5 (`openIssue`, `addUpdate`, `closeIssue`, …). Computing what
 * changed is pure and applying it is I/O, so keeping them apart means the entire
 * diffing behaviour — the part with the bugs in it — is testable without a
 * database, and a storage backend applies one change set in one transaction
 * instead of being driven through six calls.
 */
import type {
  ComponentStatus,
  IncidentImpact,
  IncidentStatus,
} from "../statuspage/schema.js";
import type { IssueState } from "../shared/api.js";

export type { IssueState };

/** Every bot-authored row is attributed to the status page itself. */
export const BOT_ACTOR = "githubstatus";

/**
 * What we already believe about an incident, as loaded from storage. This is
 * deliberately the minimum needed to diff — not the full issue row.
 */
export interface StoredIssue {
  incidentId: string;
  number: number;
  title: string;
  state: IssueState;
  impact: IncidentImpact;
  status: IncidentStatus;
  /** Component labels, as names. */
  components: string[];
  /** `incident.updated_at` when last reconciled; powers the fast-path skip. */
  srcUpdatedAt: number;
  /** Every incident update we have already written, keyed by Statuspage id. */
  knownUpdates: StoredUpdate[];
}

export interface StoredUpdate {
  id: string;
  /** Last-seen `updated_at`; a bump without a new id means an edited body. */
  updatedAt: number;
  deleted: boolean;
}

export type TimelineEvent =
  | { kind: "opened"; id: string; createdAt: number; title: string }
  | {
      kind: "status_update";
      id: string;
      createdAt: number;
      /**
       * The upstream `updated_at`. Must be persisted: it is the only thing that
       * distinguishes "operator edited this comment" from "we are looking at
       * this comment again", and Statuspage sets it ahead of `created_at` on
       * plenty of updates that were never edited. Without it, every poll
       * re-amends every comment.
       */
      sourceUpdatedAt: number;
      status: IncidentStatus;
      body: string;
    }
  | {
      kind: "component_changed";
      id: string;
      createdAt: number;
      component: string;
      from: ComponentStatus;
      to: ComponentStatus;
    }
  | { kind: "renamed"; id: string; createdAt: number; from: string; to: string }
  | { kind: "label_added"; id: string; createdAt: number; label: string }
  | { kind: "label_removed"; id: string; createdAt: number; label: string }
  | { kind: "closed"; id: string; createdAt: number }
  | { kind: "reopened"; id: string; createdAt: number };

export type TimelineEventKind = TimelineEvent["kind"];

/** An already-written status update whose body an operator has since edited. */
export interface AmendedUpdate {
  id: string;
  body: string;
  editedAt: number;
}

/**
 * Field-level state of the issue row.
 *
 * Carries everything needed to insert the row from scratch, not just what
 * changed, so a store can apply a change set without ever seeing the incident
 * it came from.
 */
export interface IssuePatch {
  title: string;
  state: IssueState;
  impact: IncidentImpact;
  status: IncidentStatus;
  components: string[];
  shortlink: string;
  startedAt: number;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
  srcUpdatedAt: number;
}

export interface IssueChange {
  incidentId: string;
  /** True when this incident has never been seen before. */
  isNew: boolean;
  patch: IssuePatch;
  /** New timeline rows, in the order they should be inserted. */
  append: TimelineEvent[];
  /** Existing status-update rows whose body changed upstream. */
  amend: AmendedUpdate[];
  /** Timeline ids to soft-delete: present last sync, absent now. */
  remove: string[];
  /**
   * Timeline ids to un-delete: marked deleted here, present upstream again.
   *
   * Statuspage does not resurrect updates, so in practice this only ever undoes
   * a deletion of our own that should not have happened — see the note on
   * `remove` in diff.ts.
   */
  restore: string[];
}

export function isEmptyChange(change: IssueChange): boolean {
  return (
    !change.isNew &&
    change.append.length === 0 &&
    change.amend.length === 0 &&
    change.remove.length === 0 &&
    change.restore.length === 0
  );
}

/**
 * Storage for reconcile. A D1 implementation lands in step 3; the `GitHubSink`
 * proof-of-concept (SPEC 5) would implement the same interface by translating a
 * change set into REST calls.
 */
export interface IssueStore {
  loadByIncidentId(incidentId: string): Promise<StoredIssue | null>;
  /**
   * Incident ids of every issue we still believe is open.
   *
   * Reconcile is driven by the feed, so it can only ever learn about incidents
   * the feed still contains. This is the one question that has to be asked of
   * storage instead: resolution *removes* an incident from the live summary,
   * so the only way to notice it is to compare what we hold open against what
   * the feed still lists (see `poll` in ingest).
   */
  listOpenIncidentIds(): Promise<string[]>;
  apply(change: IssueChange): Promise<void>;
  getSyncState(key: string): Promise<string | null>;
  setSyncState(key: string, value: string): Promise<void>;
}
