/**
 * Build the deployable adt-publish worker artifact.
 *
 *   dist/worker.js      single-file ESM module for the Cloudflare Workers runtime
 *   dist/metadata.json  binding + migration manifest the Studio provisioner uploads
 *                       alongside the script (apps/api, milestone M1a)
 *
 * There is no wrangler in this path: the provisioner talks to the Cloudflare REST
 * API directly, so every deployment input the API needs must be expressed in
 * metadata.json. `compatibility_date` and the D1 migration list are read back out
 * of wrangler.toml / migrations/ so local dev and the uploaded artifact cannot drift.
 */
import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PUBLISH_WORKER_VERSION } from "@adt/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const outDir = path.join(root, "dist")
const migrationsDir = path.join(root, "migrations")

const wranglerToml = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8")

const compatibilityDate = wranglerToml.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1]
if (!compatibilityDate) {
  throw new Error("Could not read compatibility_date from wrangler.toml")
}

const migrationTag = wranglerToml.match(/^tag\s*=\s*"([^"]+)"/m)?.[1]
if (!migrationTag) {
  throw new Error("Could not read the durable object migration tag from wrangler.toml")
}

const d1Migrations = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()

if (d1Migrations.length === 0) {
  throw new Error(`No D1 migrations found in ${migrationsDir}`)
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  outfile: path.join(outDir, "worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["workerd", "worker", "browser", "import", "module"],
  mainFields: ["module", "main"],
  external: [],
  minify: true,
  sourcemap: false,
  logLevel: "info",
})

const metadata = {
  version: PUBLISH_WORKER_VERSION,
  main_module: "worker.js",
  compatibility_date: compatibilityDate,
  bindings: [
    {
      type: "d1",
      name: "DB",
      description: "Publications, versions, commenter sessions and comments",
    },
    {
      type: "r2_bucket",
      name: "SNAPSHOTS",
      description: "Frozen book snapshots, keyed <token>/v<N>/<path>",
    },
    {
      type: "durable_object_namespace",
      name: "PUBLICATION_ROOM",
      class_name: "PublicationRoom",
      description: "One realtime room per publication (websocket presence and pin events)",
    },
    {
      type: "secret_text",
      name: "MGMT_SECRET",
      description: "Shared secret for every management call; generated at provision time",
    },
  ],
  migrations: {
    new_tag: migrationTag,
    new_sqlite_classes: ["PublicationRoom"],
  },
  d1_migrations: d1Migrations,
}

fs.writeFileSync(path.join(outDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`)

const bytes = fs.statSync(path.join(outDir, "worker.js")).size
console.log(
  `✓ Built adt-publish v${PUBLISH_WORKER_VERSION} → dist/worker.js (${(bytes / 1024).toFixed(1)} kB) + dist/metadata.json`,
)
