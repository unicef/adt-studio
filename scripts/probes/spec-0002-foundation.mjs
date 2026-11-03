/**
 * The former failing preparation probe is superseded by the complete regression:
 * real HTTP save/admission/preparation/workers, SQLite history, preview and export.
 * The provider boundary is stubbed; all books are disposable. Build first.
 * Run: node scripts/probes/spec-0002-foundation.mjs
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const result = spawnSync("pnpm", ["exec", "vitest", "run", "apps/api/src/routes/manual-edit-survival.test.ts"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)),
  stdio: "inherit",
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
