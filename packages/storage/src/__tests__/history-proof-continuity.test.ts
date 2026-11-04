import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { openBookDb } from "../db.js"
import { inspectHistoryRecovery } from "../history-recovery.js"

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))
function book(legacy = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-proof-")); roots.push(root)
  const storage = createBookStorage("book", root)
  if (!legacy) storage.putNodeData("page-sectioning", "p1", { sectionId: "p1_sec078", source: "manual" })
  storage.close()
  const { dbPath } = resolveBookPaths("book", root)
  const sql = (fn: (db: ReturnType<typeof openBookDb>) => void) => { const db = openBookDb(dbPath); try { fn(db) } finally { db.close() } }
  if (legacy) sql(db => db.run("INSERT INTO node_data VALUES ('page-sectioning','p1',1,?)", ['{"sectionId":"p1_sec078"}']))
  return { root, dbPath, sql }
}
it.each(["trigger", "witness-table", "all-objects"])("refuses lost %s integrity after reopen without hiding usable content", kind => {
  const b = book()
  b.sql(db => {
    if (kind === "trigger") {
      db.exec("DROP TRIGGER history_track_update")
      db.run("UPDATE node_data SET data=?", ['{"sectionId":"p1_sec079","corrected":true}'])
    } else if (kind === "witness-table") {
      db.run("UPDATE node_data SET data=?", ['{"sections":[]}'])
      db.exec("DROP TABLE history_witnesses")
    } else {
      const objects = db.all("SELECT type,name FROM sqlite_master WHERE name LIKE 'history_%' ORDER BY type DESC") as { type: string; name: string }[]
      for (const object of objects) if (["trigger", "table"].includes(object.type)) db.exec(`DROP ${object.type} IF EXISTS ${object.name}`)
    }
  })
  expect(() => inspectHistoryRecovery(b.dbPath)).toThrow(/HISTORY_/)
  const storage = createBookStorage("book", b.root)
  try {
    expect(storage.getLatestNodeData("page-sectioning", "p1")).toBeDefined()
    expect(() => storage.readIdentityHistory!(["page-sectioning"])).toThrow("HISTORY_REPAIR_REQUIRED")
  } finally { storage.close() }
  expect(() => inspectHistoryRecovery(b.dbPath)).toThrow(/HISTORY_/)
})
it("returns each extant incarnation once while retaining identities from replaced incarnations", () => {
  const b = book()
  const storage = createBookStorage("book", b.root)
  try { expect(storage.readIdentityHistory!(["page-sectioning"], "p1")).toHaveLength(1) }
  finally { storage.close() }
  b.sql(db => db.run("UPDATE node_data SET data=? WHERE node='page-sectioning'", ['{"sectionId":"p1_sec079"}']))
  const changed = createBookStorage("book", b.root)
  try { expect(changed.readIdentityHistory!(["page-sectioning"], "p1").map(r => r.data)).toEqual(expect.arrayContaining([{ sectionId: "p1_sec078", source: "manual" }, { sectionId: "p1_sec079" }])) }
  finally { changed.close() }
})
