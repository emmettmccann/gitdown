import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Migrations are read here and handed to the worker as a binding, so tests run
// against the same SQL that ships — not a hand-maintained schema copy that can
// silently drift from migrations/.
const migrations = await readD1Migrations("./migrations");

// Tests run inside workerd rather than Node, so `fetch`, Web Crypto and the D1
// binding behave exactly as they will in production.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
