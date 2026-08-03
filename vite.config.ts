import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite builds the front end; wrangler bundles the Worker.
 *
 * The Cloudflare plugin is loaded for `serve` only, and that split is
 * deliberate. In dev it is the whole point: it runs the Worker inside workerd
 * with the D1 binding and the cron handler, so the API behaves locally the way
 * it will in production and the React app gets hot reload on top of it, from
 * one process.
 *
 * At build time it would take over the Worker as well, and emit its own
 * `wrangler.json` under `dist/` for wrangler to be redirected to. That redirect
 * is written by the build — so a `wrangler deploy` on a fresh checkout resolves
 * its config *before* the file exists, never sees it, and dies on the missing
 * `assets.directory`. Which is exactly what Cloudflare's build pipeline does:
 * it runs `wrangler versions upload` and nothing else.
 *
 * So the build stays plain. `vite build` emits the client into `dist/client`
 * and stops there; wrangler reads the checked-in `wrangler.jsonc`, runs this
 * build itself via `build.command`, and bundles `src/index.ts` the way it
 * always has. One path, whoever starts it.
 */
export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === "serve" ? [cloudflare()] : [])],
  build: {
    // What `assets.directory` in wrangler.jsonc points at.
    outDir: "dist/client",
    emptyOutDir: true,
  },
}));
