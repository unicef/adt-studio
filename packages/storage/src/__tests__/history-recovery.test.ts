import { afterEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { openBookDb } from "../db.js"
import { checkpointHistory, inspectHistoryRecovery, readHistoryRecoveryAudit, repairHistory } from "../history-recovery.js"
import { HISTORY_EVIDENCE_SQL, insertNodeVersion } from "../history-evidence.js"
import type { HistoryRepairRequest } from "@adt/types"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function book() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-recovery-")); roots.push(root)
  const storage = createBookStorage("book", root)
  storage.close()
  const { dbPath, bookDir } = resolveBookPaths("book", root)
  const write = (data: unknown, node = "page-sectioning", itemId = "p1") => {
    const storage = createBookStorage("book", root)
    try { return storage.putNodeData(node, itemId, data) } finally { storage.close() }
  }
  const sql = (operation: (db: ReturnType<typeof openBookDb>) => void) => {
    const db = openBookDb(dbPath)
    try { operation(db) } finally { db.close() }
  }
  return { root, dbPath, bookDir, write, sql }
}
type Book = ReturnType<typeof book>
/** Deliberately simulates storage damage outside SQL's continuity protocol.
 * A normal UPDATE is separately tested and MUST NOT qualify for restoration. */
function damage(b: Book, raw = "{broken", version = 1, node = "page-sectioning", itemId = "p1") {
  b.sql(db => {
    db.exec("DROP TRIGGER history_track_update")
    db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=?", [raw, node, itemId, version])
    db.exec(HISTORY_EVIDENCE_SQL)
  })
}
function repairRequest(b: Book): HistoryRepairRequest {
  const state = inspectHistoryRecovery(b.dbPath)
  return { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true,
    records: state.issues.filter(issue => issue.reason === "recoverable").map(({ node, itemId, version, beforeHash, witnessHash }) => ({ node, itemId, version, beforeHash, witnessHash: witnessHash! })) }
}
function rawState(b: Book) {
  let state: unknown
  b.sql(db => { state = ["node_data", "node_current", "history_identity", "history_slots", "history_witnesses", "history_recovery_audit", "history_recovery_requests", "history_repair_permits"].map(table => db.all(`SELECT * FROM ${table} ORDER BY rowid`)) })
  return state
}

describe("verified historical recovery", () => {
  it("does not assign identity or checkpoint on inspection, including older healthy books", () => {
    const b = book()
    b.sql(db => db.run("INSERT INTO node_data VALUES ('page-sectioning','p1',1,?)", [JSON.stringify({ id: "legacy" })]))
    const before = rawState(b)
    expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ bookId: null, checkpointable: 1, issues: [] })
    expect(rawState(b)).toEqual(before)
    const state = inspectHistoryRecovery(b.dbPath)
    const receipt = checkpointHistory(b.dbPath, { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true })
    expect(receipt.count).toBe(1)
    damage(b)
    expect(inspectHistoryRecovery(b.dbPath).issues[0].reason).toBe("recoverable")
  })

  it("restores exact bytes, retains damaged evidence and manual provenance, and advances a selected version", () => {
    const b = book()
    const original = { source: "manual", sectionId: "p1_sec078", nested: { id: "stable", answer: "preserve me" } }
    b.write(original)
    fs.writeFileSync(path.join(b.bookDir, "images", "original.png"), "original image")
    damage(b)
    const body = repairRequest(b)
    expect(repairHistory(b.dbPath, body)).toMatchObject({ count: 1, revision: 1, selectedVersions: [{ node: "page-sectioning", itemId: "p1", version: 2 }] })
    const storage = createBookStorage("book", b.root)
    try {
      expect(storage.getAllNodeVersions("page-sectioning", "p1")).toEqual([{ version: 1, data: original }, { version: 2, data: original }])
      expect(storage.getCurrentNodeVersion("page-sectioning", "p1")).toBe(2)
      expect(storage.getNodeVersionFingerprint()).toContainEqual({ node: "history-recovery-state", itemId: "book", version: 1 })
      expect(storage.getStepRuns()).toEqual([])
    } finally { storage.close() }
    expect(readHistoryRecoveryAudit(b.dbPath, body.requestId)).toMatchObject([{ damaged: { storageType: "text", hex: Buffer.from("{broken").toString("hex").toUpperCase() }, witness: { origin: "write" } }])
    expect(fs.readFileSync(path.join(b.bookDir, "images", "original.png"), "utf8")).toBe("original image")
    expect(inspectHistoryRecovery(b.dbPath).issues).toEqual([])
    b.sql(db => expect(db.all("SELECT * FROM history_repair_permits")).toEqual([]))
  })

  it("does not select a repaired retired version or change unrelated versions", () => {
    const b = book(); b.write({ id: "old" }); b.write({ id: "current" }); b.write({ id: "neighbor" }, "web-rendering", "p2")
    damage(b)
    expect(repairHistory(b.dbPath, repairRequest(b)).selectedVersions).toEqual([])
    const storage = createBookStorage("book", b.root)
    try {
      expect(storage.getLatestNodeData("page-sectioning", "p1")).toEqual({ version: 2, data: { id: "current" } })
      expect(storage.getAllNodeVersions("web-rendering", "p2")).toEqual([{ version: 1, data: { id: "neighbor" } }])
    } finally { storage.close() }
  })

  it.each([null, "null"])("preserves SQL null versus JSON null: %s", original => {
    const b = book()
    b.sql(db => { db.exec("BEGIN IMMEDIATE"); insertNodeVersion(db, "page-sectioning", "p1", 1, original); db.exec("COMMIT") })
    damage(b)
    repairHistory(b.dbPath, repairRequest(b))
    b.sql(db => expect(db.all("SELECT typeof(data) AS kind,data FROM node_data WHERE node='page-sectioning' ORDER BY version")).toEqual([{ kind: original === null ? "null" : "text", data: original }, { kind: original === null ? "null" : "text", data: original }]))
  })

  it("preserves malformed UTF-8 and SQLite blob damage verbatim in the audit", () => {
    const b = book(); b.write({ id: "original" })
    b.sql(db => { db.exec("DROP TRIGGER history_track_update"); db.exec("UPDATE node_data SET data=X'FF00FE' WHERE node='page-sectioning'"); db.exec(HISTORY_EVIDENCE_SQL) })
    const body = repairRequest(b); repairHistory(b.dbPath, body)
    expect(readHistoryRecoveryAudit(b.dbPath, body.requestId)).toMatchObject([{ damaged: { storageType: "blob", hex: "FF00FE" } }])
  })

  it("rejects normal SQL changes and tuple reuse instead of applying an earlier witness", () => {
    const b = book(); b.write({ id: "A" })
    b.sql(db => db.exec("UPDATE node_data SET data='{broken' WHERE node='page-sectioning'"))
    expect(inspectHistoryRecovery(b.dbPath).issues[0].reason).toBe("changed-record")
    b.sql(db => { db.exec("DELETE FROM node_data WHERE node='page-sectioning'"); db.run("INSERT INTO node_data VALUES ('page-sectioning','p1',1,?)", ['{"id":"B"}']) })
    damage(b)
    expect(inspectHistoryRecovery(b.dbPath).issues[0].reason).toBe("changed-record")
  })

  it("retains reservations after supported deletion and detects unexpected missing history", () => {
    const b = book(); b.write({ sectionId: "p1_sec078", id: "retired" })
    const storage = createBookStorage("book", b.root)
    try {
      storage.deletePage("p1")
      expect(storage.readIdentityHistory!(["page-sectioning"], "p1")).toEqual([{ node: "page-sectioning", itemId: "p1", version: 1, data: { sectionId: "p1_sec078", id: "retired" } }])
    } finally { storage.close() }
    expect(inspectHistoryRecovery(b.dbPath).issues).toEqual([])
    b.write({ id: "next incarnation" })
    b.sql(db => { db.exec("DROP TRIGGER history_track_delete"); db.exec("DELETE FROM node_data WHERE node='page-sectioning'"); db.exec(HISTORY_EVIDENCE_SQL) })
    expect(inspectHistoryRecovery(b.dbPath).issues[0].reason).toBe("missing-record")
  })

  it.each(["stale", "cross-book", "duplicate-record", "wrong-proof"])("refuses %s confirmation without any partial writes", kind => {
    const b = book(); b.write({ id: "A" }); damage(b)
    const body = repairRequest(b)
    if (kind === "stale") b.write({ id: "other" }, "metadata", "book")
    if (kind === "cross-book") body.snapshot = inspectHistoryRecovery(book().dbPath).snapshot
    if (kind === "duplicate-record") body.records.push(body.records[0])
    if (kind === "wrong-proof") body.records[0].witnessHash = "0".repeat(64)
    const before = rawState(b)
    expect(() => repairHistory(b.dbPath, body)).toThrow(/HISTORY_RECOVERY/)
    expect(rawState(b)).toEqual(before)
  })

  it("replays the exact receipt, rejects a reused request ID, and does not claim later damage repaired", () => {
    const b = book(); b.write({ id: "A" }); damage(b)
    const body = repairRequest(b)
    const receipt = repairHistory(b.dbPath, body)
    damage(b, "{later", 2)
    const before = rawState(b)
    expect(repairHistory(b.dbPath, body)).toEqual({ ...receipt, replayed: true })
    expect(rawState(b)).toEqual(before)
    expect(inspectHistoryRecovery(b.dbPath).issueCount).toBe(1)
    expect(() => repairHistory(b.dbPath, { ...body, snapshot: "0".repeat(64) })).toThrow("HISTORY_RECOVERY_REQUEST_CONFLICT")
  })

  it("rolls back restored bytes and audit if a later transaction write fails", () => {
    const b = book(); b.write({ id: "A" }); damage(b)
    const body = repairRequest(b)
    b.sql(db => db.exec("CREATE TRIGGER test_refuse BEFORE INSERT ON node_data WHEN NEW.node='history-recovery-state' BEGIN SELECT RAISE(ABORT,'injected disk failure'); END"))
    const before = rawState(b)
    expect(() => repairHistory(b.dbPath, body)).toThrow("injected disk failure")
    expect(rawState(b)).toEqual(before)
    b.sql(db => db.exec("DROP TRIGGER test_refuse"))
    expect(repairHistory(b.dbPath, body).count).toBe(1)
  })

  it("refuses corrupt, wrong-book or missing continuity evidence, and cannot checkpoint over it", () => {
    const b = book(); b.write({ id: "A" }); damage(b)
    b.sql(db => { db.exec("DROP TRIGGER history_witnesses_update"); db.exec("UPDATE history_witnesses SET evidence='{}'"); db.exec(HISTORY_EVIDENCE_SQL) })
    const state = inspectHistoryRecovery(b.dbPath)
    expect(state.issues[0].reason).toBe("invalid-witness")
    expect(() => checkpointHistory(b.dbPath, { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true })).toThrow("HISTORY_RECOVERY_UNVERIFIED")
    const c = book(); c.write({ id: "B" })
    c.sql(db => db.exec("DELETE FROM history_slots"))
    expect(inspectHistoryRecovery(c.dbPath).issues[0].reason).toBe("invalid-witness")
  })

  it("cannot checkpoint malformed legacy data or create bookkeeping in an empty destination", () => {
    const b = book()
    const empty = inspectHistoryRecovery(b.dbPath)
    expect(() => checkpointHistory(b.dbPath, { snapshot: empty.snapshot, requestId: randomUUID(), confirmed: true })).toThrow("HISTORY_RECOVERY_NOT_NEEDED")
    b.sql(db => db.exec("INSERT INTO node_data VALUES ('page-sectioning','p1',1,'{bad')"))
    const state = inspectHistoryRecovery(b.dbPath)
    expect(state.issues[0].reason).toBe("missing-witness")
    const before = rawState(b)
    expect(() => checkpointHistory(b.dbPath, { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true })).toThrow("HISTORY_RECOVERY_UNVERIFIED")
    expect(rawState(b)).toEqual(before)
  })

  it("keeps evidence append-only even through SQLite INSERT OR REPLACE", () => {
    const b = book(); b.write({ id: "original" })
    b.sql(db => {
      expect(() => db.exec("INSERT OR REPLACE INTO history_witnesses SELECT * FROM history_witnesses")).toThrow("append-only")
      expect(() => db.exec("INSERT OR REPLACE INTO history_identity SELECT * FROM history_identity")).toThrow("append-only")
      expect(() => db.exec("DELETE FROM history_witnesses")).toThrow("append-only")
    })
    expect(inspectHistoryRecovery(b.dbPath).issues).toEqual([])
  })

  it.each(["update", "request", "commit"])("recovers atomically after an independent repair process dies at %s", phase => {
    const b = book(); b.write({ id: "original", source: "manual" }); damage(b)
    const body = repairRequest(b)
    const before = rawState(b)
    const module = pathToFileURL(path.resolve(import.meta.dirname, "../../dist/history-recovery.js")).href
    const driver = pathToFileURL(path.resolve(import.meta.dirname, "../../node_modules/node-sqlite3-wasm/dist/node-sqlite3-wasm.js")).href
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import sqlite from ${JSON.stringify(driver)};
      import { repairHistory } from ${JSON.stringify(module)};
      const run = sqlite.Database.prototype.run, exec = sqlite.Database.prototype.exec;
      let repairing = false;
      sqlite.Database.prototype.run = function(sql, ...args) {
        const result = run.call(this,sql,...args);
        if(sql.startsWith('UPDATE node_data SET data=')) {
          repairing = true;
          if(${JSON.stringify(phase)} === 'update') process.kill(process.pid,'SIGKILL');
        }
        if(repairing && sql.startsWith('INSERT INTO history_recovery_requests') && ${JSON.stringify(phase)} === 'request') process.kill(process.pid,'SIGKILL');
        return result;
      };
      sqlite.Database.prototype.exec = function(sql, ...args) {
        const result = exec.call(this,sql,...args);
        if(repairing && sql === 'COMMIT' && ${JSON.stringify(phase)} === 'commit') process.kill(process.pid,'SIGKILL');
        return result;
      };
      repairHistory(${JSON.stringify(b.dbPath)},${JSON.stringify(body)});
    `], { encoding: "utf8", timeout: 15000 })
    expect(child.signal, child.stderr).toBe("SIGKILL")
    // The shared admission protocol recovers only its proven-dead owner;
    // SQLite recovers its own journal. No test removes a mutex or journal.
    if (phase === "commit") {
      expect(inspectHistoryRecovery(b.dbPath).issueCount).toBe(0)
      expect(repairHistory(b.dbPath, body).replayed).toBe(true)
    } else {
      expect(rawState(b)).toEqual(before)
      expect(repairHistory(b.dbPath, body).replayed).toBe(false)
    }
    expect(inspectHistoryRecovery(b.dbPath).issueCount).toBe(0)
  }, 20000)

  it("does not recover while an independent database reader still owns its mutex", async () => {
    const b = book(); b.write({ id: "original" }); damage(b)
    const body = repairRequest(b), before = rawState(b)
    const module = pathToFileURL(path.resolve(import.meta.dirname, "../../dist/db.js")).href
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { openBookDb } from ${JSON.stringify(module)};
      const db=openBookDb(${JSON.stringify(b.dbPath)});
      db.exec('BEGIN DEFERRED'); db.all('SELECT * FROM node_data');
      process.send('reading');
      await new Promise(resolve => process.once('message',resolve));
      db.exec('COMMIT'); db.close(); process.disconnect();
    `], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
    try {
      await once(child, "message")
      expect(() => repairHistory(b.dbPath, body)).toThrow("BOOK_BUSY")
      expect(fs.existsSync(`${b.dbPath}.lock`)).toBe(true)
      const exit = once(child, "exit"); child.send("release"); await exit
      expect(rawState(b)).toEqual(before)
      expect(repairHistory(b.dbPath, body).count).toBe(1)
    } finally { if (child.exitCode === null && child.signalCode === null) { const exit = once(child, "exit"); child.kill("SIGKILL"); await exit } }
  }, 20000)
})
