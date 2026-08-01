# gitdown

A parody of the GitHub Issues UI that turns **GitHub's own status page into a conversational feed**.

When GitHub opens an incident on [githubstatus.com](https://www.githubstatus.com), gitdown opens a corresponding issue. Each official incident update becomes a bot comment on that issue's timeline, component outages become timeline events, impact escalation becomes a label change, and when GitHub resolves the incident the issue closes — permanently. While it's open, anyone can pile in and complain.

The visual layer is hand-built HTML/CSS that mimics github.com's issues views as they look to a **signed-in** user — light header with the repo in the breadcrumb, side nav on the issues dashboard, a comment composer under the thread. Nothing is scraped or copied from GitHub's source; it's recreated to look the part.

The composer posts for real. Three controls are live — the textarea, the Comment button, and the display-name editor; the markdown toolbar around them is still parody chrome routed to the unicorn page, and the whole block is hidden once an incident resolves and the thread locks.

See [SPEC.md](SPEC.md) for the full design — architecture, data model, cost model, and the reasoning behind the decisions.

## Running locally

Needs Node 22+. No Cloudflare account required — `wrangler dev` runs the Worker and a local SQLite database on your machine.

```bash
npm install && npm run db:migrate
```

```bash
npm run dev
```

The cron trigger doesn't fire on its own locally, so kick off an ingestion run by hand. This fetches **real live data** from githubstatus.com:

```bash
curl "http://localhost:8787/__scheduled"
```

Then open **http://localhost:8787** — the issues list renders whatever it found.

GitHub is usually fine, so the *open* list is normally empty and the interesting data is under **http://localhost:8787/?state=closed**. Click any issue to see the incident as a full GitHub-style thread. If a week of history turns up nothing at all, raise `BACKFILL_DAYS` in `wrangler.jsonc` and reset:

```bash
rm -rf .wrangler/state && npm run db:migrate
```

The composer only appears on **open** issues, since a resolved thread is frozen ([SPEC 9.3](SPEC.md#93-lifecycle-a-thread-lives-exactly-as-long-as-the-incident)) — so when GitHub is behaving there may be nothing to comment on. To try it anyway, reopen a closed one locally:

```bash
npx wrangler d1 execute gitdown --local --command "UPDATE issues SET state='open', resolved_at=NULL WHERE number=<N>"
```

The next ingestion run will close it again, which is a decent way to watch the close race handle a comment that was in flight.

Note that the backfill only runs once per database — the reset above is how you re-run it. Wrangler rebuilds the browser bundle on every `dev` and `deploy` (the `build` command in `wrangler.jsonc`), so after editing anything under `src/client/`, restart it.

That bundle lands in `public/js/`, which is gitignored, while the pages and stylesheet that position its markup are tracked. Building from wrangler rather than from the npm scripts is what keeps the two in the same generation — a bare `wrangler deploy` rebuilds it too. The build then runs `scripts/check-assets.mjs`, which fails if any page references a static file that isn't on disk, so a missing bundle stops the deploy instead of shipping a page that never finishes loading.

## API

| Endpoint | Notes |
|---|---|
| `GET /api/issues?state=open\|closed&page=N` | Issue list, 25 per page |
| `GET /api/issues/:n` | Issue with its full timeline |
| `GET /api/issues/:n/timeline?since=<seq>` | Poll for new events only |
| `POST /api/issues/:n/comments` | Post a comment. `201` + the created row, `409` if the thread is locked |
| `PUT /api/session/name` | Change your display name. Requires the session token |

Closed issues are immutable, so they're served with a one-year `immutable` cache header; live ones get 5 seconds. Timeline responses carry an `ETag` — repeat polls come back `304` with no body. Writes are never cached.

Identity is a `session_id` and a `session_token` the browser generates on first visit and keeps in `localStorage`. The id is public and appears in the feed as the comment's author; the server stores only `SHA-256(token)`, so the sessions table is not a list of credentials. It is not authentication and isn't described as such — it stops one visitor posting under another's established name, which is the actual threat on an anonymous comment box. Names matching `/^github/i` are reserved, because the bot would otherwise be trivially impersonable in a thread about GitHub being broken.

## Testing

```bash
npm test
```

Tests run inside the real Workers runtime (`workerd`) with a real D1 database, not mocks. The reconcile suite replays a recorded 18-update GitHub incident one poll at a time, which is the only way to reach the bugs that matter — a missed update, a duplicated comment, a close firing twice.

```bash
npm run typecheck
```

## Layout

```
src/
  statuspage/   fetch + validate githubstatus.com (Zod schemas, fixtures)
  reconcile/    pure diffing: incident -> issue changes
  store/        D1 persistence and read queries
  ingest/       backfill + poll entry points
  api/          routes and edge caching
  shared/       the API contract, imported by both Worker and browser
  client/       front-end, bundled by esbuild to public/js/app.js
migrations/     D1 schema
public/         static assets (served by the edge, free and uncounted)
test/           fixtures are real recorded payloads
```

## Status

Ingestion, the read API, the front-end and the comment write path work — it is a live, browsable mirror of GitHub's status page that you can talk back to. Still to come: reactions, and the abuse controls in [SPEC.md](SPEC.md#10-abuse-moderation-safety) — rate limiting, Turnstile, a kill switch, and a sanitized markdown subset. **Those are step 8 and need to exist before any real traffic does**; comments currently render as plain text with no rate limit. See the build order in [SPEC.md](SPEC.md#16-build-order).

Not affiliated with, endorsed by, or connected to GitHub or Microsoft.
