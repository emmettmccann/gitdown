# UI comparison shots

Reference captures used while aligning gitdown's issue views with the
equivalent views on github.com.

| File | View | Change |
|---|---|---|
| `gitdown-list-before.png` / `gitdown-list-after.png` | `/?state=closed` | Closer to github.com |
| `gitdown-issue-before.png` / `gitdown-issue-after.png` | `/issues/22` | Closer to github.com |
| `signed-in-list-before.png` / `signed-in-list-after.png` | `/?state=closed` | Signed-out chrome → signed-in |
| `signed-in-issue-before.png` / `signed-in-issue-after.png` | `/issues/5` | Signed-out chrome → signed-in |
| `stale-bundle-before.png` / `stale-bundle-after.png` | `/issues/8` | Deployed bundle out of step with the CSS |

The `stale-bundle-*` pair captures the deployed issue view against the fixed
one. `before` is `9f8baf2` exactly as gitdown.chat served it: that commit's CSS
rendered against the client bundle actually on the edge, which predates the
avatars moving inside the comment cards — so the timeline icons stack above the
cards and the rail lines up with nothing. Reproduce it by putting both halves
back:

```bash
git show 9f8baf2:public/css/style.css > public/css/style.css
git archive e13b6e6 src/client | tar -x -C /tmp/oldclient
npx esbuild /tmp/oldclient/src/client/main.ts --bundle --minify \
  --format=esm --target=es2022 --outfile=public/js/app.js
```

`after` is the same page with the bundle the build now guarantees, and with the
comment header restored to a filled band — `9f8baf2` had dropped it on the
grounds that the signed-in views do not have one, which the reference does not
bear out.

## Reproducing them

The captures are of `wrangler dev` on `localhost:8787`. Screenshots are 1440
wide at 1x in light mode — 1000 tall for the list, 1400 for the issue view, so
the whole thread and the composer under it fit in one frame.

The `signed-in-*` pair was taken against a live ingestion run rather than a
fixture, so the issue numbers are whatever githubstatus.com was carrying that
day:

```bash
rm -rf .wrangler/state && npm run db:migrate && npm run dev
curl "http://localhost:8787/__scheduled"
```

GitHub was healthy at the time, so `/issues/5` is a local row flipped open by
hand — the signed-in issue view only shows the composer on a live thread, and a
resolved one is locked (SPEC 9.3):

```bash
npx wrangler d1 execute gitdown --local \
  --command "UPDATE issues SET state='open', resolved_at=NULL WHERE number=5"
rm -rf .wrangler/state/v3/cache   # resolved issues are cached immutable
```

## The github.com side

The reference for each change was the rendered markup of
`github.com/emmettmccann/gitdown/issues/1` and its issues index — element
structure, class names, and the copy in each region — not a redraw from
memory. There is no committed screenshot of those pages: they are captured
here in an environment whose egress policy blocks `github.githubassets.com`,
so github.com loads without any of its stylesheets and a capture shows only
unstyled markup. Open the pages directly to compare.
