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

  it("migrates v13 books with each newest entity version still active", () => {
    const dbPath = makeDbPath("v13-book.db")
    const old = new sqlite.Database(dbPath)
    old.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 13);

      CREATE TABLE node_data (
        node TEXT NOT NULL,
        item_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        data TEXT,
        PRIMARY KEY (node, item_id, version)
      );
      INSERT INTO node_data (node, item_id, version, data) VALUES
        ('web-rendering', 'pg001', 1, '{"html":"first"}'),
        ('web-rendering', 'pg001', 2, '{"html":"newest"}'),
        ('quiz-generation', 'book', 1, '{"quizzes":[]}');
    `)
    old.close()

    const migrated = openBookDb(dbPath)
    const schemaVersion = migrated.all(
      "SELECT version FROM schema_version WHERE id = 1"
    ) as Array<{ version: number }>
    expect(schemaVersion).toEqual([{ version: SCHEMA_VERSION }])

    const activeVersions = migrated.all(
      `SELECT node, item_id AS itemId, version
       FROM node_current
       ORDER BY node, item_id`
    ) as Array<{ node: string; itemId: string; version: number }>
    expect(activeVersions).toEqual([
      { node: "quiz-generation", itemId: "book", version: 1 },
      { node: "web-rendering", itemId: "pg001", version: 2 },
    ])

    const storedVersions = migrated.all(
      `SELECT node, item_id AS itemId, version, data
       FROM node_data
       ORDER BY node, item_id, version`
    ) as Array<{
      node: string
      itemId: string
      version: number
      data: string
    }>
    expect(storedVersions).toEqual([
      {
        node: "quiz-generation",
        itemId: "book",
        version: 1,
        data: '{"quizzes":[]}',
      },
      {
        node: "web-rendering",
        itemId: "pg001",
        version: 1,
        data: '{"html":"first"}',
      },
      {
        node: "web-rendering",
        itemId: "pg001",
        version: 2,
        data: '{"html":"newest"}',
      },
    ])
    migrated.close()
  })

  it("throws when schema version does not match", () => {
    const dbPath = makeDbPath("mismatch.db")
    const old = new sqlite.Database(dbPath)
    old.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 1);
    `)
    old.close()

    expect(() => openBookDb(dbPath)).toThrow(
      `Schema version mismatch: found v1, expected v${SCHEMA_VERSION}`
    )
  })
})
