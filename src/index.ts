/**
 * gitdown Worker entrypoint.
 *
 * One Worker serves everything (SPEC 3): static assets are handled by the edge
 * before this code runs, `fetch` handles the API, and `scheduled` drives
 * ingestion once a minute.
 *
 * Only the ingestion source layer exists so far; reconcile and the API land in
 * the next steps of the build order.
 */
import { fetchSummary } from "./statuspage/client.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Anything that matched a static asset never reaches this handler, so a
    // request here for a non-API path is genuinely a miss.
    if (!pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return Response.json({ error: "not implemented" }, { status: 501 });
  },

  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(poll());
  },
} satisfies ExportedHandler<Env>;

async function poll(): Promise<void> {
  const feed = await fetchSummary();

  // Rejected incidents are the signal that githubstatus.com has changed shape
  // under us. Surfacing them is the whole point of validating (SPEC 14).
  for (const rejection of feed.rejected) {
    console.error(`statuspage: rejected incident ${rejection.id ?? "<unknown>"} — ${rejection.error}`);
  }

  console.log(
    JSON.stringify({
      msg: "statuspage poll",
      page_updated_at: feed.page.updated_at,
      unresolved: feed.incidents.length,
      components: feed.components.length,
      rejected: feed.rejected.length,
    }),
  );
}
