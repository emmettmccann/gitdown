import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// The pool gives each test file its own isolated storage, so migrating once per
// file leaves every file with a clean, fully-migrated database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
