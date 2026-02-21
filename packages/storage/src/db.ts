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
  source TEXT NOT NULL CHECK (source IN ('page', 'extract', 'crop', 'segment'))
);

CREATE TABLE IF NOT EXISTS llm_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 1,
  error_count INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS step_completions (
  step TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
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

  const rows = db.all("SELECT version FROM schema_version WHERE id = 1") as Array<{
    version: number
  }>
  const existing = rows[0]?.version ?? 0

  if (existing === SCHEMA_VERSION) return

  let version = existing

  // Migrate v5 → v6: add 'segment' to images.source CHECK constraint
  if (version === 5) {
    migrateV5toV6(db)
    version = 6
  }

  // Migrate v6 → v7: add step_completions table with backfill
  if (version === 6) {
    migrateV6toV7(db)
    version = 7
  }

  if (version === SCHEMA_VERSION) {
    upsertSchemaVersion(db, SCHEMA_VERSION)
    return
  }

  db.close()
  throw new Error(
    `Schema version mismatch: found v${existing}, expected v${SCHEMA_VERSION}`
  )
}

/**
 * Migrate v5 → v6: widen images.source CHECK to include 'segment'.
 * SQLite doesn't support ALTER CHECK, so we recreate the table.
 */
function migrateV5toV6(db: sqlite.Database): void {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`
      CREATE TABLE images_new (
        image_id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(page_id),
        path TEXT NOT NULL,
        hash TEXT NOT NULL DEFAULT '',
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('page', 'extract', 'crop', 'segment'))
      );
      INSERT INTO images_new SELECT * FROM images;
      DROP TABLE images;
      ALTER TABLE images_new RENAME TO images;
    `)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

/**
 * Migrate v6 → v7: add step_completions table and backfill from existing node_data.
 * After this migration, step completion is tracked explicitly rather than inferred.
 */
function migrateV6toV7(db: sqlite.Database): void {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS step_completions (
        step TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL
      )
    `)

    // Backfill: infer completion from existing data so previously-processed
    // books don't appear incomplete. This mapping is only used once during
    // migration — runtime code uses step_completions directly.
    const nodeRows = db.all("SELECT DISTINCT node FROM node_data") as Array<{ node: string }>
    const nodes = new Set(nodeRows.map((r) => r.node))
    const now = new Date().toISOString()

    // Most step names match their node_data node name directly
    const directSteps = [
      "metadata", "book-summary", "image-filtering", "image-segmentation",
      "image-cropping", "text-classification", "page-sectioning",
      "web-rendering", "quiz-generation", "image-captioning", "glossary",
      "text-catalog", "tts",
    ]
    for (const step of directSteps) {
      if (nodes.has(step)) {
        db.run("INSERT INTO step_completions (step, completed_at) VALUES (?, ?)", [step, now])
      }
    }

    // Steps where DB node name differs from PIPELINE step name
    if (nodes.has("text-catalog-translation")) {
      db.run("INSERT INTO step_completions (step, completed_at) VALUES (?, ?)", ["catalog-translation", now])
    }

    // extract step: check pages table
    const pageRows = db.all("SELECT COUNT(*) as count FROM pages") as Array<{ count: number }>
    if ((pageRows[0]?.count ?? 0) > 0) {
      db.run("INSERT INTO step_completions (step, completed_at) VALUES (?, ?)", ["extract", now])
    }

    // image-meaningfulness: runs inline with image-filtering
    if (nodes.has("image-filtering")) {
      db.run("INSERT OR IGNORE INTO step_completions (step, completed_at) VALUES (?, ?)", ["image-meaningfulness", now])
    }

    // translation: stored under text-classification node
    if (nodes.has("text-classification")) {
      db.run("INSERT OR IGNORE INTO step_completions (step, completed_at) VALUES (?, ?)", ["translation", now])
    }

    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

function upsertSchemaVersion(db: sqlite.Database, version: number): void {
  db.run(
    `INSERT INTO schema_version (id, version) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
    [version]
  )
}
