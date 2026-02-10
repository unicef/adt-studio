import sqlite from "node-sqlite3-wasm"
import { SCHEMA_VERSION } from "@adt/types"

const { Database } = sqlite

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  page_id TEXT PRIMARY KEY,
  page_number INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS node_data (
  node TEXT NOT NULL,
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT,
  PRIMARY KEY (node, item_id, version)
);

CREATE TABLE IF NOT EXISTS images (
  image_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(page_id),
  path TEXT NOT NULL,
  hash TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('page', 'extract', 'crop'))
);

CREATE TABLE IF NOT EXISTS llm_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL
);
`

export function openBookDb(dbPath: string): sqlite.Database {
  const db = new Database(dbPath)
  db.exec("PRAGMA foreign_keys = ON")
  initSchema(db)
  return db
}

function initSchema(db: sqlite.Database): void {
  const tables = db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  )

  db.exec(SCHEMA_SQL)

  if (tables.length === 0) {
    upsertSchemaVersion(db, SCHEMA_VERSION)
    return
  }

  migrateLegacySchemaVersionTable(db)
  const rows = db.all("SELECT version FROM schema_version WHERE id = 1") as Array<{
    version: number
  }>
  const existing = rows[0]?.version ?? 0

  if (existing === SCHEMA_VERSION) return

  if (existing > SCHEMA_VERSION) {
    db.close()
    throw new Error(
      `Schema version mismatch: found v${existing}, expected v${SCHEMA_VERSION}`
    )
  }

  migrate(db, existing)
}

function upsertSchemaVersion(db: sqlite.Database, version: number): void {
  db.run(
    `INSERT INTO schema_version (id, version) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
    [version]
  )
}

function migrate(db: sqlite.Database, from: number): void {
  db.exec("BEGIN IMMEDIATE")
  try {
    if (from < 3) {
      // v2 → v3: add step + item_id columns to llm_log
      const cols = db.all("PRAGMA table_info(llm_log)") as Array<{ name: string }>
      const colNames = new Set(cols.map((c) => c.name))
      if (!colNames.has("step")) {
        db.run("ALTER TABLE llm_log ADD COLUMN step TEXT NOT NULL DEFAULT ''")
      }
      if (!colNames.has("item_id")) {
        db.run("ALTER TABLE llm_log ADD COLUMN item_id TEXT NOT NULL DEFAULT ''")
      }
    }
    upsertSchemaVersion(db, SCHEMA_VERSION)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

function migrateLegacySchemaVersionTable(db: sqlite.Database): void {
  const columns = db.all("PRAGMA table_info(schema_version)") as Array<{
    name: string
  }>
  const hasIdColumn = columns.some((column) => column.name === "id")
  if (hasIdColumn) {
    return
  }

  db.exec("BEGIN IMMEDIATE")
  try {
    const rows = db.all("SELECT version FROM schema_version") as Array<{
      version: number
    }>
    const latestVersion = rows.reduce(
      (maxVersion, row) => Math.max(maxVersion, row.version),
      0
    )

    db.run("ALTER TABLE schema_version RENAME TO schema_version_legacy")
    db.run(
      `CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      )`
    )
    upsertSchemaVersion(db, latestVersion)
    db.run("DROP TABLE schema_version_legacy")
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}
