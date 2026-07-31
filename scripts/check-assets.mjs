/**
 * Fails the build if a page references a static file that is not on disk.
 *
 * `public/js/app.js` is a build artifact and is gitignored, so it exists only
 * because something ran `build:client`. `wrangler deploy` uploads `./public`
 * verbatim, which means a deploy that skipped the build ships the pages and the
 * stylesheet — both tracked in git, both current — with a stale bundle beside
 * them, or with no bundle at all. Neither fails anything: the edge just serves
 * a 404 for the script, and the issue page sits on "Loading…" forever.
 *
 * Wired into `build:client`, which wrangler.jsonc runs on every dev and deploy,
 * so the mismatch is caught before it can be uploaded.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "public";

/** Root-relative `src`/`href` values, which is how every page here links. */
const REFERENCE = /(?:src|href)="(\/[^"]*)"/g;

/**
 * Routes are served by the Worker, not by the asset router, and have no file
 * behind them — `/issues/8` and `/503` are pages, `/css/style.css` is a file.
 * An extension in the last path segment is what separates the two.
 */
function isFileReference(path) {
  return /\.[a-z0-9]+$/i.test(path.split("/").pop() ?? "");
}

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith(".html")) found.push(path);
  }
  return found;
}

const missing = [];

for (const page of await htmlFiles(PUBLIC_DIR)) {
  const html = await readFile(page, "utf8");
  for (const [, reference] of html.matchAll(REFERENCE)) {
    // The cache-busting query is part of the URL, not of the filename.
    const path = reference.split("?")[0];
    if (!isFileReference(path)) continue;

    const file = join(PUBLIC_DIR, path);
    const exists = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    if (!exists) missing.push({ page, reference, file });
  }
}

if (missing.length > 0) {
  console.error("Pages reference static files that do not exist:\n");
  for (const { page, reference, file } of missing) {
    console.error(`  ${page} → ${reference}  (expected ${file})`);
  }
  console.error("\nRun `npm run build:client` and try again.");
  process.exit(1);
}
