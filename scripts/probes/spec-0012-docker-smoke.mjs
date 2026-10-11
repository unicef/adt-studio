/** Run against the freshly built --target app image; only copies of books are edited. */
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { copyBooks, exercisePackagedSynchronization, hashes } from "./spec-0012-packaged-common.mjs"

const [image, sourceBooks, out] = process.argv.slice(2)
if (!image || !sourceBooks || !out) throw new Error("Supply image, representative books, and a NEW evidence directory")
assert.ok(!fs.existsSync(out), "Evidence destination must be new")
fs.mkdirSync(out, { recursive: true })
const books = path.resolve(out, "books")
copyBooks(sourceBooks, books)
const repository = path.resolve(import.meta.dirname, "../..")
const container = `spec0012-${randomUUID()}`
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
let base
async function request(url, method = "GET", body) {
  const response = await fetch(base + "/api" + url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) })
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
}
async function start() {
  docker("run", "-d", "--name", container, "-p", "127.0.0.1::80", "-v", `${books}:/app/books`,
    "-v", `${repository}/prompts:/app/prompts:ro`, "-v", `${repository}/templates:/app/templates:ro`, image)
  base = `http://${docker("port", container, "80/tcp")}`
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await request("/books/momograde1/pages/pg005"); return } catch { await new Promise((resolve) => setTimeout(resolve, 500)) }
  }
  throw new Error("Container API did not become ready")
}
try {
  const before = { prompts: hashes(path.join(repository, "prompts")), templates: hashes(path.join(repository, "templates")) }
  await start()
  assert.throws(() => docker("exec", container, "touch", "/app/prompts/.spec0012-write-test"), /Read-only file system/)
  const spa = await fetch(base)
  assert.equal(spa.status, 200)
  const html = await spa.text()
  assert.match(html, /<div id="root"><\/div>/)
  const script = html.match(/<script[^>]+src="([^"]+)"/)
  assert.ok(script, "Packaged Studio script is referenced")
  const javascript = await fetch(new URL(script[1], base))
  assert.equal(javascript.status, 200)
  assert.ok((await javascript.text()).length > 1000)
  const result = await exercisePackagedSynchronization({ request, books, restart: async () => { docker("rm", "-f", container); await start() } })
  assert.deepEqual({ prompts: hashes(path.join(repository, "prompts")), templates: hashes(path.join(repository, "templates")) }, before)
  const report = { image, imageId: docker("image", "inspect", image, "--format", "{{.Id}}"), spaScript: script[1], books, ...result }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2))
  console.log("PASS: Docker app image, packaged SPA, read-only resources and container recreation", JSON.stringify(report))
} finally {
  try { fs.writeFileSync(path.join(out, "container.log"), docker("logs", container)) } catch { /* startup failed */ }
  try { docker("rm", "-f", container) } catch { /* container already removed */ }
}
