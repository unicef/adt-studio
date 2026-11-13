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
function verifyWitnessProof(raw: unknown, bookId: string | null): HistoryWitness {
  const witness = HistoryWitness.parse(raw)
  const { digest, ...proof } = witness
  if (!bookId || witness.bookId !== bookId || digest !== historyHash(proof)) throw new Error("Invalid historical witness")
  return witness
}
export function verifyWitness(raw: unknown, bookId: string | null): HistoryWitness {
  const witness = verifyWitnessProof(raw, bookId)
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
 * or manufactures evidence from malformed bytes. */
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

export function identityTuples(db: sqlite.Database, itemId?: string): HistoryTuple[] {
  return db.all(`SELECT node,item_id AS itemId,version FROM node_data WHERE node IN (${nodesSql})${itemId === undefined ? "" : " AND item_id=?"} ORDER BY node,item_id,version`, itemId === undefined ? [] : [itemId]) as HistoryTuple[]
}

/** One-time first-open checkpoint, in the tracking installation transaction.
 * Only previously untracked rows qualify. Missing slots with existing proof,
 * changed incarnations and unreadable bytes must never acquire fresh authority
 * merely because the book was opened. Later old-writer rows need explicit
 * checkpointing; reopening is not a rolling backup or an automatic repair. */
export function captureLegacyHistory(db: sqlite.Database): void {
  for (const row of historyRows<HistoryTuple>(db, `
    SELECT n.node,n.item_id AS itemId,n.version FROM node_data n
    WHERE n.node IN (${nodesSql})
      AND NOT EXISTS (SELECT 1 FROM history_slots s WHERE s.node=n.node AND s.item_id=n.item_id AND s.version=n.version)
      AND NOT EXISTS (SELECT 1 FROM history_witnesses w WHERE w.node=n.node AND w.item_id=n.item_id AND w.version=n.version)
    ORDER BY n.node,n.item_id,n.version`)) {
    const bytes = readHistoryBytes(db, row)!
    try { decodeHistoryBytes(bytes) } catch { continue }
    captureHistoryWitness(db, row, "checkpoint")
  }
}
export function checkpointBeforeRetirement(db: sqlite.Database, itemId?: string): void {
  for (const row of identityTuples(db, itemId)) captureHistoryWitness(db, row, "checkpoint")
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

type DecodedIdentity = { hash: string; record: IdentityHistoryRecord }
type IdentityProjection = (record: IdentityHistoryRecord) => readonly string[]
type ProjectedIdentity = { hash: string; values: readonly string[]; size: number }
const projections = new WeakMap<IdentityProjection, { rows: Map<string, ProjectedIdentity>; size: number }>()
const projectionBudget = 8 * 1024 * 1024

/** Only compact identity strings are cached, never decoded history payloads.
 * Exact book/tuple/incarnation/evidence keys avoid treating a known identity as
 * proof of unchanged bytes. The scan still validates schema, slots and extant
 * payload hashes even when this projection is warm. */
export function readIdentityHistoryIds(db: sqlite.Database, nodes: readonly string[], bookKey: string, project: IdentityProjection, itemId?: string): string[] {
  let cache = projections.get(project)
  if (!cache) { cache = { rows: new Map(), size: 0 }; projections.set(project, cache) }
  return scanIdentityHistory(db, nodes, itemId, (identity, decode) => {
    const key = JSON.stringify([bookKey, identity])
    const hit = cache.rows.get(key)
    if (hit) { cache.rows.delete(key); cache.rows.set(key, hit); return hit }
    const decoded = decode()
    const values = [...new Set(project(decoded.record))]
    const size = 2 * (key.length + values.reduce((sum, value) => sum + value.length, 0)) + 128
    const result = { hash: decoded.hash, values, size }
    if (size <= projectionBudget) {
      while (cache.rows.size && (cache.size + size > projectionBudget || cache.rows.size >= 10000)) {
        const oldest = cache.rows.keys().next().value!
        cache.size -= cache.rows.get(oldest)!.size
        cache.rows.delete(oldest)
      }
      cache.rows.set(key, result); cache.size += size
    }
    return result
  })
}

/** Full exact records remain available to transfer/recovery callers. */
export function readIdentityHistory(db: sqlite.Database, nodes: readonly string[], itemId?: string): IdentityHistoryRecord[] {
  return scanIdentityHistory(db, nodes, itemId, (_identity, decode) => {
    const decoded = decode()
    return { hash: decoded.hash, values: [decoded.record] }
  })
}

/** Proof input to allocation only. Retired witnesses reserve IDs; they never
 * supply current content, ownership or freshness. Stream one payload at a time
 * so ID projections need not retain every decoded version simultaneously. */
function scanIdentityHistory<T>(db: sqlite.Database, nodes: readonly string[], itemId: string | undefined,
  read: (identity: string, decode: () => DecodedIdentity) => { hash: string; values: readonly T[] }): T[] {
  assertHistoryEvidence(db)
  if (!nodes.length) return []
  const where = `node IN (${nodes.map(() => "?").join(",")})${itemId === undefined ? "" : " AND item_id=?"}`
  const values = [...nodes, ...(itemId === undefined ? [] : [itemId])]
  const result: T[] = []
  const witnessed = new Map<string, string>()
  const bookId = historyBookId(db)
  for (const entry of historyRows<HistoryTuple & { incarnation: string; evidence: string }>(db, `SELECT node,item_id AS itemId,version,incarnation,evidence FROM history_witnesses WHERE ${where} ORDER BY node,item_id,version,incarnation`, values)) {
    try {
      if (!historySlot(db, entry)) throw new Error("Missing insertion continuity")
      const identity = JSON.stringify([bookId, tupleKey(entry), entry.incarnation, createHash("sha256").update(entry.evidence).digest("hex")])
      const projected = read(identity, () => {
        const witness = verifyWitnessProof(decodeWitness(entry.evidence), bookId)
        if (tupleKey(witness) !== tupleKey(entry) || witness.incarnation !== entry.incarnation) throw new Error("Witness tuple changed")
        return { hash: historyHash(witness.bytes), record: { node: entry.node, itemId: entry.itemId, version: entry.version, data: decodeHistoryBytes(witness.bytes) } }
      })
      witnessed.set(`${tupleKey(entry)}:${entry.incarnation}`, projected.hash)
      for (const value of projected.values) result.push(value)
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
      const hash = historyHash(bytes)
      if (proof && proof !== hash) throw new Error("Changed payload")
      if (!proof) {
        const projected = read(JSON.stringify([bookId, tupleKey(row), slot?.incarnation, "unwitnessed", hash]), () => ({ hash, record: { ...row, data: decodeHistoryBytes(bytes) } }))
        for (const value of projected.values) result.push(value)
      }
    } catch { throw new HistoryIntegrityError(row.node, row.itemId, row.version) }
  }
  for (const row of historyRows<HistoryTuple & { incarnation: string; present: number }>(db, `SELECT node,item_id AS itemId,version,incarnation,present FROM history_slots WHERE ${where}`, values)) {
    if (extant.has(tupleKey(row))) continue
    if (row.present !== 0 || !witnessed.has(`${tupleKey(row)}:${row.incarnation}`)) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
  }
  return result
}
