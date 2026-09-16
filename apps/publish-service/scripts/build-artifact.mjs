/**
 * Build the deployable publish worker artifacts.
 *
 *   dist/worker.js                control plane: management API, rooms, D1 owner
 *   dist/metadata.json            binding + migration manifest the Studio provisioner uploads
 *                                 alongside the script (apps/api, milestone M1a)
 *   dist/book-host.js             one book's host: reader routes and that book's assets
 *   dist/book-host-metadata.json  its bindings — no MGMT_SECRET, and PUBLICATION_ROOM bound
 *                                 across scripts rather than declared, so book hosts add no
 *                                 Durable Object classes and carry no management secret
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

/** Same reason `compatibility_date` is read from wrangler.toml rather than retyped: the
 *  provisioner uploads whatever this file says, so anything declared in one place and not the
 *  other is a binding the deployed Worker silently does without. */
const durableObjectBindings = [...wranglerToml.matchAll(
  /\[\[durable_objects\.bindings\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nclass_name\s*=\s*"([^"]+)"/g,
)].map(([, name, className]) => ({ name, className }))

if (durableObjectBindings.length === 0) {
  throw new Error("Could not read [[durable_objects.bindings]] from wrangler.toml")
}

const migrationTag = wranglerToml.match(/\[\[migrations\]\]\s*\ntag\s*=\s*"([^"]+)"/)?.[1]
const newSqliteClasses = wranglerToml
  .match(/new_sqlite_classes\s*=\s*\[([^\]]*)\]/)?.[1]
  ?.match(/"([^"]+)"/g)
  ?.map((entry) => entry.slice(1, -1)) ?? []

if (!migrationTag || newSqliteClasses.length === 0) {
  throw new Error("Could not read [[migrations]] tag / new_sqlite_classes from wrangler.toml")
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

/**
 * How Cloudflare's asset layer must answer a request the Worker forwards to it.
 *
 * `html_handling` defaults to `auto-trailing-slash`, which answers a request for
 * `.../index.html` with a 307 to the directory form. The Worker forwards anything that is not a
 * 404, so that redirect reaches the browser with a `Location` pointing at the *internal* asset
 * path (`/uploads/<uploadId>/`) — a path no route serves, and a published book that answers its
 * own front page with `{"error":"not_found"}`.
 *
 * `none` is the only setting that makes the binding behave like the byte store the Worker
 * treats it as: the exact path, or a 404 the Worker can interpret itself.
 *
 * Declared here rather than at the deploy call site so the e2e harness can serve from the same
 * config the deploy uploads — the harness set it and the deploy did not, which is how the suite
 * stayed green while every real publish was broken.
 */
const assetConfig = { html_handling: "none", not_found_handling: "none" }

const metadata = {
  version: PUBLISH_WORKER_VERSION,
  main_module: "worker.js",
  compatibility_date: compatibilityDate,
  bindings: [
    {
      type: "d1",
      name: "DB",
      description: "Publications, immutable versions, and access-controlled snapshots",
    },
    { type: "assets", name: "ASSETS", description: "Versioned book snapshots" },
    ...durableObjectBindings.map(({ name, className }) => ({
      type: "durable_object_namespace",
      name,
      class_name: className,
      description: "Live presence and comment fan-out for one publication",
    })),
    {
      type: "secret_text",
      name: "MGMT_SECRET",
      description: "Shared secret for every management call; generated at provision time",
    },
  ],
  migrations: { new_tag: migrationTag, new_sqlite_classes: newSqliteClasses },
  d1_migrations: d1Migrations,
  assets: { config: assetConfig },
}

fs.writeFileSync(path.join(outDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`)

await build({
  entryPoints: [path.join(root, "src/book-host-index.ts")],
  outfile: path.join(outDir, "book-host.js"),
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

/**
 * One book's host. Three deliberate absences:
 *
 * - no *account* secret: MGMT_SECRET here is derived per book, because the worker decides
 *   isAuthor from it and a book host has no management route for it to unlock;
 * - no `migrations`, because it declares no Durable Object class — it binds the control
 *   plane's across scripts, and the Free plan caps classes and Workers at 100 each, so a class
 *   per book would exhaust both at the same book;
 * - no `d1_migrations`, because the control plane owns the database and applies them once.
 *
 * `script_name` on the room binding is filled in at deploy time, the same way the D1 uuid is.
 */
const bookHostMetadata = {
  version: PUBLISH_WORKER_VERSION,
  main_module: "book-host.js",
  compatibility_date: compatibilityDate,
  bindings: [
    { type: "d1", name: "DB", description: "Read-only view of the control plane\u2019s publications" },
    { type: "assets", name: "ASSETS", description: "This book\u2019s versioned snapshot" },
    ...durableObjectBindings.map(({ name, className }) => ({
      type: "durable_object_namespace",
      name,
      class_name: className,
      description: "Bound across scripts to the control plane; not declared here",
    })),
    {
      type: "secret_text",
      name: "MGMT_SECRET",
      description:
        "Per-book author secret, derived from the control plane's at deploy time. Only decides isAuthor; unlocks no management route here",
    },
  ],
  d1_migrations: [],
}

fs.writeFileSync(
  path.join(outDir, "book-host-metadata.json"),
  `${JSON.stringify(bookHostMetadata, null, 2)}\n`,
)

const bytes = fs.statSync(path.join(outDir, "worker.js")).size
const bookHostBytes = fs.statSync(path.join(outDir, "book-host.js")).size
console.log(
  `\u2713 Built adt-publish v${PUBLISH_WORKER_VERSION} \u2192 dist/worker.js (${(bytes / 1024).toFixed(1)} kB) + dist/metadata.json`,
)
console.log(
  `\u2713 Built book host v${PUBLISH_WORKER_VERSION} \u2192 dist/book-host.js (${(bookHostBytes / 1024).toFixed(1)} kB) + dist/book-host-metadata.json`,
)
