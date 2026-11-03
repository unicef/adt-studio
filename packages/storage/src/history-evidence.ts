import { createHash, randomUUID } from "node:crypto"
import type sqlite from "node-sqlite3-wasm"
import { IDENTITY_HISTORY_NODES, HistoryWitness, type HistoryBytes, type HistoryTuple, type IdentityHistoryRecord } from "@adt/types"
import { HistoryIntegrityError } from "./history-integrity.js"

const nodesSql = IDENTITY_HISTORY_NODES.map(node => `'${node}'`).join(",")
const immutableKeys = {
  history_identity: ["id"],
  history_witnesses: ["node", "item_id", "version", "incarnation"],
  history_recovery_audit: ["request_id", "node", "item_id", "version"],
  history_recovery_requests: ["request_id"],
}

/** Additive schema-14 evidence. Built-in SQL only: older applications must also
 * record tuple reuse. Empty tables do not make an unprocessed book processed. */
export const HISTORY_EVIDENCE_SQL = `
CREATE TABLE IF NOT EXISTS history_identity (id INTEGER PRIMARY KEY CHECK(id=1), book_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history_slots (
  node TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL,
  incarnation TEXT NOT NULL, present INTEGER NOT NULL,
  PRIMARY KEY(node,item_id,version)
);
CREATE TABLE IF NOT EXISTS history_witnesses (
  node TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL,
  incarnation TEXT NOT NULL, evidence TEXT NOT NULL,
  PRIMARY KEY(node,item_id,version,incarnation)
);
CREATE TABLE IF NOT EXISTS history_repair_permits (
  node TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL,
  incarnation TEXT NOT NULL, old_type TEXT NOT NULL, old_hex TEXT NOT NULL,
  new_type TEXT NOT NULL, new_hex TEXT NOT NULL,
  PRIMARY KEY(node,item_id,version)
);
CREATE TABLE IF NOT EXISTS history_recovery_audit (
  request_id TEXT NOT NULL, node TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL,
  evidence TEXT NOT NULL, PRIMARY KEY(request_id,node,item_id,version)
);
CREATE TABLE IF NOT EXISTS history_recovery_requests (request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, receipt TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS history_track_insert AFTER INSERT ON node_data WHEN NEW.node IN (${nodesSql}) BEGIN
  INSERT INTO history_slots SELECT NEW.node,NEW.item_id,NEW.version,lower(hex(randomblob(16))),1 WHERE NEW.node IN (${nodesSql})
  ON CONFLICT(node,item_id,version) DO UPDATE SET incarnation=excluded.incarnation,present=1;
END;
CREATE TRIGGER IF NOT EXISTS history_track_delete AFTER DELETE ON node_data WHEN OLD.node IN (${nodesSql}) BEGIN
  INSERT INTO history_slots SELECT OLD.node,OLD.item_id,OLD.version,lower(hex(randomblob(16))),0 WHERE OLD.node IN (${nodesSql})
  ON CONFLICT(node,item_id,version) DO UPDATE SET present=0;
END;
CREATE TRIGGER IF NOT EXISTS history_track_update AFTER UPDATE ON node_data
WHEN (OLD.node IN (${nodesSql}) OR NEW.node IN (${nodesSql})) AND NOT EXISTS (
  SELECT 1 FROM history_repair_permits p JOIN history_slots s USING(node,item_id,version)
  WHERE p.node=OLD.node AND p.item_id=OLD.item_id AND p.version=OLD.version
    AND OLD.node=NEW.node AND OLD.item_id=NEW.item_id AND OLD.version=NEW.version
    AND p.incarnation=s.incarnation AND s.present=1
    AND p.old_type=typeof(OLD.data) AND p.old_hex=hex(CAST(OLD.data AS BLOB))
    AND p.new_type=typeof(NEW.data) AND p.new_hex=hex(CAST(NEW.data AS BLOB))
) BEGIN
  INSERT INTO history_slots SELECT OLD.node,OLD.item_id,OLD.version,lower(hex(randomblob(16))),0 WHERE OLD.node IN (${nodesSql})
  ON CONFLICT(node,item_id,version) DO UPDATE SET present=0;
  INSERT INTO history_slots SELECT NEW.node,NEW.item_id,NEW.version,lower(hex(randomblob(16))),1 WHERE NEW.node IN (${nodesSql})
  ON CONFLICT(node,item_id,version) DO UPDATE SET incarnation=excluded.incarnation,present=1;
END;
${Object.keys(immutableKeys).map(table => ["UPDATE", "DELETE"].map(operation => `
CREATE TRIGGER IF NOT EXISTS ${table}_${operation.toLowerCase()} BEFORE ${operation} ON ${table}
BEGIN SELECT RAISE(ABORT,'Historical recovery evidence is append-only'); END;`).join("\n")).join("\n")}
${Object.entries(immutableKeys).map(([table, keys]) => `
CREATE TRIGGER IF NOT EXISTS ${table}_replace BEFORE INSERT ON ${table}
WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${keys.map(key => `${key}=NEW.${key}`).join(" AND ")})
BEGIN SELECT RAISE(ABORT,'Historical recovery evidence is append-only'); END;`).join("\n")}
`

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
  const witness = verifyWitness(JSON.parse(result.evidence), historyBookId(db))
  if (tupleKey(witness) !== tupleKey(row) || witness.incarnation !== incarnation) throw new Error("Mismatched historical witness")
  return witness
}

/** Caller owns the transaction. Capture never overwrites an existing witness
 * or manufactures evidence from malformed bytes. GET never calls this. */
export function captureHistoryWitness(db: sqlite.Database, row: HistoryTuple, origin: HistoryWitness["origin"]): void {
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
  db.run("INSERT INTO history_witnesses VALUES (?,?,?,?,?)", [row.node, row.itemId, row.version, slot.incarnation, JSON.stringify({ ...proof, digest: historyHash(proof) })])
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

/** Proof input to the existing allocation factories only. A retired witness
 * reserves IDs; it never supplies current content, ownership or freshness. */
export function readIdentityHistory(db: sqlite.Database, nodes: readonly string[], itemId?: string): IdentityHistoryRecord[] {
  const selected = (row: HistoryTuple) => nodes.includes(row.node) && (itemId === undefined || row.itemId === itemId)
  const result: IdentityHistoryRecord[] = []
  const witnessed = new Set<string>()
  const bookId = historyBookId(db)
  for (const entry of db.all("SELECT node,item_id AS itemId,version,incarnation,evidence FROM history_witnesses ORDER BY node,item_id,version,incarnation") as Array<HistoryTuple & { incarnation: string; evidence: string }>) {
    if (!selected(entry)) continue
    try {
      if (!historySlot(db, entry)) throw new Error("Missing insertion continuity")
      const witness = verifyWitness(JSON.parse(entry.evidence), bookId)
      if (tupleKey(witness) !== tupleKey(entry) || witness.incarnation !== entry.incarnation) throw new Error("Witness tuple changed")
      witnessed.add(`${tupleKey(entry)}:${entry.incarnation}`)
      result.push({ node: entry.node, itemId: entry.itemId, version: entry.version, data: decodeHistoryBytes(witness.bytes) })
    } catch { throw new HistoryIntegrityError(entry.node, entry.itemId, entry.version) }
  }
  const extant = new Set<string>()
  for (const row of identityTuples(db)) {
    if (!selected(row)) continue
    extant.add(tupleKey(row))
    try {
      const bytes = readHistoryBytes(db, row)!
      const slot = historySlot(db, row)
      if (slot?.present === 0) throw new Error("Lost insertion continuity")
      const witness = slot && readWitness(db, row, slot.incarnation)
      if (witness && historyHash(witness.bytes) !== historyHash(bytes)) throw new Error("Changed payload")
      result.push({ ...row, data: decodeHistoryBytes(bytes) })
    } catch { throw new HistoryIntegrityError(row.node, row.itemId, row.version) }
  }
  for (const row of db.all("SELECT node,item_id AS itemId,version,incarnation,present FROM history_slots") as Array<HistoryTuple & { incarnation: string; present: number }>) {
    if (!selected(row) || extant.has(tupleKey(row))) continue
    if (row.present !== 0 || !witnessed.has(`${tupleKey(row)}:${row.incarnation}`)) throw new HistoryIntegrityError(row.node, row.itemId, row.version)
  }
  return result
}
