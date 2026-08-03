/**
 * In-memory IssueStore for tests.
 *
 * Mirrors the semantics the D1 implementation must have, in particular the
 * unique constraint on timeline ids — appending an id that already exists is
 * ignored rather than duplicated, which is what makes concurrent reconciles
 * safe (SPEC 4.3).
 */
import type {
  IssueChange,
  IssuePatch,
  IssueStore,
  StoredIssue,
  TimelineEvent,
} from "../../src/reconcile/types.js";

export interface StoredRow {
  seq: number;
  event: TimelineEvent;
  issueNumber: number;
  body?: string;
  /** Mirrors the upstream `updated_at`; bumped when an amendment lands. */
  sourceUpdatedAt?: number;
  editedAt?: number;
  deletedAt?: number;
}

type IssueRecord = IssuePatch & {
  incidentId: string;
  number: number;
};

export class MemoryIssueStore implements IssueStore {
  private readonly issues = new Map<string, IssueRecord>();
  private readonly rows: StoredRow[] = [];
  private readonly rowIds = new Set<string>();
  private readonly sync = new Map<string, string>();
  private nextNumber = 1;
  private nextSeq = 1;

  /** Counts every apply() call, to assert that unchanged feeds write nothing. */
  applyCount = 0;

  async loadByIncidentId(incidentId: string): Promise<StoredIssue | null> {
    const issue = this.issues.get(incidentId);
    if (!issue) return null;

    const knownUpdates = this.rows
      .filter((row) => row.issueNumber === issue.number && row.event.kind === "status_update")
      .map((row) => ({
        id: row.event.id,
        updatedAt: row.sourceUpdatedAt ?? 0,
        deleted: row.deletedAt !== undefined,
      }));

    return {
      incidentId: issue.incidentId,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      impact: issue.impact,
      status: issue.status,
      components: [...issue.components],
      srcUpdatedAt: issue.srcUpdatedAt,
      knownUpdates,
    };
  }

  async listOpenIncidentIds(): Promise<string[]> {
    return [...this.issues.values()]
      .filter((issue) => issue.state === "open")
      .map((issue) => issue.incidentId);
  }

  async apply(change: IssueChange): Promise<void> {
    this.applyCount += 1;

    let issue = this.issues.get(change.incidentId);
    if (!issue) {
      issue = {
        incidentId: change.incidentId,
        number: this.nextNumber++,
        ...change.patch,
      };
      this.issues.set(change.incidentId, issue);
    }

    Object.assign(issue, change.patch);

    for (const event of change.append) {
      // The UNIQUE constraint on timeline.id, in miniature.
      if (this.rowIds.has(event.id)) continue;
      this.rowIds.add(event.id);
      this.rows.push({
        seq: this.nextSeq++,
        event,
        issueNumber: issue.number,
        ...(event.kind === "status_update"
          ? { body: event.body, sourceUpdatedAt: event.sourceUpdatedAt }
          : {}),
      });
    }

    for (const amendment of change.amend) {
      const row = this.rows.find((r) => r.event.id === amendment.id);
      if (row) {
        row.body = amendment.body;
        row.editedAt = amendment.editedAt;
        // Keeps the stored mirror in step, so the amendment is not recomputed
        // on every subsequent poll.
        row.sourceUpdatedAt = amendment.editedAt;
      }
    }

    for (const id of change.remove) {
      const row = this.rows.find((r) => r.event.id === id);
      if (row) row.deletedAt = Date.now();
    }
  }

  async getSyncState(key: string): Promise<string | null> {
    return this.sync.get(key) ?? null;
  }

  async setSyncState(key: string, value: string): Promise<void> {
    this.sync.set(key, value);
  }

  // ---- test inspection helpers ----

  issue(incidentId: string): IssueRecord | undefined {
    return this.issues.get(incidentId);
  }

  get issueCount(): number {
    return this.issues.size;
  }

  timeline(incidentId: string): StoredRow[] {
    const number = this.issues.get(incidentId)?.number;
    if (number === undefined) return [];
    return this.rows.filter((row) => row.issueNumber === number).sort((a, b) => a.seq - b.seq);
  }

  /** Kinds in timeline order — a compact way to assert the shape of a thread. */
  kinds(incidentId: string): string[] {
    return this.timeline(incidentId).map((row) => row.event.kind);
  }

  get totalRows(): number {
    return this.rows.length;
  }
}
