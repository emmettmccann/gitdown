import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * One build for both halves of the site.
 *
 * The Cloudflare plugin runs the Worker inside workerd during `vite dev`, so
 * the API, the D1 binding and the cron handler behave locally the way they will
 * in production — and the React app gets hot reload on top of them instead of
 * needing a second process to proxy to.
 *
 * `assets.directory` is deliberately absent from wrangler.jsonc: the plugin
 * points it at this build's client output, which is what makes it impossible to
 * deploy a bundle from one generation beside pages from another.
 */
export default defineConfig({
  plugins: [react(), cloudflare()],
});
