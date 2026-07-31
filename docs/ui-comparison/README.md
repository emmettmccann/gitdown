# UI comparison shots

Reference captures used while aligning gitdown's issue views with the
equivalent views on github.com.

| File | View |
|---|---|
| `gitdown-list-before.png` / `gitdown-list-after.png` | `/?state=closed` |
| `gitdown-issue-before.png` / `gitdown-issue-after.png` | `/issues/22` |

## Reproducing them

The captures are of `wrangler dev` on `localhost:8787`, seeded from the
recorded statuspage payload in `test/fixtures/incidents.json` rather than from
live githubstatus.com, so the same issue numbers and timeline come back every
time. Point `STATUSPAGE_BASE` at a static server holding that fixture under
`/api/v2/incidents.json`, raise `BACKFILL_DAYS`, then:

```bash
rm -rf .wrangler/state && npm run db:migrate && npm run dev
curl "http://localhost:8787/__scheduled"
```

Screenshots are 1440x1000 at 1x in light mode.

## The github.com side

The reference for each change was the rendered markup of
`github.com/emmettmccann/gitdown/issues/1` and its issues index — element
structure, class names, and the copy in each region — not a redraw from
memory. There is no committed screenshot of those pages: they are captured
here in an environment whose egress policy blocks `github.githubassets.com`,
so github.com loads without any of its stylesheets and a capture shows only
unstyled markup. Open the pages directly to compare.
