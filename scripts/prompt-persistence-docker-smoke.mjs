/** Disposable real-container SPEC-0011 persistence check. Build --target app first. */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"

const image = process.argv[2]
if (!image) throw new Error("Supply a locally built app-target Docker image")
const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec0011-docker-"))
const repository = path.resolve(import.meta.dirname, "..")
const container = `spec0011-${randomUUID()}`
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const resourcesHash = () => createHash("sha256").update(fs.readdirSync(path.join(repository, "prompts"), { recursive: true }).map(String).sort()
  .filter((name) => fs.statSync(path.join(repository, "prompts", name)).isFile())
  .map((name) => name + "\0" + fs.readFileSync(path.join(repository, "prompts", name))).join("\0")).digest("hex")
let base
const request = async (url, method = "GET", body) => {
  const response = await fetch(base + url, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
}
async function start(extra = []) {
  docker("run", "-d", "--name", container, "-p", "127.0.0.1::80", "-v", `${root}:/app/books`,
    "-v", `${repository}/prompts:/app/prompts:ro`, "-v", `${repository}/templates:/app/templates:ro`, ...extra, image)
  base = `http://${docker("port", container, "80/tcp")}/api`
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await request("/prompts/metadata_extraction"); return } catch { await new Promise((resolve) => setTimeout(resolve, 500)) }
  }
  throw new Error("Container API did not become ready")
}
try {
  const before = resourcesHash()
  await start()
  assert.throws(() => docker("exec", container, "touch", "/app/prompts/.spec0011-write-test"), /Read-only file system/)
  const original = await request("/prompts/metadata_extraction")
  const global = await request("/prompts/metadata_extraction", "PUT", { revision: original.revision, content: "Docker global persistence" })
  const book = await request("/books/smoke/prompts/metadata_extraction")
  const own = await request("/books/smoke/prompts/metadata_extraction", "PUT", { revision: book.revision, content: "Docker book persistence" })
  assert.equal(global.source, "global"); assert.equal(own.source, "book")
  assert.ok(fs.existsSync(path.join(root, ".adt-studio/prompt-overrides/.versions/metadata_extraction", global.version)))
  const templates = await request("/templates")
  const name = templates.templates[0]
  assert.equal((await request(`/templates/${name}`)).content, fs.readFileSync(path.join(repository, "templates", `${name}.liquid`), "utf8"))
  docker("rm", "-f", container)
  await start()
  assert.equal((await request("/prompts/metadata_extraction")).content, global.content)
  assert.equal((await request("/books/smoke/prompts/metadata_extraction")).content, own.content)
  const reset = await request("/prompts/metadata_extraction", "DELETE", { revision: global.revision })
  assert.equal(reset.content, original.content)
  const restored = await request(`/prompts/metadata_extraction/versions/${global.version}/current`, "PUT", { revision: reset.revision })
  assert.equal(restored.content, global.content)
  assert.notEqual(restored.revision, global.revision)
  // The supported explicit override root also persists independently of resources.
  docker("rm", "-f", container)
  await start(["-e", "PROMPT_OVERRIDES_DIR=/app/custom-overrides", "-v", `${root}/.adt-studio/prompt-overrides:/app/custom-overrides`])
  assert.equal((await request("/prompts/metadata_extraction")).content, global.content)
  assert.equal((await request(`/templates/${name}`)).content, fs.readFileSync(path.join(repository, "templates", `${name}.liquid`), "utf8"))
  assert.equal(resourcesHash(), before)
  console.log("PASS: Docker read-only resources; global/book Save, container recreation, retained Reset/Restore history, custom persistent root and unchanged templates")
} finally {
  try { docker("rm", "-f", container) } catch { /* no container after failed startup */ }
  fs.rmSync(root, { recursive: true, force: true })
}
