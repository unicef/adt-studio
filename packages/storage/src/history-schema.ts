import type sqlite from "node-sqlite3-wasm"
import { IDENTITY_HISTORY_NODES } from "@adt/types"
import { HistoryIntegrityError } from "./history-integrity.js"

export const nodesSql = IDENTITY_HISTORY_NODES.map(node => `'${node}'`).join(",")
const immutableKeys = {
  history_identity: ["id"],
  history_witnesses: ["node", "item_id", "version", "incarnation"],
  history_recovery_audit: ["request_id", "node", "item_id", "version"],
  history_recovery_requests: ["request_id"],
}

/** Additive schema-14 evidence. Built-in SQL only: older applications must also
 * record tuple reuse. Empty tables do not make an unprocessed book processed.
 * This SQL and its identity-node list define persisted evidence version 1.
 * Changing either requires a versioned migration that verifies the old format
 * before changing it, with retained-v1 fixtures and missing-object controls.
 * Recreating missing objects must never be treated as an upgrade or proof. */
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


function definitions(sql: string): Map<string, string> {
  return new Map(sql.trim().split(/\n(?=CREATE)/).map(part => {
    const normalized = part.trim().replace(/ IF NOT EXISTS/g, "").replace(/;$/, "").replace(/\s+/g, " ")
    return [normalized.match(/^CREATE (?:TABLE|TRIGGER) (\w+)/)![1], normalized]
  }))
}
const original = definitions(HISTORY_EVIDENCE_SQL)
const expected = original
function schemaMatches(db: sqlite.Database, required: Map<string, string>): boolean {
  const actual = new Map((db.all("SELECT name,sql FROM sqlite_master WHERE name LIKE 'history_%'") as { name: string; sql: string | null }[]).map(row => [row.name, row.sql?.trim().replace(/;$/, "").replace(/\s+/g, " ")]))
  return [...required].every(([name, sql]) => actual.get(name) === sql)
}

/** Bootstrap only a genuinely untracked book. Never recreate lost objects and
 * erase evidence of a tracking gap. The schema-version row survives loss of all
 * recovery tables; older runtimes use named columns and retain this marker. */
export function initHistoryEvidence(db: sqlite.Database, captureLegacy: (db: sqlite.Database) => void): void {
  const columns = new Set((db.all("PRAGMA table_info(schema_version)") as { name: string }[]).map(row => row.name))
  if (!columns.has("history_evidence_version")) db.exec("ALTER TABLE schema_version ADD COLUMN history_evidence_version INTEGER")
  if (!columns.has("history_evidence_gap")) db.exec("ALTER TABLE schema_version ADD COLUMN history_evidence_gap INTEGER NOT NULL DEFAULT 0")
  if (!columns.has("history_legacy_capture")) db.exec("ALTER TABLE schema_version ADD COLUMN history_legacy_capture INTEGER NOT NULL DEFAULT 0")
  const marker = db.get("SELECT history_evidence_version AS version,history_evidence_gap AS gap,history_legacy_capture AS captured FROM schema_version WHERE id=1") as { version: number | null; gap: number; captured: number }
  if (marker.gap) return
  const any = db.get("SELECT 1 FROM sqlite_master WHERE name LIKE 'history_%' LIMIT 1")
  const valid = marker.version === 1 ? schemaMatches(db, expected) : !any || schemaMatches(db, original)
  if (!valid) { db.run("UPDATE schema_version SET history_evidence_gap=1 WHERE id=1"); return }
  if (marker.version === 1 && marker.captured === 1) return
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(HISTORY_EVIDENCE_SQL)
    db.run("UPDATE schema_version SET history_evidence_version=1 WHERE id=1")
    // The initial readable legacy checkpoint and its completion marker commit
    // with tracking installation. A failed capture cannot leave partial proof.
    if (marker.captured !== 1) captureLegacy(db)
    db.run("UPDATE schema_version SET history_legacy_capture=1 WHERE id=1")
    db.exec("COMMIT")
  } catch (error) { db.exec("ROLLBACK"); throw error }
}

/** Ordinary reads remain available; operations that depend on continuity do not. */
export function assertHistoryEvidence(db: sqlite.Database): void {
  const marker = db.get("SELECT history_evidence_version AS version,history_evidence_gap AS gap FROM schema_version WHERE id=1") as { version: number | null; gap: number }
  if (marker.version !== 1 || marker.gap || !schemaMatches(db, expected)) throw new HistoryIntegrityError("history-evidence", "book", 0)
}
