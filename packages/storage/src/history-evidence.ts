import { createHash, randomUUID } from "node:crypto"
import type sqlite from "node-sqlite3-wasm"
import { IDENTITY_HISTORY_NODES, HistoryWitness, type HistoryBytes, type HistoryTuple, type IdentityHistoryRecord } from "@adt/types"
import { HistoryIntegrityError } from "./history-integrity.js"

export { HISTORY_EVIDENCE_SQL } from "./history-schema.js"
import { assertHistoryEvidence, nodesSql } from "./history-schema.js"
import { deflateSync, inflateSync } from "node:zlib"

/** Compressed exact proof bytes; legacy plain JSON remains readable. */
function encodeWitness(witness: HistoryWitness): string {
  return "z1:" + deflateSync(JSON.stringify(witness)).toString("base64")
}
export function decodeWitness(evidence: string): unknown {
  return JSON.parse(evidence.startsWith("z1:") ? inflateSync(Buffer.from(evidence.slice(3), "base64")).toString("utf8") : evidence)
}

/** Keep one row payload live at a time under the caller's database admission. */
export function* historyRows<T>(db: sqlite.Database, sql: string, values: (string | number)[] = []): Generator<T> {
  const statement = db.prepare(sql)
  try { for (const row of statement.iterate(values)) yield row as T }
  finally { statement.finalize() }
}

export function historyHash(value: unknown): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, child]) => [key, canonical(child)])) : value
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}
export function tupleKey(row: HistoryTuple): string { return JSON.stringify([row.node, row.itemId, row.version]) }
export function historyBookId(db: sqlite.Database): string | null {
  return (db.get("SELECT book_id FROM history_identity WHERE id=1") as { book_id: string } | undefined)?.book_id ?? null
}
export function readHistoryBytes(db: sqlite.Database, row: HistoryTuple): HistoryBytes | undefined {
  return db.get("SELECT typeof(data) AS storageType, hex(CAST(data AS BLOB)) AS hex FROM node_data WHERE node=? AND item_id=? AND version=?", [row.node, row.itemId, row.version]) as HistoryBytes | undefined
}
export function decodeHistoryBytes(bytes: HistoryBytes): unknown {
  if (bytes.storageType === "null" && bytes.hex === "") return null
  if (bytes.storageType !== "text") throw new Error("Unsupported historical storage type")
  const raw = Buffer.from(bytes.hex, "hex")
  const text = raw.toString("utf8")
  if (!Buffer.from(text).equals(raw)) throw new Error("Invalid historical UTF-8")
  return JSON.parse(text)
}
export function historySlot(db: sqlite.Database, row: HistoryTuple): { incarnation: string; present: number } | undefined {
  return db.get("SELECT incarnation,present FROM history_slots WHERE node=? AND item_id=? AND version=?", [row.node, row.itemId, row.version]) as { incarnation: string; present: number } | undefined
}
export function verifyWitness(raw: unknown, bookId: string | null): HistoryWitness {
  const witness = HistoryWitness.parse(raw)
  const { digest, ...proof } = witness
  if (!bookId || witness.bookId !== bookId || digest !== historyHash(proof)) throw new Error("Invalid historical witness")
  decodeHistoryBytes(witness.bytes)
  return witness
}
export function readWitness(db: sqlite.Database, row: HistoryTuple, incarnation: string): HistoryWitness | undefined {
  const result = db.get("SELECT evidence FROM history_witnesses WHERE node=? AND item_id=? AND version=? AND incarnation=?", [row.node, row.itemId, row.version, incarnation]) as { evidence: string } | undefined
  if (!result) return undefined
  const witness = verifyWitness(decodeWitness(result.evidence), historyBookId(db))
  if (tupleKey(witness) !== tupleKey(row) || witness.incarnation !== incarnation) throw new Error("Mismatched historical witness")
  return witness
}

/** Caller owns the transaction. Capture never overwrites an existing witness
 * or manufactures evidence from malformed bytes. GET never calls this. */
export function captureHistoryWitness(db: sqlite.Database, row: HistoryTuple, origin: HistoryWitness["origin"]): void {
  assertHistoryEvidence(db)
  const bytes = readHistoryBytes(db, row)
  if (!bytes) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
  try { decodeHistoryBytes(bytes) } catch { throw new HistoryIntegrityError(row.node, row.itemId, row.version) }
  let slot = historySlot(db, row)
  if (!slot) {
    if (db.get("SELECT 1 FROM history_witnesses WHERE node=? AND item_id=? AND version=?", [row.node, row.itemId, row.version])) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
    db.run("INSERT INTO history_slots VALUES (?,?,?,lower(hex(randomblob(16))),1)", [row.node, row.itemId, row.version])
    slot = historySlot(db, row)!
  }
  if (slot.present !== 1) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
  const prior = readWitness(db, row, slot.incarnation)
  if (prior) {
    if (historyHash(prior.bytes) !== historyHash(bytes)) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
    return
  }
  let bookId = historyBookId(db)
  if (!bookId) { bookId = randomUUID(); db.run("INSERT INTO history_identity VALUES (1,?)", [bookId]) }
  const proof = { ...row, bookId, incarnation: slot.incarnation, bytes, origin }
  db.run("INSERT INTO history_witnesses VALUES (?,?,?,?,?)", [row.node, row.itemId, row.version, slot.incarnation, encodeWitness({ ...proof, digest: historyHash(proof) })])
}

/** Every supported INSERT records its witness in the same transaction. */
export function insertNodeVersion(db: sqlite.Database, node: string, itemId: string, version: number, raw: string | null, origin: HistoryWitness["origin"] = "write"): void {
  db.run("INSERT INTO node_data (node,item_id,version,data) VALUES (?,?,?,?)", [node, itemId, version, raw])
  if ((IDENTITY_HISTORY_NODES as readonly string[]).includes(node)) captureHistoryWitness(db, { node: node as HistoryTuple["node"], itemId, version }, origin)
}

export function identityTuples(db: sqlite.Database): HistoryTuple[] {
  return db.all(`SELECT node,item_id AS itemId,version FROM node_data WHERE node IN (${nodesSql}) ORDER BY node,item_id,version`) as HistoryTuple[]
}
export function checkpointBeforeRetirement(db: sqlite.Database, itemId?: string): void {
  for (const row of identityTuples(db)) if (itemId === undefined || row.itemId === itemId) captureHistoryWitness(db, row, "checkpoint")
}

/** Caller has validated the source with readIdentityHistory and owns the target
 * transaction. Import reservations as retired target witnesses, never as active
 * content or as source-book recovery authority. Keep the original tuple for audit.
 * Future reuse of a target tuple gets a new incarnation through the normal trigger. */
export function importHistoryReservations(db: sqlite.Database, records: IdentityHistoryRecord[], sourceBookId: string | null): void {
  assertHistoryEvidence(db)
  if (!records.length) return
  let bookId = historyBookId(db)
  if (!bookId) { bookId = randomUUID(); db.run("INSERT INTO history_identity VALUES (1,?)", [bookId]) }
  const versions = new Map<string, number>()
  for (const row of db.all("SELECT node,item_id,MAX(version) AS version FROM (SELECT node,item_id,version FROM node_data UNION ALL SELECT node,item_id,version FROM history_slots) GROUP BY node,item_id") as { node: string; item_id: string; version: number }[]) versions.set(JSON.stringify([row.node, row.item_id]), row.version)
  for (const record of records) {
    const key = JSON.stringify([record.node, record.itemId])
    const version = (versions.get(key) ?? 0) + 1
    versions.set(key, version)
    const incarnation = randomUUID().replaceAll("-", "")
    const bytes = { storageType: "text", hex: Buffer.from(JSON.stringify(record.data)).toString("hex").toUpperCase() }
    const { data: _data, ...sourceTuple } = record
    const proof = { node: record.node, itemId: record.itemId, version, incarnation, bookId, bytes, origin: "part-import" as const, importedFrom: { ...sourceTuple, bookId: sourceBookId } }
    db.run("INSERT INTO history_slots VALUES (?,?,?,?,0)", [record.node, record.itemId, version, incarnation])
    db.run("INSERT INTO history_witnesses VALUES (?,?,?,?,?)", [record.node, record.itemId, version, incarnation, encodeWitness({ ...proof, digest: historyHash(proof) })])
  }
}

/** Proof input to the existing allocation factories only. A retired witness
 * reserves IDs; it never supplies current content, ownership or freshness. */
export function readIdentityHistory(db: sqlite.Database, nodes: readonly string[], itemId?: string): IdentityHistoryRecord[] {
  assertHistoryEvidence(db)
  if (!nodes.length) return []
  const where = `node IN (${nodes.map(() => "?").join(",")})${itemId === undefined ? "" : " AND item_id=?"}`
  const values = [...nodes, ...(itemId === undefined ? [] : [itemId])]
  const result: IdentityHistoryRecord[] = []
  const witnessed = new Map<string, string>()
  const bookId = historyBookId(db)
  for (const entry of historyRows<HistoryTuple & { incarnation: string; evidence: string }>(db, `SELECT node,item_id AS itemId,version,incarnation,evidence FROM history_witnesses WHERE ${where} ORDER BY node,item_id,version,incarnation`, values)) {
    try {
      if (!historySlot(db, entry)) throw new Error("Missing insertion continuity")
      const witness = verifyWitness(decodeWitness(entry.evidence), bookId)
      if (tupleKey(witness) !== tupleKey(entry) || witness.incarnation !== entry.incarnation) throw new Error("Witness tuple changed")
      witnessed.set(`${tupleKey(entry)}:${entry.incarnation}`, historyHash(witness.bytes))
      result.push({ node: entry.node, itemId: entry.itemId, version: entry.version, data: decodeHistoryBytes(witness.bytes) })
    } catch { throw new HistoryIntegrityError(entry.node, entry.itemId, entry.version) }
  }
  const extant = new Set<string>()
  for (const row of historyRows<HistoryTuple>(db, `SELECT node,item_id AS itemId,version FROM node_data WHERE ${where} ORDER BY node,item_id,version`, values)) {
    extant.add(tupleKey(row))
    try {
      const bytes = readHistoryBytes(db, row)!
      const slot = historySlot(db, row)
      if (slot?.present === 0) throw new Error("Lost insertion continuity")
      const proof = slot && witnessed.get(`${tupleKey(row)}:${slot.incarnation}`)
      if (proof && proof !== historyHash(bytes)) throw new Error("Changed payload")
      if (!proof) result.push({ ...row, data: decodeHistoryBytes(bytes) })
    } catch { throw new HistoryIntegrityError(row.node, row.itemId, row.version) }
  }
  for (const row of historyRows<HistoryTuple & { incarnation: string; present: number }>(db, `SELECT node,item_id AS itemId,version,incarnation,present FROM history_slots WHERE ${where}`, values)) {
    if (extant.has(tupleKey(row))) continue
    if (row.present !== 0 || !witnessed.has(`${tupleKey(row)}:${row.incarnation}`)) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
  }
  return result
}
