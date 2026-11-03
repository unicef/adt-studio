import fs from "node:fs"
import { createHash } from "node:crypto"
import { assertHistoryEvidence } from "./history-schema.js"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import { HistoryCheckpointRequest, HistoryRepairRequest, HistoryRecoveryReceipt, type HistoryRecoveryStatus, type HistoryIssue, type HistoryTuple } from "@adt/types"
import { openBookDb } from "./db.js"
import { withBookWriter } from "./book-writer.js"
import { captureHistoryWitness, decodeWitness, historyRows, decodeHistoryBytes, historyBookId, historyHash, historySlot, identityTuples, insertNodeVersion, readHistoryBytes, readWitness, tupleKey, verifyWitness } from "./history-evidence.js"

export class HistoryRecoveryError extends Error {
  constructor(readonly code: "HISTORY_RECOVERY_STALE" | "HISTORY_RECOVERY_UNVERIFIED" | "HISTORY_RECOVERY_REQUEST_CONFLICT" | "HISTORY_RECOVERY_NOT_NEEDED" | "HISTORY_RECOVERY_REQUEST_INVALID" | "HISTORY_RECOVERY_BOOK_MISSING" | "HISTORY_RECOVERY_AUDIT_MISSING", readonly status: 400 | 404 | 409 = 409) {
    super(code)
    this.name = "HistoryRecoveryError"
  }
}

function revision(db: sqlite.Database): number {
  return (db.get("SELECT COUNT(DISTINCT request_id) AS value FROM history_recovery_audit") as { value: number }).value
}

/** Only synchronous, consistent reads. No witnesses, book identity or legacy
 * continuity are backfilled by inspection. Paths bind consent across copies. */
function inspect(db: sqlite.Database, dbPath: string): HistoryRecoveryStatus {
  assertHistoryEvidence(db)
  const bookId = historyBookId(db)
  const issues = new Map<string, HistoryIssue>()
  const checkpointRecords: HistoryTuple[] = []
  const tuples = identityTuples(db)
  const extant = new Set(tuples.map(tupleKey))
  for (const row of tuples) {
    const bytes = readHistoryBytes(db, row)!
    const beforeHash = historyHash(bytes)
    const slot = historySlot(db, row)
    let valid = true
    try { decodeHistoryBytes(bytes) } catch { valid = false }
    try {
      if (slot?.present === 0) throw new Error("Lost continuity")
      const witness = slot && readWitness(db, row, slot.incarnation)
      if (witness && beforeHash !== historyHash(witness.bytes)) {
        issues.set(tupleKey(row), { ...row, reason: "recoverable", beforeHash, witnessHash: witness.digest })
      } else if (!valid) {
        const old = db.get("SELECT 1 FROM history_witnesses WHERE node=? AND item_id=? AND version=?", [row.node, row.itemId, row.version])
        issues.set(tupleKey(row), { ...row, reason: old ? "changed-record" : "missing-witness", beforeHash })
      } else if (!witness) checkpointRecords.push(row)
    } catch { issues.set(tupleKey(row), { ...row, reason: "invalid-witness", beforeHash }) }
  }
  // Detect damaged witnesses and missing tracked records even when the current
  // source is readable. Neither case can be repaired by inventing a new row.
  const witnessed = new Set<string>()
  for (const row of historyRows<HistoryTuple & { incarnation: string; evidence: string }>(db, "SELECT node,item_id AS itemId,version,incarnation,evidence FROM history_witnesses ORDER BY node,item_id,version,incarnation")) {
    const tuple = { node: row.node, itemId: row.itemId, version: row.version }
    try {
      if (!historySlot(db, row)) throw new Error("Missing insertion continuity")
      const proof = verifyWitness(decodeWitness(row.evidence), bookId)
      if (tupleKey(proof) !== tupleKey(row) || proof.incarnation !== row.incarnation) throw new Error("Mismatched proof")
      witnessed.add(`${tupleKey(row)}:${row.incarnation}`)
    } catch { issues.set(tupleKey(row), { ...tuple, reason: "invalid-witness", beforeHash: historyHash(readHistoryBytes(db, row) ?? null) }) }
  }
  for (const row of db.all("SELECT node,item_id AS itemId,version,incarnation,present FROM history_slots ORDER BY node,item_id,version") as Array<HistoryTuple & { incarnation: string; present: number }>) {
    if (extant.has(tupleKey(row))) continue
    if (row.present !== 0 || !witnessed.has(`${tupleKey(row)}:${row.incarnation}`)) {
      issues.set(tupleKey(row), { node: row.node, itemId: row.itemId, version: row.version, reason: "missing-record", beforeHash: historyHash(null) })
    }
  }
  if (db.all("SELECT 1 FROM history_repair_permits").length) throw new HistoryRecoveryError("HISTORY_RECOVERY_UNVERIFIED")
  const digest = createHash("sha256")
  digest.update(JSON.stringify([path.join(fs.realpathSync(path.dirname(dbPath)), path.basename(dbPath)), bookId]))
  for (const [table, query] of Object.entries({
    rows: "SELECT node,item_id,version,typeof(data) AS storage_type,hex(CAST(data AS BLOB)) AS bytes FROM node_data ORDER BY node,item_id,version",
    current: "SELECT * FROM node_current ORDER BY node,item_id",
    slots: "SELECT * FROM history_slots ORDER BY node,item_id,version",
    witnesses: "SELECT * FROM history_witnesses ORDER BY node,item_id,version,incarnation",
    requests: "SELECT * FROM history_recovery_requests ORDER BY request_id",
    audit: "SELECT * FROM history_recovery_audit ORDER BY request_id,node,item_id,version",
  })) {
    digest.update(table + "\0")
    for (const row of historyRows(db, query)) digest.update(JSON.stringify(row) + "\0")
  }
  const snapshot = digest.digest("hex")
  return { snapshot, bookId, checkpointable: checkpointRecords.length, checkpointRecords, issueCount: issues.size, issues: [...issues.values()].sort((a, b) => Number(b.reason === "recoverable") - Number(a.reason === "recoverable")).slice(0, 20), revision: revision(db) }
}

function withDatabase<T>(dbPath: string, write: boolean, operation: (db: sqlite.Database) => T): T {
  const run = () => {
    const db = openBookDb(dbPath)
    try {
      db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN DEFERRED")
      try { const result = operation(db); db.exec("COMMIT"); return result }
      catch (error) { db.exec("ROLLBACK"); throw error }
    } finally { db.close() }
  }
  return write ? withBookWriter(path.dirname(dbPath), run) : run()
}

export function inspectHistoryRecovery(dbPath: string): HistoryRecoveryStatus {
  return withDatabase(dbPath, false, db => inspect(db, dbPath))
}

function request(db: sqlite.Database, dbPath: string, operation: "repair" | "checkpoint", body: HistoryCheckpointRequest | HistoryRepairRequest, apply: (state: HistoryRecoveryStatus) => HistoryRecoveryReceipt): HistoryRecoveryReceipt {
  const requestHash = historyHash({ operation, path: fs.realpathSync(dbPath), body })
  const existing = db.get("SELECT request_hash,receipt FROM history_recovery_requests WHERE request_id=?", [body.requestId]) as { request_hash: string; receipt: string } | undefined
  if (existing) {
    if (existing.request_hash !== requestHash) throw new HistoryRecoveryError("HISTORY_RECOVERY_REQUEST_CONFLICT")
    // A receipt reports that transaction, not the health of today's book.
    return { ...HistoryRecoveryReceipt.parse(JSON.parse(existing.receipt)), replayed: true }
  }
  const state = inspect(db, dbPath)
  if (state.snapshot !== body.snapshot) throw new HistoryRecoveryError("HISTORY_RECOVERY_STALE")
  const receipt = apply(state)
  db.run("INSERT INTO history_recovery_requests VALUES (?,?,?)", [body.requestId, requestHash, JSON.stringify(receipt)])
  return receipt
}

export function checkpointHistory(dbPath: string, input: HistoryCheckpointRequest): HistoryRecoveryReceipt {
  const body = HistoryCheckpointRequest.parse(input)
  return withDatabase(dbPath, true, db => request(db, dbPath, "checkpoint", body, state => {
    // Do not bless a partly damaged history or create bookkeeping in an empty
    // extraction destination. Recovery/checkpoint are separate explicit acts.
    if (state.issueCount) throw new HistoryRecoveryError("HISTORY_RECOVERY_UNVERIFIED")
    if (!state.checkpointable) throw new HistoryRecoveryError("HISTORY_RECOVERY_NOT_NEEDED")
    for (const row of identityTuples(db)) captureHistoryWitness(db, row, "checkpoint")
    return { requestId: body.requestId, operation: "checkpoint", count: state.checkpointable, revision: state.revision, replayed: false, selectedVersions: [] }
  }))
}

export function repairHistory(dbPath: string, input: HistoryRepairRequest): HistoryRecoveryReceipt {
  const body = HistoryRepairRequest.parse(input)
  return withDatabase(dbPath, true, db => request(db, dbPath, "repair", body, state => {
    const keys = body.records.map(tupleKey)
    if (new Set(keys).size !== keys.length) throw new HistoryRecoveryError("HISTORY_RECOVERY_UNVERIFIED")
    const selectedVersions: HistoryTuple[] = []
    // Validate every selected row before writing. A first-page UI can repair up
    // to 20 records; it must inspect a fresh snapshot for subsequent batches.
    for (const row of body.records) {
      const issue = state.issues.find(issue => tupleKey(issue) === tupleKey(row))
      if (!issue || issue.reason !== "recoverable" || issue.beforeHash !== row.beforeHash || issue.witnessHash !== row.witnessHash) throw new HistoryRecoveryError("HISTORY_RECOVERY_UNVERIFIED")
    }
    for (const row of body.records) {
      const tuple = { node: row.node, itemId: row.itemId, version: row.version }
      const slot = historySlot(db, row)!
      const witness = readWitness(db, row, slot.incarnation)!
      const damaged = readHistoryBytes(db, row)!
      const current = db.get(`SELECT nd.version FROM node_data nd LEFT JOIN node_current nc ON nc.node=nd.node AND nc.item_id=nd.item_id
        WHERE nd.node=? AND nd.item_id=? ORDER BY (nd.version=nc.version) DESC,nd.version DESC LIMIT 1`, [row.node, row.itemId]) as { version: number }
      db.run("INSERT INTO history_recovery_audit VALUES (?,?,?,?,?)", [body.requestId, row.node, row.itemId, row.version, JSON.stringify({ tuple, damaged, witness, snapshot: body.snapshot, recoveredAt: new Date().toISOString() })])
      db.run("INSERT INTO history_repair_permits VALUES (?,?,?,?,?,?,?,?)", [row.node, row.itemId, row.version, slot.incarnation, damaged.storageType, damaged.hex, witness.bytes.storageType, witness.bytes.hex])
      // The sole historical-update exception: exact verified original bytes,
      // with the damaged bytes/audit/receipt in this same transaction.
      const restored = witness.bytes.storageType === "null" ? null : Buffer.from(witness.bytes.hex, "hex").toString("utf8")
      db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=? AND typeof(data)=? AND hex(CAST(data AS BLOB))=?", [restored, row.node, row.itemId, row.version, damaged.storageType, damaged.hex])
      const changes = db.get("SELECT changes() AS count") as { count: number }
      if (changes.count !== 1 || historyHash(readHistoryBytes(db, row)) !== historyHash(witness.bytes) || historySlot(db, row)?.incarnation !== slot.incarnation) throw new HistoryRecoveryError("HISTORY_RECOVERY_STALE")
      db.run("DELETE FROM history_repair_permits WHERE node=? AND item_id=? AND version=?", [row.node, row.itemId, row.version])
      if (current.version === row.version) {
        const next = (db.get("SELECT MAX(version)+1 AS version FROM node_data WHERE node=? AND item_id=?", [row.node, row.itemId]) as { version: number }).version
        insertNodeVersion(db, row.node, row.itemId, next, restored)
        db.run("INSERT INTO node_current VALUES (?,?,?) ON CONFLICT(node,item_id) DO UPDATE SET version=excluded.version", [row.node, row.itemId, next])
        selectedVersions.push({ ...tuple, version: next })
      }
    }
    const receipt: HistoryRecoveryReceipt = { requestId: body.requestId, operation: "repair", count: body.records.length, revision: revision(db), replayed: false, selectedVersions }
    const next = (db.get("SELECT COALESCE(MAX(version),0)+1 AS version FROM node_data WHERE node='history-recovery-state' AND item_id='book'") as { version: number }).version
    insertNodeVersion(db, "history-recovery-state", "book", next, JSON.stringify(receipt))
    db.run("INSERT INTO node_current VALUES ('history-recovery-state','book',?) ON CONFLICT(node,item_id) DO UPDATE SET version=excluded.version", [next])
    return receipt
  }))
}

export function readHistoryRecoveryAudit(dbPath: string, requestId: string): unknown[] {
  return withDatabase(dbPath, false, db => {
    if (!db.get("SELECT 1 FROM history_recovery_requests WHERE request_id=?", [requestId])) throw new HistoryRecoveryError("HISTORY_RECOVERY_AUDIT_MISSING", 404)
    return (db.all("SELECT evidence FROM history_recovery_audit WHERE request_id=? ORDER BY node,item_id,version", [requestId]) as Array<{ evidence: string }>).map(row => JSON.parse(row.evidence))
  })
}
