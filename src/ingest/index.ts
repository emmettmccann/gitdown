/**
 * The ingestion entry points the Worker calls: a one-time backfill and the
 * per-minute poll.
 */
import { fetchIncidents, fetchSummary, type ClientOptions } from "../statuspage/client.js";
import { reconcile, type ReconcileResult } from "../reconcile/reconcile.js";
import type { ParsedFeed } from "../statuspage/parse.js";
import type { IssueStore } from "../reconcile/types.js";

/** Set once the initial backfill has run, so it never repeats. */
export const BACKFILL_KEY = "backfill:completed_at";

/**
 * How much history to seed on first run (SPEC 4.6).
 *
 * Deliberately short: the site is about what is broken now, and a long archive
 * would undercut that. Note the consequence — GitHub is usually fine, so a fresh
 * deploy may well show an empty issue list.
 */
export const BACKFILL_WINDOW_DAYS = 7;

export interface IngestOptions extends ClientOptions {
  now?: () => number;
  /** Overrides BACKFILL_WINDOW_DAYS. Useful locally, where a 7-day window
   *  often catches nothing because GitHub is usually fine. */
  windowDays?: number;
}

/**
 * Seed recent history, once.
 *
 * Runs with the page cursor disabled: the cursor tracks the live feed, and
 * backfill deliberately processes incidents it has already passed.
 */
export async function backfill(
  store: IssueStore,
  options: IngestOptions = {},
): Promise<ReconcileResult | null> {
  const now = options.now ?? Date.now;

  if (await store.getSyncState(BACKFILL_KEY)) return null;

  const feed = await fetchIncidents(options);
  const windowDays = options.windowDays ?? BACKFILL_WINDOW_DAYS;
  const cutoff = now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = feed.incidents.filter((incident) => incident.created_at >= cutoff);

  const result = await reconcile({ ...feed, incidents: recent }, store, {
    usePageCursor: false,
  });

  // Written after the reconcile so a failure part-way leaves backfill pending
  // rather than half-done and marked complete.
  await store.setSyncState(BACKFILL_KEY, String(now()));
  return result;
}

function merge(a: ReconcileResult, b: ReconcileResult): ReconcileResult {
  return {
    skipped: a.skipped && b.skipped,
    opened: a.opened + b.opened,
    changed: a.changed + b.changed,
    closed: a.closed + b.closed,
    unchanged: a.unchanged + b.unchanged,
    stale: a.stale + b.stale,
    rejected: [...a.rejected, ...b.rejected],
  };
}

/**
 * Close issues whose incident has left the summary feed.
 *
 * `summary.json` carries only *unresolved* incidents, so resolution is the one
 * transition that removes an incident from the feed rather than showing up in
 * it. Reconcile iterates the feed, so on its own it can never observe a close:
 * the issue simply freezes at whatever the last poll saw.
 *
 * The fix has to run the comparison the other way round — what do we hold open
 * that the feed no longer lists? Those ids, and only those, are then looked up
 * in `incidents.json`, which does include resolved incidents. That feed is ~55x
 * the size of the summary, which is why this is conditional: in the healthy case
 * we hold nothing open, the divergence is empty, and no second request happens.
 *
 * Deliberately *not* gated on the page cursor. The summary reconcile advances
 * the cursor before this runs, so a catch-up that fails would otherwise be
 * locked out on every subsequent poll and the issue would stay open forever.
 */
async function catchUpResolved(
  summary: ParsedFeed,
  store: IssueStore,
  options: IngestOptions,
): Promise<ReconcileResult | null> {
  const unresolved = new Set(summary.incidents.map((incident) => incident.id));
  const missing = new Set(
    (await store.listOpenIncidentIds()).filter((id) => !unresolved.has(id)),
  );
  if (missing.size === 0) return null;

  const feed = await fetchIncidents(options);

  // The cursor is disabled for the same reason backfill disables it: this feed
  // has already been passed, and the whole point is to reprocess it.
  return reconcile(
    { ...feed, incidents: feed.incidents.filter((incident) => missing.has(incident.id)) },
    store,
    { usePageCursor: false },
  );
}

/** One poll of the live status page, plus catch-up for anything it resolved. */
export async function poll(
  store: IssueStore,
  options: IngestOptions = {},
): Promise<ReconcileResult> {
  const summary = await fetchSummary(options);
  const result = await reconcile(summary, store);
  const caughtUp = await catchUpResolved(summary, store, options);
  return caughtUp ? merge(result, caughtUp) : result;
}

/** Backfill if needed, then poll. Called from the cron handler. */
export async function ingest(
  store: IssueStore,
  options: IngestOptions = {},
): Promise<ReconcileResult> {
  await backfill(store, options);
  return poll(store, options);
}
