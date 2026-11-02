/** Real-process reset boundary probe. Keeps crash evidence in the supplied output
 * directory, including anonymous SQLite mutexes. Never removes a lock by age.
 * Build first, then: node scripts/probes/spec-0003-reset-recovery.mjs /tmp/evidence
 */
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createBookStorage, withBookWriter, openBookDb } from "../../packages/storage/dist/index.js"
import { resetSectioningStoryboard } from "../../packages/pipeline/dist/index.js"

const script = fileURLToPath(import.meta.url)
const childMode = process.argv[2] === "--child"
const evidencePath = process.argv[childMode ? 3 : 2]
assert.ok(evidencePath, "Supply a fresh evidence directory")
const root = path.resolve(evidencePath)
const boundary = process.argv[4]
const label = boundary ?? "rollback"
const bookDir = path.join(root, label)
const options = {
  fromStage: "sectioning", toStage: "sectioning", replaceManual: true,
  protectedReplacements: ["p1", "p2"].map((itemId) => ({ node: "page-sectioning", itemId, version: 1, renderingVersion: 1, renderTreeVersion: 1 })),
}
if (childMode) {
  await withBookWriter(bookDir, async () => {
    const storage = createBookStorage(label, root)
    if (boundary === "inside") {
      const write = storage.putNodeData
      storage.putNodeData = (...args) => {
        const result = write(...args)
        if (args[0] === "web-rendering") process.kill(process.pid, "SIGKILL")
        return result
      }
    }
    resetSectioningStoryboard(storage, options)
    storage.close()
    process.kill(process.pid, "SIGKILL")
  })
} else {
  assert.ok(process.argv[2], "Supply a fresh evidence directory")
  fs.mkdirSync(root, { recursive: true })
  const seed = (label) => {
    const dir = path.join(root, label)
    assert.equal(fs.existsSync(dir), false, "Never overwrite previous crash evidence")
    const storage = createBookStorage(label, root)
    for (const id of ["p1", "p2"]) {
      storage.putNodeData("page-sectioning", id, { source: "manual", reasoning: "retained", sections: [] })
      storage.putNodeData("web-rendering", id, { sections: [{ sectionId: `${id}_sec001`, sectionIndex: 0, sectionType: "text", reasoning: "retained", html: "<p>Manual HTML</p>" }] })
      storage.putNodeData("fixed-layout-sectioning", id, { reasoning: "retained", sections: [] })
    }
    storage.markStepCompleted("web-rendering")
    storage.close()
    fs.writeFileSync(path.join(dir, "source.pdf"), "Original PDF bytes")
    fs.writeFileSync(path.join(dir, "images", "retained.png"), "Referenced asset bytes")
  }
  const snapshot = (label) => {
    const storage = createBookStorage(label, root)
    try { return ["p1", "p2"].map((id) => ["page-sectioning", "web-rendering", "fixed-layout-sectioning"].map((node) => storage.getAllNodeVersions(node, id))) }
    finally { storage.close() }
  }
  seed("rollback")
  const before = snapshot("rollback")
  const db = openBookDb(path.join(root, "rollback", "rollback.db"))
  db.exec("CREATE TRIGGER reject_reset BEFORE INSERT ON node_data WHEN NEW.node = 'web-rendering' AND NEW.item_id = 'p2' BEGIN SELECT RAISE(ABORT, 'injected reset failure'); END")
  db.close()
  withBookWriter(path.join(root, "rollback"), () => {
    const storage = createBookStorage("rollback", root)
    try { assert.throws(() => resetSectioningStoryboard(storage, options), /injected reset failure/) }
    finally { storage.close() }
  })
  assert.deepEqual(snapshot("rollback"), before)
  console.log("Injected failure midway through reset: all page histories unchanged")
  for (const point of ["inside", "after"]) {
    seed(point)
    const old = snapshot(point)
    const killed = spawnSync(process.execPath, [script, "--child", root, point], { encoding: "utf8", timeout: 15000 })
    assert.equal(killed.signal, "SIGKILL", killed.stderr)
    if (point === "inside") {
      assert.throws(() => withBookWriter(path.join(root, point), () => snapshot(point)), (error) => error?.code === "BOOK_BUSY" && /database lock/.test(error.message))
      console.log("Crash inside reset transaction: fails closed; anonymous mutex and raw evidence retained")
    } else {
      withBookWriter(path.join(root, point), () => {
        const storage = createBookStorage(point, root)
        try {
          for (const [index, id] of ["p1", "p2"].entries()) {
            assert.deepEqual(storage.getAllNodeVersions("page-sectioning", id), old[index][0])
            for (const node of ["web-rendering", "fixed-layout-sectioning"]) {
              assert.equal(storage.getSelectedNodeVersion(node, id), 2)
              assert.equal(storage.getLatestNodeData(node, id).data, null)
              assert.equal(storage.getAllNodeVersions(node, id).length, 2)
            }
          }
          storage.putNodeData("page-sectioning", "p1", { source: "manual", reasoning: "editable after restart", sections: [] })
        } finally { storage.close() }
      })
      console.log("Crash after reset commit: restart retains inactive output, history and editable semantic tree")
    }
    const dir = path.join(root, point)
    assert.equal(fs.readFileSync(path.join(dir, "source.pdf"), "utf8"), "Original PDF bytes")
    assert.equal(fs.readFileSync(path.join(dir, "images", "retained.png"), "utf8"), "Referenced asset bytes")
  }
  console.log(`Recovery evidence preserved at ${root}`)
}
