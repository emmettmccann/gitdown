/**
 * D1-backed IssueStore.
 *
 * Every change set is applied as one `batch()`, which D1 executes as a single
 * transaction — so a poll either lands completely or not at all. A partially
 * applied incident would be worse than a skipped one: the fast path keys off
 * `src_updated_at`, so an issue row written without its timeline rows would look
 * up-to-date forever and never self-heal.
 */
import type {
  IssueChange,
  IssuePatch,
  IssueState,
  IssueStore,
  StoredIssue,
  StoredUpdate,
  TimelineEvent,
} from "../reconcile/types.js";
import { BOT_ACTOR } from "../reconcile/types.js";
import type { IncidentImpact, IncidentStatus } from "../statuspage/schema.js";

interface IssueRow {
  number: number;
  incident_id: string;
  title: string;
  state: string;
  impact: string;
  status: string;
  components: string;
  src_updated_at: number;
}

interface UpdateRow {
  id: string;
  source_updated_at: number | null;
  deleted_at: number | null;
}

/** Body and meta columns for a timeline row, derived from the event kind. */
function columnsFor(event: TimelineEvent): { body: string | null; meta: string | null } {
  switch (event.kind) {
    case "status_update":
      return { body: event.body, meta: JSON.stringify({ status: event.status }) };
    case "opened":
      return { body: null, meta: JSON.stringify({ title: event.title }) };
    case "component_changed":
      return {
        body: null,
        meta: JSON.stringify({ component: event.component, from: event.from, to: event.to }),
      };
    case "renamed":
      return { body: null, meta: JSON.stringify({ from: event.from, to: event.to }) };
    case "label_added":
    case "label_removed":
      return { body: null, meta: JSON.stringify({ label: event.label }) };
    case "closed":
    case "reopened":
      return { body: null, meta: null };
  }
}

function sourceUpdatedAtOf(event: TimelineEvent): number | null {
  return event.kind === "status_update" ? event.sourceUpdatedAt : null;
}

function parseComponents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // A component list we cannot read costs labels, not the reconcile: treating
    // it as empty means the next diff re-adds them.
    return [];
  }
}

export class D1IssueStore implements IssueStore {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number = Date.now,
  ) {}

  async loadByIncidentId(incidentId: string): Promise<StoredIssue | null> {
    // Both statements in one batch: the second resolves the issue number via
    // subquery rather than waiting on the first result, so this is one round
    // trip rather than two.
    const [issueResult, updateResult] = await this.db.batch<IssueRow | UpdateRow>([
      this.db
        .prepare(
          `SELECT number, incident_id, title, state, impact, status, components, src_updated_at
             FROM issues WHERE incident_id = ?1`,
        )
        .bind(incidentId),
      this.db
        .prepare(
          `SELECT id, source_updated_at, deleted_at
             FROM timeline
            WHERE issue_num = (SELECT number FROM issues WHERE incident_id = ?1)
              AND kind = 'status_update'`,
        )
        .bind(incidentId),
    ]);

    const issue = issueResult?.results?.[0] as IssueRow | undefined;
    if (!issue) return null;

    const knownUpdates: StoredUpdate[] = ((updateResult?.results ?? []) as UpdateRow[]).map(
      (row) => ({
        id: row.id,
        updatedAt: row.source_updated_at ?? 0,
        deleted: row.deleted_at !== null,
      }),
    );

    return {
      incidentId: issue.incident_id,
      number: issue.number,
      title: issue.title,
      state: issue.state as IssueState,
      impact: issue.impact as IncidentImpact,
      status: issue.status as IncidentStatus,
      components: parseComponents(issue.components),
      srcUpdatedAt: issue.src_updated_at,
      knownUpdates,
    };
  }

  async apply(change: IssueChange): Promise<void> {
    const statements = [this.upsertIssue(change.incidentId, change.patch)];

    for (const event of change.append) {
      statements.push(this.insertEvent(change.incidentId, event));
    }
    for (const amendment of change.amend) {
      statements.push(
        this.db
          .prepare(
            `UPDATE timeline
                SET body = ?2, edited_at = ?3, source_updated_at = ?3
              WHERE id = ?1`,
          )
          .bind(amendment.id, amendment.body, amendment.editedAt),
      );
    }
    for (const id of change.remove) {
      statements.push(
        this.db
          .prepare(`UPDATE timeline SET deleted_at = ?2 WHERE id = ?1 AND deleted_at IS NULL`)
          .bind(id, this.now()),
      );
    }

    await this.db.batch(statements);
  }

  private upsertIssue(incidentId: string, patch: IssuePatch): D1PreparedStatement {
    // created_at and started_at are deliberately not updated on conflict: they
    // describe when the incident began, not when we last looked at it.
    return this.db
      .prepare(
        `INSERT INTO issues (incident_id, title, state, impact, status, shortlink, components,
                             started_at, resolved_at, created_at, updated_at, src_updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT (incident_id) DO UPDATE SET
           title          = excluded.title,
           state          = excluded.state,
           impact         = excluded.impact,
           status         = excluded.status,
           shortlink      = excluded.shortlink,
           components     = excluded.components,
           resolved_at    = excluded.resolved_at,
           updated_at     = excluded.updated_at,
           src_updated_at = excluded.src_updated_at`,
      )
      .bind(
        incidentId,
        patch.title,
        patch.state,
        patch.impact,
        patch.status,
        patch.shortlink,
        JSON.stringify(patch.components),
        patch.startedAt,
        patch.resolvedAt,
        patch.createdAt,
        patch.updatedAt,
        patch.srcUpdatedAt,
      );
  }

  private insertEvent(incidentId: string, event: TimelineEvent): D1PreparedStatement {
    const { body, meta } = columnsFor(event);
    // The issue number is resolved by subquery so this can sit in the same
    // batch as the insert that created the issue.
    return this.db
      .prepare(
        `INSERT INTO timeline (id, issue_num, kind, actor, body, meta, created_at, source_updated_at)
         VALUES (?1, (SELECT number FROM issues WHERE incident_id = ?2), ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(event.id, incidentId, event.kind, BOT_ACTOR, body, meta, event.createdAt, sourceUpdatedAtOf(event));
  }

  async getSyncState(key: string): Promise<string | null> {
    const row = await this.db
      .prepare(`SELECT value FROM sync_state WHERE key = ?1`)
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  async setSyncState(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .bind(key, value)
      .run();
  }
}
