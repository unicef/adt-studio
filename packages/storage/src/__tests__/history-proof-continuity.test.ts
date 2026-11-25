import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { openBookDb } from "../db.js"
import { inspectHistoryRecovery } from "../history-recovery.js"
import { HISTORY_EVIDENCE_SQL } from "../history-evidence.js"
import { HistoryIntegrityError } from "../history-integrity.js"

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

it.each(["missing-slot", "absent-slot", "changed-bytes", "retired-without-witness", "blob", "invalid-utf8"])(
  "reports the exact damaged tuple after warming a scoped scan: %s", damage => {
    const b = book()
    const storage = createBookStorage("book", b.root)
    const project = (record: { itemId: string }) => [record.itemId]
    try {
      storage.putNodeData("page-sectioning", "healthy", { id: "keep" })
      expect(storage.readIdentityHistoryIds!(["page-sectioning"], project, "p1")).toEqual(["p1"])
      b.sql(db => {
        if (damage === "missing-slot") db.run("DELETE FROM history_slots WHERE item_id=?", ["p1"])
        if (damage === "absent-slot") db.run("UPDATE history_slots SET present=0 WHERE item_id=?", ["p1"])
        if (damage === "changed-bytes") {
          db.exec("DROP TRIGGER history_track_update")
          db.run("UPDATE node_data SET data=? WHERE item_id=?", ['{"id":"different"}', "p1"])
          db.exec(HISTORY_EVIDENCE_SQL)
        }
        if (damage === "retired-without-witness") {
          db.run("DELETE FROM node_data WHERE item_id=?", ["p1"])
          db.exec("DROP TRIGGER history_witnesses_delete")
          db.run("DELETE FROM history_witnesses WHERE item_id=?", ["p1"])
          db.exec(HISTORY_EVIDENCE_SQL)
        }
        if (damage === "blob") db.run("UPDATE node_data SET data=X'FF00FE' WHERE item_id=?", ["p1"])
        if (damage === "invalid-utf8") db.run("UPDATE node_data SET data=CAST(X'FF00FE' AS TEXT) WHERE item_id=?", ["p1"])
      })
      for (const read of [
        () => storage.readIdentityHistory!(["page-sectioning"], "p1"),
        () => storage.readIdentityHistoryIds!(["page-sectioning"], project, "p1"),
      ]) {
        let error: unknown
        try { read() } catch (caught) { error = caught }
        expect(error).toBeInstanceOf(HistoryIntegrityError)
        expect(error).toMatchObject({ node: "page-sectioning", itemId: "p1", version: 1 })
      }
      expect(storage.readIdentityHistory!(["page-sectioning"], "healthy")).toEqual([
        { node: "page-sectioning", itemId: "healthy", version: 1, data: { id: "keep" } },
      ])
    } finally { storage.close() }
  },
)

it("preserves full record shape and ordering for unwitnessed, invalidated and replaced incarnations", () => {
  const b = book()
  b.sql(db => {
    db.run("UPDATE node_data SET data=? WHERE item_id=?", ['{"sectionId":"changed"}', "p1"])
    db.run("INSERT INTO node_data VALUES (?,?,1,?)", ["page-sectioning", "sql-null", null])
    db.run("INSERT INTO node_data VALUES (?,?,1,?)", ["page-sectioning", "json-null", " null "])
    db.run("INSERT INTO node_data VALUES (?,?,1,?)", ["page-sectioning", "unwitnessed", '{"id":"legacy"}'])
    db.run("INSERT INTO node_data VALUES (?,?,1,?)", ["tts", "unrelated", "{broken"])
  })
  const storage = createBookStorage("book", b.root)
  try {
    const rows = storage.readIdentityHistory!(["page-sectioning"])
    expect(rows).toEqual([
      { node: "page-sectioning", itemId: "p1", version: 1, data: { sectionId: "p1_sec078", source: "manual" } },
      { node: "page-sectioning", itemId: "json-null", version: 1, data: null },
      { node: "page-sectioning", itemId: "p1", version: 1, data: { sectionId: "changed" } },
      { node: "page-sectioning", itemId: "sql-null", version: 1, data: null },
      { node: "page-sectioning", itemId: "unwitnessed", version: 1, data: { id: "legacy" } },
    ])
    expect(storage.readIdentityHistory!([])).toEqual([])
    expect(storage.readIdentityHistory!(["page-sectioning"], "unwitnessed")).toEqual([rows[4]])
  } finally { storage.close() }
})

it("keeps a physical overflow-page failure bound to its historical tuple", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-overflow-")); roots.push(root)
  const storage = createBookStorage("book", root)
  storage.putNodeData("page-sectioning", "p1", { id: "original", text: "x".repeat(200_000) })
  storage.close()
  const { dbPath } = resolveBookPaths("book", root)
  const db = openBookDb(dbPath)
  const { rootpage } = db.get("SELECT rootpage FROM sqlite_master WHERE name='node_data'") as { rootpage: number }
  db.close()
  // Damage only this row's overflow pointer. The covering index still exposes
  // its tuple, while reading its payload raises SQLITE_CORRUPT.
  const bytes = fs.readFileSync(dbPath)
  const size = bytes.readUInt16BE(16)
  const start = (rootpage - 1) * size
  expect(bytes[start]).toBe(13) // table leaf
  expect(bytes.readUInt16BE(start + 3)).toBe(1)
  let offset = start + bytes.readUInt16BE(start + 8)
  const varint = () => {
    let value = 0
    for (let i = 0; i < 9; i++) {
      const byte = bytes[offset++]
      value = value * 128 + (byte & 127)
      if (byte < 128) return value
    }
    throw new Error("Unexpected fixture varint")
  }
  const payload = varint(); varint() // payload length, then rowid
  const usable = size - bytes[20]
  const min = Math.floor((usable - 12) * 32 / 255) - 23
  let local = min + (payload - min) % (usable - 4)
  if (local > usable - 35) local = min
  expect(bytes.readUInt32BE(offset + local)).toBeGreaterThan(0)
  bytes.writeUInt32BE(0x7fffffff, offset + local)
  fs.writeFileSync(dbPath, bytes)
  const damaged = createBookStorage("book", root)
  try {
    for (const read of [
      () => damaged.readIdentityHistory!(["page-sectioning"]),
      () => damaged.readIdentityHistoryIds!(["page-sectioning"], record => [record.itemId]),
    ]) {
      let error: unknown
      try { read() } catch (caught) { error = caught }
      expect(error).toBeInstanceOf(HistoryIntegrityError)
      expect(error).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED", node: "page-sectioning", itemId: "p1", version: 1 })
    }
  } finally { damaged.close() }
})
