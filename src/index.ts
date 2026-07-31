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
    // rather than carrying a query parameter; the client reads the number back
    // out of the path.
    //
    // Ask for "/issue", not "/issue.html": the asset router canonicalises
    // extension-ful URLs by redirecting to the extensionless form, and that
    // redirect would be passed straight through to the browser.
    if (ISSUE_PAGE.test(pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/issue", request.url), request));
    }

    // The joke page is linked to deliberately from every dead control, so it
    // gets the status code it is named after rather than a 200.
    if (pathname === "/503") {
      return oopsPage(request, env, 503);
    }

    // Anything else that matched a static asset never reached this handler, so
    // a request here really is a miss — and a real miss deserves the unicorn
    // just as much as a decorative one.
    return oopsPage(request, env, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestion(env));
  },
} satisfies ExportedHandler<Env>;

/**
 * Serves the unicorn page under a chosen status code.
 *
 * Asked for "/503" without the extension for the same reason as the issue
 * shell: the asset router redirects extension-ful URLs to the extensionless
 * form, and that redirect would reach the browser instead of the page.
 */
async function oopsPage(request: Request, env: Env, status: number): Promise<Response> {
  const asset = await env.ASSETS.fetch(new Request(new URL("/503", request.url), request));
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
