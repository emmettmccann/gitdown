# Screenshots

Capture frames referenced from pull request descriptions. This branch has no
relation to `main` and is never merged — the images live here so a review can
show them without a megabyte of PNGs landing in the diff being reviewed.

## `feat/react-frontend` (#22)

Both halves of every pair were captured in one session against two servers
running at once over the same database — `main` on `:8787`, the branch on
`:5173` — so a difference between two frames is a difference in the code and
not in the rows behind it. The visitor is pinned into `localStorage`
(`gd.session.id` / `.token` / `.name`), or each frame invents its own session
and the display name and avatar colour drift for no reason.

1440 wide at 1x in light mode, matching the older captures under
`docs/ui-comparison/` on `main`.

| File | View | Shows |
|---|---|---|
| `react-list-before.png` / `react-list-after.png` | `/?state=closed` | DOM client → React. Should be identical |
| `react-issue-before.png` / `react-issue-after.png` | `/issues/5` | DOM client → React. Should be identical |
| `composer-identity-before.png` / `composer-identity-after.png` | `/issues/5` | "Commenting as" moves into the composer footer |
| `profile-menu-before.png` / `profile-menu-after.png` | `/issues/5` | Clicking the avatar: unicorn page → account menu |
| `profile-menu-rename-after.png` | `/issues/5` | That menu with the rename editor open |

The two `react-*` pairs are the load-bearing ones: the port claims the views are
unchanged, and a pair that differs anywhere except the header avatar means it
isn't. That avatar is the one intended difference — a fixed purple before, the
visitor's own colour from the shared palette after.

`profile-menu-before` is not a menu. Before that branch the avatar was dead
chrome, so the same click that now opens the card used to land on the unicorn
page. Both frames are that one click.
