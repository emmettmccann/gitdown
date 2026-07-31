/**
 * The ingestion entry points the Worker calls: a one-time backfill and the
 * per-minute poll.
 */
import { fetchIncidents, fetchSummary, type ClientOptions } from "../statuspage/client.js";
import { reconcile, type ReconcileResult } from "../reconcile/reconcile.js";
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

/** One poll of the live status page. */
export async function poll(
  store: IssueStore,
  options: IngestOptions = {},
): Promise<ReconcileResult> {
  return reconcile(await fetchSummary(options), store);
}

/** Backfill if needed, then poll. Called from the cron handler. */
export async function ingest(
  store: IssueStore,
  options: IngestOptions = {},
): Promise<ReconcileResult> {
  await backfill(store, options);
  return poll(store, options);
}
