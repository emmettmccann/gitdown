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

const ISSUE_PAGE = /^\/issues\/\d+\/?$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }

    // /issues/6 is not a file, so it lands here (see run_worker_first in
    // wrangler.jsonc). Serving the shell lets issue URLs look like GitHub's
    // rather than carrying a query parameter; the client router reads the
    // number back out of the path.
    if (ISSUE_PAGE.test(pathname)) {
      return shell(request, env, 200);
    }

    // The joke page is linked to deliberately from every dead control, so it
    // gets the status code it is named after rather than a 200. That code is
    // the reason dead chrome leaves the page for real instead of routing in the
    // client — a client-side navigation would render the joke behind a 200.
    if (pathname === "/503") {
      return shell(request, env, 503);
    }

    // Anything that matched a static asset never reached this handler, so a
    // request here really is a miss — and a real miss deserves the unicorn just
    // as much as a decorative one. The shell renders it either way; only the
    // status code says which happened.
    return shell(request, env, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestion(env));
  },
} satisfies ExportedHandler<Env>;

/**
 * Serves the single-page shell under a chosen status code.
 *
 * One document backs every route now, so which page a visitor gets is the
 * router's business and the status code is this handler's. Asked for "/", not
 * "/index.html": the asset router canonicalises extension-ful URLs by
 * redirecting to the extensionless form, and that redirect would be passed
 * straight through to the browser.
 */
async function shell(request: Request, env: Env, status: number): Promise<Response> {
  const asset = await env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  return new Response(asset.body, { status, headers: asset.headers });
}

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
        // Non-zero means the CDN handed us a copy older than what we hold. A
        // few is normal; a lot means the poll is routinely reading behind.
        stale: result.stale,
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
