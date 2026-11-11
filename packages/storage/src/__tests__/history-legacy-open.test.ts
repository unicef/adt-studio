import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { cleanupInterruptedSteps, openBookDb } from "../db.js"
import { HISTORY_EVIDENCE_SQL, decodeWitness } from "../history-evidence.js"
import { inspectHistoryRecovery } from "../history-recovery.js"

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))

// Reproduce a schema-14 database predating recovery tracking. Actual retained
// older-build delete/clear methods are additionally exercised by the local probe.
function legacy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-legacy-open-")); roots.push(root)
  createBookStorage("book", root).close()
  const { dbPath, bookDir } = resolveBookPaths("book", root)
  const raw = <T>(operation: (db: sqlite.Database) => T): T => {
    const db = new sqlite.Database(dbPath)
    try { return operation(db) } finally { db.close() }
  }
  raw(db => {
    for (const row of db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'history_%'") as { name: string }[]) db.exec(`DROP TRIGGER ${row.name}`)
    for (const row of db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'history_%'") as { name: string }[]) db.exec(`DROP TABLE ${row.name}`)
    for (const row of db.all("PRAGMA table_info(schema_version)") as { name: string }[]) if (row.name.startsWith("history_")) db.exec(`ALTER TABLE schema_version DROP COLUMN ${row.name}`)
  })
  const insert = (itemId: string, version: number, value: string | null) => raw(db => db.run("INSERT INTO node_data VALUES ('page-sectioning',?,?,?)", [itemId, version, value]))
  const content = () => raw(db => ({ rows: db.all("SELECT *,typeof(data) AS kind,hex(CAST(data AS BLOB)) AS bytes FROM node_data ORDER BY node,item_id,version"), current: db.all("SELECT * FROM node_current ORDER BY node,item_id") }))
  return { root, dbPath, bookDir, raw, insert, content }
}

it("captures readable legacy history once without changing content, selection or assets, then reserves old-writer retirements", () => {
  const b = legacy()
  b.insert("p1", 1, ' { "sectionId": "p1_sec078", "source": "manual" } ')
  b.insert("p1", 2, '{"sectionId":"p1_sec079"}')
  b.insert("sql-null", 1, null)
  b.insert("json-null", 1, "null")
  b.raw(db => db.run("INSERT INTO node_current VALUES ('page-sectioning','p1',1)"))
  const asset = path.join(b.bookDir, "images", "keep.png"); fs.writeFileSync(asset, "unchanged image")
  const before = b.content()
  const storage = createBookStorage("book", b.root)
  expect(storage.getLatestNodeData("page-sectioning", "p1")?.version).toBe(1)
  storage.close()
  expect(b.content()).toEqual(before)
  expect(fs.readFileSync(asset, "utf8")).toBe("unchanged image")
  expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ checkpointable: 0, issueCount: 0, revision: 0 })
  const witnesses = b.raw(db => db.all("SELECT evidence FROM history_witnesses ORDER BY rowid")) as { evidence: string }[]
  expect(witnesses).toHaveLength(4)
  expect(witnesses.map(row => decodeWitness(row.evidence))).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: "p1", version: 1, origin: "checkpoint", bytes: { storageType: "text", hex: Buffer.from(' { "sectionId": "p1_sec078", "source": "manual" } ').toString("hex").toUpperCase() } })]))
  // Normal SQL deletes from older writers must finish, including after images
  // have already been removed. The verified retired IDs remain reserved.
  b.raw(db => { db.exec("DELETE FROM node_data"); db.exec("DELETE FROM node_current") })
  const reopened = createBookStorage("book", b.root)
  expect(reopened.readIdentityHistory!(["page-sectioning"], "p1").map(row => row.data)).toEqual([{ sectionId: "p1_sec078", source: "manual" }, { sectionId: "p1_sec079" }])
  expect(reopened.getLatestNodeData("page-sectioning", "p1")).toBeNull()
  reopened.close()
  expect(inspectHistoryRecovery(b.dbPath).issues).toEqual([])
  expect(b.raw(db => db.all("SELECT evidence FROM history_witnesses ORDER BY rowid"))).toEqual(witnesses)
})

it("captures healthy siblings without trusting malformed legacy bytes or making them unreadable to raw access", () => {
  const b = legacy()
  b.insert("good", 1, '{"id":"keep"}'); b.insert("bad", 1, "{broken")
  b.raw(db => db.exec("INSERT INTO node_data VALUES ('page-sectioning','blob',1,X'FF00')"))
  const before = b.content()
  const db = openBookDb(b.dbPath); db.close()
  expect(b.content()).toEqual(before)
  expect(b.raw(db => db.all("SELECT item_id FROM history_witnesses"))).toEqual([{ item_id: "good" }])
  expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ checkpointable: 0, issueCount: 2 })
  const storage = createBookStorage("book", b.root)
  expect(storage.getLatestNodeData("page-sectioning", "good")?.data).toEqual({ id: "keep" })
  expect(() => storage.readIdentityHistory!(["page-sectioning"])).toThrow("HISTORY_REPAIR_REQUIRED")
  storage.close()
})

it("adopts untracked legacy rows from the earlier recovery build without automatically trusting tracked changes", () => {
  const b = legacy(); b.insert("untouched", 1, '{"id":"legacy"}'); b.insert("changed", 1, '{"id":"old"}')
  b.raw(db => {
    db.exec(HISTORY_EVIDENCE_SQL)
    db.exec("ALTER TABLE schema_version ADD COLUMN history_evidence_version INTEGER")
    db.exec("ALTER TABLE schema_version ADD COLUMN history_evidence_gap INTEGER NOT NULL DEFAULT 0")
    db.exec("UPDATE schema_version SET history_evidence_version=1")
    db.exec("UPDATE node_data SET data='{\"id\":\"changed\"}' WHERE item_id='changed'")
  })
  const db = openBookDb(b.dbPath); db.close()
  expect(b.raw(db => db.all("SELECT item_id FROM history_witnesses"))).toEqual([{ item_id: "untouched" }])
  expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ checkpointable: 1, issueCount: 0 })
  // Later older-runtime writes still require an explicit checkpoint. Opening
  // repeatedly must neither replace a witness nor silently bless an incarnation.
  b.insert("later", 1, '{"id":"later"}')
  expect(inspectHistoryRecovery(b.dbPath).checkpointable).toBe(2)
  expect(b.raw(db => db.all("SELECT item_id FROM history_witnesses"))).toEqual([{ item_id: "untouched" }])
})

it("rolls back the entire first-open capture on a write failure and retries safely", () => {
  const b = legacy(); b.insert("p1", 1, '{"id":"one"}'); b.insert("p2", 1, '{"id":"two"}')
  // An earlier tracking installation allows injecting a failure after the first
  // witness, proving the one-time completion marker and partial proofs roll back.
  b.raw(db => {
    db.exec(HISTORY_EVIDENCE_SQL)
    db.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON history_witnesses WHEN NEW.item_id='p2' BEGIN SELECT RAISE(ABORT,'capture write failed'); END")
  })
  const before = b.content()
  expect(() => openBookDb(b.dbPath)).toThrow("capture write failed")
  expect(b.content()).toEqual(before)
  b.raw(db => {
    expect(db.all("SELECT * FROM history_witnesses")).toEqual([])
    expect(db.all("SELECT * FROM history_slots")).toEqual([])
    expect(db.all("SELECT * FROM history_identity")).toEqual([])
    db.exec("DROP TRIGGER fail_capture")
  })
  const db = openBookDb(b.dbPath); db.close()
  expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ checkpointable: 0, issueCount: 0 })
  expect(b.raw(db => db.all("SELECT item_id FROM history_witnesses ORDER BY item_id"))).toEqual([{ item_id: "p1" }, { item_id: "p2" }])
})

it.each(["lost-slot", "lost-trigger"])("does not bootstrap over %s from an earlier recovery build", kind => {
  const b = legacy(); b.insert("p1", 1, '{"id":"original"}')
  const storage = createBookStorage("book", b.root)
  storage.putNodeData("page-sectioning", "p2", { id: "witnessed" }); storage.close()
  b.raw(db => {
    db.exec("ALTER TABLE schema_version DROP COLUMN history_legacy_capture")
    if (kind === "lost-slot") db.exec("DELETE FROM history_slots WHERE item_id='p2'")
    else db.exec("DROP TRIGGER history_track_delete")
  })
  const before = b.raw(db => db.all("SELECT * FROM history_witnesses ORDER BY rowid"))
  const reopened = createBookStorage("book", b.root)
  expect(reopened.getLatestNodeData("page-sectioning", "p2")?.data).toEqual({ id: "witnessed" })
  expect(() => reopened.readIdentityHistory!(["page-sectioning"])).toThrow("HISTORY_REPAIR_REQUIRED")
  reopened.close()
  expect(b.raw(db => db.all("SELECT * FROM history_witnesses ORDER BY rowid"))).toEqual(before)
})


it("startup only marks interrupted steps and leaves legacy capture for ordinary book access", () => {
  const b = legacy()
  for (let page = 0; page < 12; page++) b.insert(`p${page}`, 1, JSON.stringify({ id: `p${page}_sec077`, text: "large legacy payload ".repeat(10000) }))
  b.raw(db => db.exec("INSERT INTO step_runs(step,status) VALUES ('tts','running')"))
  const before = b.content()
  const schemaBefore = b.raw(db => db.all("SELECT name,sql FROM sqlite_master ORDER BY name"))
  cleanupInterruptedSteps(b.root)
  expect(b.content()).toEqual(before)
  expect(b.raw(db => db.all("SELECT name,sql FROM sqlite_master ORDER BY name"))).toEqual(schemaBefore)
  expect(b.raw(db => db.get("SELECT status,error FROM step_runs WHERE step='tts'"))).toEqual({ status: "error", error: "Interrupted" })
  // Startup has not installed tracking or issued a capture-completion marker.
  // First ordinary access must still capture every readable legacy row.
  const storage = createBookStorage("book", b.root)
  try { expect(storage.readIdentityHistory!(["page-sectioning"])).toHaveLength(12) }
  finally { storage.close() }
  expect(b.raw(db => db.get("SELECT history_legacy_capture AS captured FROM schema_version"))).toEqual({ captured: 1 })
  expect(b.content()).toEqual(before)
})
