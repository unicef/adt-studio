import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import { defineProject } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))
const migrations = await readD1Migrations(path.join(root, "migrations"))

/**
 * The worker's integration project: real workerd, real D1, real R2 via miniflare.
 * The route-shape suite (`src/app.test.ts`) stays on the plain node project in the root
 * config; only `*.integration.test.ts` runs here.
 */
export default defineProject({
  plugins: [
    cloudflareTest({
      main: path.join(root, "src/index.ts"),
      wrangler: { configPath: path.join(root, "wrangler.toml") },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    name: "publish-service-worker",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: [path.join(root, "test/apply-migrations.ts")],
  },
})
