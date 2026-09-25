/**
 * End-to-end check of a published book, against the artifacts `build:artifact` really emits.
 *
 * Everything else in the suite exercises the pieces: the API tests drive a fake Cloudflare, and
 * the workerd integration tests drive `createApp` directly with a stubbed assets fetcher. Neither
 * puts the real `worker.js` and `book-host.js` in front of a real Static Assets router and asks
 * whether a book actually reaches a reader — or, more to the point, whether it reaches one who
 * should not have it.
 *
 * So this publishes a book through the control plane by the Static Assets path (no R2 anywhere),
 * writes the assets where Cloudflare would have put them, and serves them from a book host with
 * `run_worker_first` in front, checking:
 *
 *   - no code, no bytes — including a direct request to the raw asset path, which is the
 *     bypass a path-list `run_worker_first` would have left open;
 *   - the right code serves the real bytes;
 *   - the author's derived secret opens the book, and the account's own secret does not;
 *   - a revoked book is 410 for readers and still readable by its author;
 *   - reinstating serves the same assets with no re-upload;
 *   - a second book publishes without disturbing the first.
 *
 * Run with `pnpm --filter @adt/publish-service e2e` after a build. Kept out of `vitest` on
 * purpose: it boots workerd four times and persists D1 between phases, which is too slow and
 * too stateful to belong in the default run.
 */
import { Miniflare } from "miniflare"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dist = path.join(root, "dist")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publish-e2e-"))
const persist = path.join(work, "d1")
const assetsDir = path.join(work, "assets")

const SECRET = "control-plane-secret"
const TOKEN = "e2eTokenAbcdefghijklmnopqrstuv12"
const CODE = "ABC234"
const PAGE = "<!doctype html><title>Raven</title><h1>page one</h1>"
const IMG = "fake-png-bytes"

const authorSecret = crypto.createHmac("sha256", SECRET).update(TOKEN).digest("hex")
const assetHash = (p, body) =>
  crypto.createHash("sha256")
    .update(Buffer.from(body).toString("base64") + (path.extname(p).slice(1) || ""))
    .digest("hex").slice(0, 32)

const migrations = fs.readdirSync(path.join(root, "migrations"))
  .filter((f) => f.endsWith(".sql")).sort()
  .map((f) => fs.readFileSync(path.join(root, "migrations", f), "utf8"))

const results = []
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`)
}

fs.rmSync(persist, { recursive: true, force: true })
fs.rmSync(assetsDir, { recursive: true, force: true })

// ── Phase 1: publish through the real control plane, static-asset path, no R2 ──
const openControl = () => new Miniflare({
  modules: true,
  scriptPath: path.join(dist, "worker.js"),
  compatibilityDate: "2026-07-01",
  d1Databases: { DB: "publish-db" },
  d1Persist: persist,
  r2Buckets: { SNAPSHOTS: "snapshots" },
  bindings: { MGMT_SECRET: SECRET },
  durableObjects: { PUBLICATION_ROOM: "PublicationRoom" },
})

let control = openControl()
const db = await control.getD1Database("DB")
for (const sql of migrations) {
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run()
  }
}

/** `narration.mp3` and `narration-easy-read.mp3` are byte-identical, as a real book's paragraph
 *  audio and its easy-read version routinely are. They share one content address, so the
 *  manifest names two paths and the upload carries the bytes once. */
const files = [
  { path: "index.html", body: PAGE },
  { path: "images/cover.png", body: IMG },
  { path: "audio/narration.mp3", body: "identical narration bytes" },
  { path: "audio/narration-easy-read.mp3", body: "identical narration bytes" },
].map((f) => ({
  path: f.path,
  body: f.body,
  bytes: Buffer.byteLength(f.body),
  sha256: crypto.createHash("sha256").update(f.body).digest("hex"),
  asset_hash: assetHash(f.path, f.body),
}))

const mgmt = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }
const BASE = "https://adt-publish.teacher.workers.dev"

const started = await control.dispatchFetch(`${BASE}/api/publication-uploads`, {
  method: "POST", headers: mgmt,
  body: JSON.stringify({
    kind: "create", token: TOKEN, title: "Raven", book_label: "raven", access_code: CODE,
    page_manifest: [{ section_id: "page-1", href: "index.html", page_number: 1 }],
    files: files.map(({ path, bytes, sha256, asset_hash }) => ({ path, bytes, sha256, asset_hash })),
  }),
})
const startBody = await started.json()
check("control plane opens a static-asset upload", started.status < 300 && Boolean(startBody.upload_id),
  `status ${started.status} upload_id=${startBody.upload_id}`)
const uploadId = startBody.upload_id

const completed = await control.dispatchFetch(
  `${BASE}/api/publication-uploads/${uploadId}/complete-static-assets`, { method: "POST", headers: mgmt })
check("accepts the collection without ever seeing the bytes", completed.status === 200,
  `${completed.status} ${(await completed.text()).slice(0, 60)}`)

const committed = await control.dispatchFetch(
  `${BASE}/api/publication-uploads/${uploadId}/commit`, { method: "POST", headers: mgmt })
const commitBody = await committed.text()
check("commits the version", committed.status < 300, `status ${committed.status} ${commitBody.slice(0, 80)}`)

const addresses = new Set(files.map((f) => f.asset_hash))
check("repeated content shares one address rather than failing the publish",
  addresses.size === files.length - 1,
  `${files.length} files, ${addresses.size} addresses`)
await control.dispose()

// The assets a publish would have sent to Cloudflare, at the paths it would have used.
for (const f of files) {
  const full = path.join(assetsDir, "uploads", uploadId, f.path)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, f.body)
}
console.log(`\n  assets written under /uploads/${uploadId}/\n`)

// ── Phase 2: serve it from the real book host, gate in front ──

/**
 * The asset config the deploy really uploads, read from the artifact rather than retyped.
 *
 * This harness used to hardcode `html_handling: "none"` while `deployBookHost` sent no
 * `html_handling` at all, so Cloudflare applied its `auto-trailing-slash` default and answered
 * every book's `index.html` with a 307 to the internal `/uploads/<uploadId>/` path. The suite
 * was green and every real publish opened as `{"error":"not_found"}`. Reading it from the
 * artifact is what stops that from being possible again.
 */
const assetConfig = JSON.parse(
  fs.readFileSync(path.join(dist, "book-host-metadata.json"), "utf8"),
).assets?.config
if (assetConfig?.html_handling !== "none") {
  throw new Error(
    `book-host-metadata.json must declare assets.config.html_handling "none" — got ${JSON.stringify(assetConfig)}`,
  )
}
const openBookWith = (routerConfig) => new Miniflare({
  modules: true,
  scriptPath: path.join(dist, "book-host.js"),
  compatibilityDate: "2026-07-01",
  d1Databases: { DB: "publish-db" },
  d1Persist: persist,
  bindings: { MGMT_SECRET: authorSecret },
  assets: {
    directory: assetsDir, binding: "ASSETS",
    routerConfig,
    assetConfig,
  },
})

/** What deployBookHost sends: `run_worker_first: true`, never a path list. */
const openBook = () =>
  openBookWith({ has_user_worker: true, invoke_user_worker_ahead_of_assets: true })

let book = openBook()
const HOST = "https://adt-book-0000.teacher.workers.dev"
const get = (p, init) => book.dispatchFetch(`${HOST}${p}`, init)

const bare = await get(`/p/${TOKEN}/index.html`)
const bareBody = await bare.text()
check("a reader with no code gets no bytes", !bareBody.includes("page one"),
  `status ${bare.status}`)

const bareImg = await get(`/p/${TOKEN}/images/cover.png`)
check("nor any image", !(await bareImg.text()).includes(IMG), `status ${bareImg.status}`)

const raw = await get(`/uploads/${uploadId}/index.html`)
check("the raw asset path is not reachable around the gate",
  !(await raw.text()).includes("page one"), `status ${raw.status}`)

const door = await get(`/p/${TOKEN}/access`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code: CODE, name: "Reviewer" }),
})
const cookie = door.headers.get("set-cookie")?.split(";")[0] ?? ""
check("the door opens for the right code", door.status < 400 && cookie !== "", `status ${door.status}`)

const asReader = await get(`/p/${TOKEN}/index.html`, { headers: { Cookie: cookie } })
const readerBody = await asReader.text()
check("an authorised reader gets the real bytes", readerBody.includes("page one"),
  `status ${asReader.status}`)

for (const dup of ["audio/narration.mp3", "audio/narration-easy-read.mp3"]) {
  const res = await get(`/p/${TOKEN}/${dup}`, { headers: { Cookie: cookie } })
  check(`both paths of repeated content serve (${dup})`,
    (await res.text()).includes("identical narration bytes"), `status ${res.status}`)
}

const asAuthor = await get(`/p/${TOKEN}/index.html`, {
  headers: { Authorization: `Bearer ${authorSecret}` },
})
check("the author gets in with the derived secret", (await asAuthor.text()).includes("page one"),
  `status ${asAuthor.status}`)

const wrongSecret = await get(`/p/${TOKEN}/index.html`, {
  headers: { Authorization: `Bearer ${SECRET}` },
})
check("the account's own secret is not an author key here",
  !(await wrongSecret.text()).includes("page one"), `status ${wrongSecret.status}`)

for (const [method, route] of [["GET", "/api/publications"], ["GET", `/api/publications/${TOKEN}`]]) {
  const res = await book.dispatchFetch(`${HOST}${route}`, {
    method, headers: { Authorization: `Bearer ${authorSecret}` },
  })
  check(`no management API on a book host (${method} ${route})`, res.status === 404, `status ${res.status}`)
}

// ── Phase 3: revoke, then reinstate, through the real control plane ──
await book.dispose()
control = openControl()
const revoked = await control.dispatchFetch(
  `${BASE}/api/publications/${TOKEN}/revoke`, { method: "POST", headers: mgmt })
check("control plane revokes the link", revoked.status < 300, `status ${revoked.status}`)
await control.dispose()

book = openBook()
const afterRevoke = await get(`/p/${TOKEN}/index.html`, { headers: { Cookie: cookie } })
const afterRevokeBody = await afterRevoke.text()
check("a revoked book serves nothing, even to a reader who already got in",
  !afterRevokeBody.includes("page one"), `status ${afterRevoke.status}`)
check("and says it is gone rather than missing", afterRevoke.status === 410,
  `status ${afterRevoke.status}`)

/** The reason a book host needs a secret at all: the author has to be able to look at a book
 *  they have stopped sharing. */
const authorAfterRevoke = await get(`/p/${TOKEN}/index.html`, {
  headers: { Authorization: `Bearer ${authorSecret}` },
})
check("but its author can still read it", (await authorAfterRevoke.text()).includes("page one"),
  `status ${authorAfterRevoke.status}`)
await book.dispose()

control = openControl()
const reinstated = await control.dispatchFetch(
  `${BASE}/api/publications/${TOKEN}/reinstate`, { method: "POST", headers: mgmt })
check("control plane reinstates it", reinstated.status < 300, `status ${reinstated.status}`)
await control.dispose()

book = openBook()
const afterReinstate = await get(`/p/${TOKEN}/index.html`, { headers: { Cookie: cookie } })
check("and the same assets serve again, with no re-upload",
  (await afterReinstate.text()).includes("page one"), `status ${afterReinstate.status}`)
await book.dispose()

// ── Phase 4: a second book must not disturb the first ──
const TOKEN_B = "e2eSecondBookTokenAbcdefghijkl12"
control = openControl()
const startedB = await control.dispatchFetch(`${BASE}/api/publication-uploads`, {
  method: "POST", headers: mgmt,
  body: JSON.stringify({
    kind: "create", token: TOKEN_B, title: "Owl", book_label: "owl",
    page_manifest: [{ section_id: "page-1", href: "index.html", page_number: 1 }],
    files: [{
      path: "index.html", bytes: 5, sha256: crypto.createHash("sha256").update("owl!!").digest("hex"),
      asset_hash: assetHash("index.html", "owl!!"),
    }],
  }),
})
const bodyB = await startedB.json()
await control.dispatchFetch(
  `${BASE}/api/publication-uploads/${bodyB.upload_id}/complete-static-assets`,
  { method: "POST", headers: mgmt })
const committedB = await control.dispatchFetch(
  `${BASE}/api/publication-uploads/${bodyB.upload_id}/commit`, { method: "POST", headers: mgmt })
check("a second book publishes alongside the first", committedB.status < 300,
  `status ${committedB.status}`)
await control.dispose()

/** Book A's host is untouched by B's publish — its Worker was never redeployed, and the
 *  assets it serves are its own. This is what the shared collection could not promise. */
book = openBook()
const stillA = await get(`/p/${TOKEN}/index.html`, { headers: { Cookie: cookie } })
check("and the first book still serves its own bytes",
  (await stillA.text()).includes("page one"), `status ${stillA.status}`)
const bLeaks = await get(`/p/${TOKEN_B}/index.html`)
check("while book A's host serves nothing for book B",
  !(await bLeaks.text()).includes("owl!!"), `status ${bLeaks.status}`)
await book.dispose()

// ── Phase 5: show the gate checks above are not passing by accident ──
/**
 * Every "no bytes" check would also pass if the assets were simply missing. This runs the same
 * host with the routing this design replaced — `run_worker_first` as a list of reader paths —
 * and the raw asset path serves the book to nobody in particular. That is the leak, and seeing
 * it here is what makes the 404 in phase 2 mean something.
 */
const leaky = openBookWith({
  has_user_worker: true,
  static_routing: { user_worker: ["/api/*", "/p/*", "/health"] },
})
const leaked = await leaky.dispatchFetch(`${HOST}/uploads/${uploadId}/index.html`)
const leakedBody = await leaked.text()
check("the path-list routing this replaced would serve the book unauthenticated",
  leaked.status === 200 && leakedBody.includes("page one"),
  `status ${leaked.status} — so the 404 above is the gate, not a missing file`)
await leaky.dispose()

fs.rmSync(work, { recursive: true, force: true })

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
