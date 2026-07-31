# gitdown

A parody of the GitHub Issues UI. Hand-built static HTML/CSS that visually mimics github.com's issues list and single-issue views — not scraped or copied from GitHub's actual source, just recreated to look the part.

This is a front-end building-block skeleton: static pages and reusable CSS components (labels, timeline events, comment boxes, reactions, avatars, etc.) to draw from when building out a real, functional parody of the Issues list + single-issue flow.

## Running locally

```bash
cd public && python3 -m http.server 8420
```

Then open `http://localhost:8420/index.html`.

## What's here

- `public/index.html` — issues list page
- `public/issue-1.html` — a sparse single-issue page (no labels, no comments)
- `public/issue-2.html` — a filled-out single-issue page with fake content, showing off the fuller component set: colored labels, bot comments, reactions, timeline/activity events, cross-reference mentions, avatar stacks
- `public/css/style.css` — shared stylesheet with GitHub-like design tokens (colors, spacing, typography) and all component styles

Note: when editing `style.css`, bump the `?v=N` query param on the `<link>` tags in the HTML files — the browser aggressively caches the stylesheet otherwise.

## Not yet built

This is visuals/structure only — no backend, no routing, no real data. Next steps: an actual issues data model, dynamic list/detail views, and create/comment functionality.
