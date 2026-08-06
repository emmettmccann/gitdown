/**
 * Orchestration: fold a parsed Statuspage feed into stored issue state.
 *
 * Safe to run concurrently with itself (SPEC 4.3) — cron and the webhook both
 * call this, and the diff's stable event ids mean a race produces duplicate
 * writes that the storage layer's unique constraints collapse, not duplicate
 * timeline rows.
 */
import type { ParsedFeed } from "../statuspage/parse.js";
import type { Incident } from "../statuspage/schema.js";
import { diffIncident } from "./diff.js";
import { isEmptyChange, type IssueStore } from "./types.js";

/** Sync-state key holding the last `page.updated_at` we fully processed. */
export const PAGE_CURSOR_KEY = "statuspage:page_updated_at";

export interface ReconcileOptions {
  /**
   * Skip incidents whose `updated_at` matches what we stored.
   *
   * This is purely a cost optimisation — the diff produces no events for an
   * unchanged incident regardless. Tests disable it to prove correctness does
   * not depend on it.
   */
  fastPath?: boolean;
  /**
   * Skip the whole feed when `page.updated_at` has not moved. Disabled for
   * backfill, where we process a feed the cursor has already passed.
   */
  usePageCursor?: boolean;
}

export interface ReconcileResult {
  /** True when the page cursor short-circuited the run. */
  skipped: boolean;
  opened: number;
  changed: number;
  closed: number;
  /** Incidents examined but found unchanged. */
  unchanged: number;
  /** Incidents whose payload predated what we already hold, and was dropped. */
  stale: number;
  /** Incidents dropped at the validation boundary, carried through to logs. */
  rejected: ParsedFeed["rejected"];
}

function emptyResult(feed: ParsedFeed, skipped: boolean): ReconcileResult {
  return {
    skipped,
    opened: 0,
    changed: 0,
    closed: 0,
    unchanged: 0,
    stale: 0,
    rejected: feed.rejected,
  };
}

async function reconcileIncident(
  incident: Incident,
  store: IssueStore,
  fastPath: boolean,
  result: ReconcileResult,
): Promise<void> {
  const stored = await store.loadByIncidentId(incident.id);

  // Statuspage is served from a CDN, and a poll can be handed a copy of the
  // incident older than the one we already folded in. Most of what the diff
  // would then do is harmless — appends and amendments are keyed by upstream id
  // and simply land again — but one thing is not: an update we hold and the
  // stale copy predates reads as "the operator deleted it", and the row is
  // struck through for good.
  //
  // A payload behind the one we last applied has nothing to tell us, so it is
  // dropped whole. Deliberately *not* behind `fastPath`: that flag marks a cost
  // optimisation the tests turn off to prove correctness does not rest on it,
  // and this is not one.
  if (stored && incident.updated_at < stored.srcUpdatedAt) {
    result.stale += 1;
    return;
  }

  if (stored && fastPath && stored.srcUpdatedAt === incident.updated_at) {
    result.unchanged += 1;
    return;
  }

  const change = diffIncident(incident, stored);

  if (isEmptyChange(change)) {
    // The patch may still differ (Statuspage bumped updated_at without a
    // user-visible change), but nothing worth a write.
    result.unchanged += 1;
    return;
  }

  await store.apply(change);

  if (change.isNew) result.opened += 1;
  else result.changed += 1;
  if (change.append.some((event) => event.kind === "closed")) result.closed += 1;
}

export async function reconcile(
  feed: ParsedFeed,
  store: IssueStore,
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const { fastPath = true, usePageCursor = true } = options;

  if (usePageCursor) {
    const cursor = await store.getSyncState(PAGE_CURSOR_KEY);
    if (cursor === String(feed.page.updated_at)) {
      return emptyResult(feed, true);
    }
  }

  const result = emptyResult(feed, false);

  // Oldest first, so that issue numbers ascend with time like a real repo
  // (SPEC 4.6). This matters most on backfill, where a whole week arrives at
  // once and the numbering would otherwise be arbitrary.
  const ordered = [...feed.incidents].sort(
    (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
  );

  for (const incident of ordered) {
    await reconcileIncident(incident, store, fastPath, result);
  }

  // Advanced only after every incident has been applied, so a failure part-way
  // through means the next run reprocesses rather than skipping the remainder.
  if (usePageCursor) {
    await store.setSyncState(PAGE_CURSOR_KEY, String(feed.page.updated_at));
  }

  return result;
}
