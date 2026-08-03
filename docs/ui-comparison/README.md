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
| `comment-header-before.png` / `comment-header-after.png` | `/issues/8` | Comment header flat → filled band |
| `react-list-before.png` / `react-list-after.png` | `/?state=closed` | DOM client → React. Should be identical |
| `react-issue-before.png` / `react-issue-after.png` | `/issues/5` | DOM client → React. Should be identical |
| `composer-identity-before.png` / `composer-identity-after.png` | `/issues/5` | "Commenting as" moves into the composer footer |
| `profile-menu-before.png` / `profile-menu-after.png` | `/issues/5` | Clicking the avatar: unicorn page → account menu |
| `profile-menu-rename-after.png` | `/issues/5` | That menu with the rename editor open |

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

The `comment-header-*` pair isolates that last part, with the bundle correct on
both sides: `before` is `main` once the bundle fix had shipped, still carrying a
flat header, and `after` is the band restored. Both are the same 1440×700 frame
so the header is legible without the whole thread around it.

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

### The `react-*`, `composer-identity-*` and `profile-menu-*` sets

These five differ from the pairs above in that both halves were captured in the
same session, against two servers running at once over **one** database — so a
difference in the frames is a difference in the code and nothing else. `main` on
`:8787` is the before; the branch on `:5173` is the after.

```bash
git worktree add /tmp/gitdown-before main
cd /tmp/gitdown-before && npm install
cp -R ../gitdown/.wrangler/state .wrangler/state   # same rows on both sides
npx wrangler dev --test-scheduled --port 8787
```

The visitor is pinned rather than generated, by seeding `gd.session.id` /
`.token` / `.name` into `localStorage` before each capture. Without that each
frame invents its own session and the display name and avatar colour move
between before and after for no reason at all.

The two `react-*` pairs are the load-bearing ones: the port claims the views are
unchanged, and a pair that differs anywhere except the header avatar means it
isn't. That avatar is the one intended difference — it used to be a fixed purple
and now draws the visitor's own colour from the same palette every other face on
the site uses.

`profile-menu-before` is not a menu: before this branch the avatar was dead
chrome, so the same click that now opens the card used to land on the unicorn
page. Both frames are that one click.

## The github.com side

The reference for each change was the rendered markup of
`github.com/emmettmccann/gitdown/issues/1` and its issues index — element
structure, class names, and the copy in each region — not a redraw from
memory. There is no committed screenshot of those pages: they are captured
here in an environment whose egress policy blocks `github.githubassets.com`,
so github.com loads without any of its stylesheets and a capture shows only
unstyled markup. Open the pages directly to compare.
