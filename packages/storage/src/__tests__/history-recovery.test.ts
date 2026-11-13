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
import { checkpointHistory, inspectHistoryRecovery, inspectHistoryRecoveryAsync, readHistoryRecoveryAudit, repairHistory } from "../history-recovery.js"
import { HISTORY_EVIDENCE_SQL, insertNodeVersion } from "../history-evidence.js"
import { ownsBookWriter, withBookWriter } from "../book-writer.js"
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
function damage(b: Book, raw: string | null = "{broken", version = 1, node = "page-sectioning", itemId = "p1") {
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
  it("does not checkpoint later older-writer rows on inspection after initial capture", () => {
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

  it("checkpoints mixed readable history without changing existing proof or content", () => {
    const b = book(); b.write({ id: "witnessed" })
    b.sql(db => {
      db.run("INSERT INTO node_data VALUES ('page-sectioning','later',1,?)", [' { "id": "legacy" } '])
      db.run("INSERT INTO node_data VALUES ('quiz-generation','sql-null',1,?)", [null])
      db.run("INSERT INTO node_data VALUES ('quiz-generation','json-null',1,?)", ["null"])
    })
    const before = rawState(b) as unknown[][]
    const state = inspectHistoryRecovery(b.dbPath)
    expect(state.checkpointable).toBe(3)
    expect(checkpointHistory(b.dbPath, { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true }).count).toBe(3)
    const after = rawState(b) as unknown[][]
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4))
    expect(after[4]).toHaveLength(4)
    expect(after[4][0]).toEqual(before[4][0])
    expect(inspectHistoryRecovery(b.dbPath)).toMatchObject({ checkpointable: 0, issueCount: 0 })
    b.sql(db => db.run("INSERT INTO node_data VALUES ('page-sectioning','unreadable',1,?)", ["{broken"]))
    const damaged = inspectHistoryRecovery(b.dbPath)
    const refused = rawState(b)
    expect(() => checkpointHistory(b.dbPath, { snapshot: damaged.snapshot, requestId: randomUUID(), confirmed: true })).toThrow("HISTORY_RECOVERY_UNVERIFIED")
    expect(rawState(b)).toEqual(refused)
  })

  it.each(["older", "absent", "dangling"].flatMap(pointer => [null, "null"].map(raw => ({ pointer, raw }))))(
    "advances the selected quiz repair with $pointer pointer and $raw damage", ({ pointer, raw }) => {
      const b = book(); b.write({ id: "older" }, "quiz-generation", "book"); b.write({ id: "newer" }, "quiz-generation", "book")
      const version = pointer === "older" ? 1 : 2
      b.sql(db => {
        if (pointer === "absent") db.run("DELETE FROM node_current WHERE node='quiz-generation'")
        else db.run("UPDATE node_current SET version=? WHERE node='quiz-generation'", [pointer === "older" ? 1 : 99])
      })
      damage(b, raw, version, "quiz-generation", "book")
      expect(repairHistory(b.dbPath, repairRequest(b)).selectedVersions).toEqual([{ node: "quiz-generation", itemId: "book", version: 3 }])
      const storage = createBookStorage("book", b.root)
      try {
        expect(storage.getLatestNodeData("quiz-generation", "book")).toEqual({ version: 3, data: { id: version === 1 ? "older" : "newer" } })
        expect(storage.getCurrentNodeVersion("quiz-generation", "book")).toBe(3)
      } finally { storage.close() }
    },
  )

  it("retires a quoted page identity without checkpointing an unreadable neighbor", () => {
    const b = book(); const pageId = "page'quoted"
    b.sql(db => {
      db.run("INSERT INTO node_data VALUES ('page-sectioning',?,1,?)", [pageId, '{"id":"retired"}'])
      db.run("INSERT INTO node_data VALUES ('page-sectioning','neighbor',1,?)", ["{broken"])
    })
    const storage = createBookStorage("book", b.root)
    try {
      storage.deletePage(pageId)
      expect(storage.readIdentityHistory!(["page-sectioning"], pageId)).toEqual([{ node: "page-sectioning", itemId: pageId, version: 1, data: { id: "retired" } }])
    } finally { storage.close() }
    b.sql(db => {
      expect(db.all("SELECT item_id,data FROM node_data WHERE node='page-sectioning'")).toEqual([{ item_id: "neighbor", data: "{broken" }])
      expect(db.all("SELECT item_id FROM history_witnesses")).toEqual([{ item_id: pageId }])
    })
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


it.each(["content", "telemetry", "raw rewrite", "schema loss", "database replacement"])("yields without blocking same-process %s writes and rejects changed evidence", async kind => {
  const b = book()
  const storage = createBookStorage("book", b.root)
  try {
    storage.transaction(() => {
      for (let i = 0; i < 80; i++) storage.putNodeData("page-sectioning", `p${i}`, { id: `p${i}_sec001`, text: "inspection payload ".repeat(2000) })
    })
  } finally { storage.close() }
  const before = inspectHistoryRecovery(b.dbPath)
  let completed = false
  let visitedDuringInspection = false
  let writeError: unknown
  const unrelated = book()
  const tick = new Promise<void>(resolve => setImmediate(() => {
    visitedDuringInspection = !completed
    try { withBookWriter(b.bookDir, () => {
      if (kind === "content") b.write({ id: "concurrent-version" })
      else if (kind === "raw rewrite") b.sql(db => db.run("UPDATE node_data SET data=? WHERE node='page-sectioning' AND item_id='p1'", [JSON.stringify({ id: "raw-change" })]))
      else if (kind === "schema loss") b.sql(db => db.exec("DROP TABLE history_recovery_requests"))
      else if (kind === "database replacement") { fs.renameSync(b.dbPath, b.dbPath + ".before"); fs.copyFileSync(unrelated.dbPath, b.dbPath) }
      else { const storage = createBookStorage("book", b.root); try { storage.markStepStarted("package-web") } finally { storage.close() } }
    }) } catch (error) { writeError = error }
    unrelated.write({ id: "unrelated-book-can-write" })
    resolve()
  }))
  let inspected: Awaited<ReturnType<typeof inspectHistoryRecoveryAsync>> | undefined
  if (kind !== "telemetry") await expect(inspectHistoryRecoveryAsync(b.dbPath)).rejects.toThrow("HISTORY_RECOVERY_STALE")
  else inspected = await inspectHistoryRecoveryAsync(b.dbPath)
  completed = true
  await tick
  expect(visitedDuringInspection).toBe(true)
  expect(writeError).toBeUndefined()
  if (kind === "telemetry") expect(inspected).toEqual(before)
  else if (kind === "content") {
    expect(inspectHistoryRecovery(b.dbPath).snapshot).not.toEqual(before.snapshot)
    expect(() => checkpointHistory(b.dbPath, { snapshot: before.snapshot, requestId: randomUUID(), confirmed: true })).toThrow("HISTORY_RECOVERY_STALE")
  }
})

it("inspects while an unrelated same-process writer is active without granting writer authority", async () => {
  const b = book(); b.write({ id: "p1_sec001" })
  const before = inspectHistoryRecovery(b.dbPath)
  let release!: () => void
  // Create the inspection continuation outside the writer's AsyncLocalStorage.
  let inspect!: () => void
  const inspection = new Promise<void>(resolve => { inspect = resolve }).then(async () => {
    expect(ownsBookWriter(b.bookDir)).toBe(false)
    const result = await inspectHistoryRecoveryAsync(b.dbPath)
    expect(ownsBookWriter(b.bookDir)).toBe(false)
    return result
  })
  const writer = withBookWriter(b.bookDir, () => new Promise<void>(resolve => { release = resolve; inspect() }))
  try { expect(await inspection).toEqual(before) }
  finally { release(); await writer }
})

it("asynchronous inspection retains damaged-history diagnostics and closes statements on abort", async () => {
  const b = book(); b.write({ id: "p1_sec001" }); damage(b)
  expect(await inspectHistoryRecoveryAsync(b.dbPath)).toEqual(inspectHistoryRecovery(b.dbPath))
  b.sql(db => {
    db.exec("BEGIN")
    for (let i = 0; i < 80; i++) db.run("INSERT INTO node_data VALUES ('page-sectioning',?,1,?)", [`abort-${i}`, JSON.stringify({ text: "large scan ".repeat(2000) })])
    db.exec("COMMIT")
  })
  const abort = new AbortController()
  const tick = new Promise<void>(resolve => setImmediate(() => { abort.abort(); resolve() }))
  try { await expect(inspectHistoryRecoveryAsync(b.dbPath, abort.signal)).rejects.toThrow() }
  finally { await tick }
  expect(await inspectHistoryRecoveryAsync(b.dbPath)).toEqual(inspectHistoryRecovery(b.dbPath))
})
