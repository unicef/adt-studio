import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import { defineProject } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))
const migrations = await readD1Migrations(path.join(root, "migrations"))

/** Route and storage tests run against local workerd, D1 and R2. */
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
