import { app } from "electron"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { once } from "node:events"
import { startApiServer, stopApiServer } from "../apps/desktop/src/main/api-server/index"

// Run with Electron against built resources and a disposable, existing user-data directory.
// The harness selects packaged adapter behavior without using a real user's profile.
const resources = process.argv[2]
const userData = process.argv[3]
if (!resources || !userData || !fs.existsSync(userData)) throw new Error("Supply packaged Resources and an existing disposable user-data directory")
app.setPath("userData", userData)
Object.defineProperty(app, "isPackaged", { value: true })
Object.defineProperty(process, "resourcesPath", { value: resources })
function snapshot(dir: string): string {
  const entries = fs.readdirSync(dir, { recursive: true }).map(String).sort().filter((name) => fs.statSync(path.join(dir, name)).isFile())
  return createHash("sha256").update(entries.map((name) => name + "\0" + fs.readFileSync(path.join(dir, name), "utf8")).join("\0")).digest("hex")
}
app.whenReady().then(async () => {
try {
  const before = snapshot(path.join(resources, "prompts"))
  let server = await startApiServer()
  const request = async (url: string, options?: RequestInit) => {
    const response = await fetch(`http://127.0.0.1:${server.apiPort}/api${url}`, options)
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  const initial = await request("/prompts/metadata_extraction")
  const content = initial.content + "\nDesktop persistence smoke\n"
  const saved = await request("/prompts/metadata_extraction", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: initial.revision, content }) })
  assert.equal(saved.source, "global")
  assert.ok(fs.existsSync(path.join(userData, "prompt-overrides", ".versions", "metadata_extraction", saved.version)))
  const exit = once(server.apiProcess, "exit"); stopApiServer(); await exit
  server = await startApiServer()
  assert.equal((await request("/prompts/metadata_extraction")).content, content)
  const book = await request("/books/desktop-smoke/prompts/metadata_extraction")
  const own = await request("/books/desktop-smoke/prompts/metadata_extraction", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: book.revision, content: "book desktop smoke" }) })
  assert.equal(own.source, "book")
  const templates = await request("/templates")
  assert.ok(templates.templates.length > 0)
  const layout = await request(`/templates/${templates.templates[0]}`)
  assert.equal(layout.content, fs.readFileSync(path.join(resources, "templates", templates.templates[0]+".liquid"), "utf8"))
  assert.equal(snapshot(path.join(resources, "prompts")), before)
  const secondExit = once(server.apiProcess, "exit"); stopApiServer(); await secondExit
  console.log("PASS: Electron host paths + packaged API; global and book saves, process restart, read-only resource hash, templates")
  app.exit(0)
} catch (error) { console.error(error); stopApiServer(); app.exit(1) }

})
