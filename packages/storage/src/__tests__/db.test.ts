import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { afterEach, describe, expect, it } from "vitest"
import { SCHEMA_VERSION } from "@adt/types"
import { openBookDb } from "../db.js"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

function makeDbPath(fileName: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-storage-db-test-"))
  dirs.push(dir)
  return path.join(dir, fileName)
}

describe("openBookDb", () => {
  it("creates a single-row schema_version table keyed by id", () => {
    const dbPath = makeDbPath("book.db")

    const db = openBookDb(dbPath)
    db.close()

    const raw = new sqlite.Database(dbPath)
    const columns = raw.all("PRAGMA table_info(schema_version)") as Array<{
      name: string
      pk: number
    }>
    expect(columns.some((column) => column.name === "id" && column.pk === 1)).toBe(
      true
    )

    const rows = raw.all(
      "SELECT id, version FROM schema_version ORDER BY id"
    ) as Array<{ id: number; version: number }>
    expect(rows).toEqual([{ id: 1, version: SCHEMA_VERSION }])
    raw.close()
  })

  it("migrates legacy schema_version tables without id column", () => {
    const dbPath = makeDbPath("legacy.db")
    const legacyDb = new sqlite.Database(dbPath)
    legacyDb.run("CREATE TABLE schema_version (version INTEGER NOT NULL)")
    legacyDb.run("INSERT INTO schema_version (version) VALUES (?)", [
      SCHEMA_VERSION,
    ])
    legacyDb.run("INSERT INTO schema_version (version) VALUES (?)", [
      SCHEMA_VERSION,
    ])
    legacyDb.close()

    const db = openBookDb(dbPath)
    db.close()

    const raw = new sqlite.Database(dbPath)
    const columns = raw.all("PRAGMA table_info(schema_version)") as Array<{
      name: string
      pk: number
    }>
    expect(columns.some((column) => column.name === "id" && column.pk === 1)).toBe(
      true
    )
    const rows = raw.all(
      "SELECT id, version FROM schema_version ORDER BY id"
    ) as Array<{ id: number; version: number }>
    expect(rows).toEqual([{ id: 1, version: SCHEMA_VERSION }])
    raw.close()
  })

  it("migrates v2 database to v3 adding llm_log columns", () => {
    const dbPath = makeDbPath("v2.db")
    const v2Db = new sqlite.Database(dbPath)
    v2Db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 2);
      CREATE TABLE pages (page_id TEXT PRIMARY KEY, page_number INTEGER NOT NULL, text TEXT NOT NULL);
      CREATE TABLE node_data (node TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT, PRIMARY KEY (node, item_id, version));
      CREATE TABLE images (image_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, path TEXT NOT NULL, hash TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL, height INTEGER NOT NULL, source TEXT NOT NULL);
      CREATE TABLE llm_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, data TEXT NOT NULL);
      INSERT INTO llm_log (timestamp, data) VALUES ('2024-01-01', '{"old":"entry"}');
    `)
    v2Db.close()

    const db = openBookDb(dbPath)

    const rows = db.all("SELECT id, version FROM schema_version") as Array<{
      id: number
      version: number
    }>
    expect(rows).toEqual([{ id: 1, version: SCHEMA_VERSION }])

    const cols = db.all("PRAGMA table_info(llm_log)") as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain("step")
    expect(colNames).toContain("item_id")

    // Old data preserved with default values
    const logRows = db.all("SELECT step, item_id, data FROM llm_log") as Array<{
      step: string
      item_id: string
      data: string
    }>
    expect(logRows).toHaveLength(1)
    expect(logRows[0].step).toBe("")
    expect(logRows[0].item_id).toBe("")
    expect(JSON.parse(logRows[0].data)).toEqual({ old: "entry" })

    db.close()
  })

  it("throws when schema version does not match", () => {
    const dbPath = makeDbPath("mismatch.db")
    const legacyDb = new sqlite.Database(dbPath)
    legacyDb.run("CREATE TABLE schema_version (version INTEGER NOT NULL)")
    legacyDb.run("INSERT INTO schema_version (version) VALUES (?)", [
      SCHEMA_VERSION + 1,
    ])
    legacyDb.close()

    expect(() => openBookDb(dbPath)).toThrow(
      `Schema version mismatch: found v${SCHEMA_VERSION + 1}, expected v${SCHEMA_VERSION}`
    )
  })
})
