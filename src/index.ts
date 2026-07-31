/**
 * gitdown Worker entrypoint.
 *
 * One Worker serves everything (SPEC 3): static assets are handled by the edge
 * before this code runs, `fetch` handles the API, and `scheduled` drives
 * ingestion once a minute.
 *
 * The API is read-only; the write path is step 6.
 */
import { handleApiRequest } from "./api/router.js";
import { ingest } from "./ingest/index.js";
import { D1IssueStore } from "./store/d1.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Anything that matched a static asset never reaches this handler, so a
    // request here for a non-API path is genuinely a miss.
    if (!pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return handleApiRequest(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestion(env));
  },
} satisfies ExportedHandler<Env>;

async function runIngestion(env: Env): Promise<void> {
  const store = new D1IssueStore(env.DB);
  const windowDays = Number(env.BACKFILL_DAYS);

  try {
    const result = await ingest(store, {
      ...(Number.isFinite(windowDays) && windowDays > 0 ? { windowDays } : {}),
    });

    // Rejected incidents mean githubstatus.com has changed shape under us —
    // surfacing them is the whole point of validating at the boundary.
    for (const rejection of result.rejected) {
      console.error(
        `statuspage: rejected incident ${rejection.id ?? "<unknown>"} — ${rejection.error}`,
      );
    }

    console.log(
      JSON.stringify({
        msg: "ingest",
        skipped: result.skipped,
        opened: result.opened,
        changed: result.changed,
        closed: result.closed,
        unchanged: result.unchanged,
        rejected: result.rejected.length,
      }),
    );
  } catch (error) {
    // A failed poll is recoverable — the cursor only advances on success, so
    // the next run reprocesses. Log and let the cron retry rather than throwing
    // into the runtime.
    console.error(`ingest failed: ${error instanceof Error ? error.stack : String(error)}`);
  }
}
