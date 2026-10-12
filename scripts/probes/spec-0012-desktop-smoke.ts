import { app } from "electron"
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { once } from "node:events"
import { startApiServer, stopApiServer } from "../../apps/desktop/src/main/api-server/index"
import { exercisePackagedRecovery } from "./spec-0013-packaged-common.mjs"
import { copyBooks, exercisePackagedSynchronization, hashes } from "./spec-0012-packaged-common.mjs"

// Bundle with esbuild --platform=node --external:electron --format=cjs, then
// run in the installed Electron host with unpacked Resources, source books,
// and a NEW disposable user-data directory. This is not notarized-app testing.
const [resources, sourceBooks, userData] = process.argv.slice(2)
if (!resources || !sourceBooks || !userData) throw new Error("Supply Resources, representative books, and a new disposable user-data directory")
assert.ok(!fs.existsSync(userData), "Never use an existing user profile")
fs.mkdirSync(userData, { recursive: true })
copyBooks(sourceBooks, path.join(userData, "books"))
app.setPath("userData", userData)
Object.defineProperty(app, "isPackaged", { value: true })
Object.defineProperty(process, "resourcesPath", { value: resources })
function resourceHashes() {
  // Hash the archive itself; Electron otherwise treats app.asar as a directory.
  const previous = process.noAsar
  process.noAsar = true
  try { return hashes(resources) } finally { process.noAsar = previous }
}

app.whenReady().then(async () => {
  try {
    const resourcesBefore = resourceHashes()
    assert.throws(() => fs.writeFileSync(path.join(resources, ".spec0012-write-test"), "must fail"), /EACCES|EPERM|EROFS/, "Make the disposable packaged resources read-only first")
    assert.match(fs.readFileSync(path.join(resources, "app.asar", "out/renderer/index.html"), "utf8"), /<div id="root"><\/div>/)
    let server = await startApiServer()
    const stop = async () => { const exited = once(server.apiProcess, "exit"); stopApiServer(); await exited }
    const request = async (url: string, method = "GET", body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${server.apiPort}/api${url}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) })
      assert.equal(response.status, 200, await response.clone().text())
      return response.json()
    }
    const result = await (process.argv.includes("--recovery") ? exercisePackagedRecovery : exercisePackagedSynchronization)({ request, books: path.join(userData, "books"), restart: async () => { await stop(); server = await startApiServer() } })
    await stop()
    assert.deepEqual(resourceHashes(), resourcesBefore)
    const report = { platform: process.platform, arch: process.arch, electron: process.versions.electron, resources, userData, resourceFiles: Object.keys(resourcesBefore).length, ...result }
    fs.writeFileSync(path.join(userData, "report.json"), JSON.stringify(report, null, 2))
    console.log("PASS: Electron host with unpacked packaged API, read-only resources and utility-process restart", JSON.stringify(report))
    app.exit(0)
  } catch (error) { console.error(error); stopApiServer(); app.exit(1) }
})
