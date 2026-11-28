import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { IDENTITY_HISTORY_NODES } from "@adt/types"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { HISTORY_EVIDENCE_SQL, nodesSql } from "../history-schema.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

/** The identity list persisted by evidence version 1 on develop. Pin it: a
 *  change needs a versioned migration and a retained-v1 fixture. */
const DEVELOP_IDENTITY_HISTORY_NODES = [
  "page-sectioning", "fixed-layout-sectioning", "web-rendering", "glossary",
  "quiz-generation", "text-catalog", "text-catalog-translation", "core-tts-catalog",
  "easy-read", "tts", "tts-timestamps", "word-timestamps", "image-captioning",
] as const

it("pins the identity-node list that defines persisted evidence version 1", () => {
  expect(IDENTITY_HISTORY_NODES).toEqual([...DEVELOP_IDENTITY_HISTORY_NODES])
})

/**
 * A book created before an identity node joined the list has the same evidence
 * tables and SQL, minus that node. Opening it must not mark the evidence
 * damaged: the trigger SQL is the persisted version-1 contract.
 */
it("opens a book whose evidence predates the current identity-node list", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-identity-compat-"))
  roots.push(root)

  const created = createBookStorage("book", root)
  try {
    created.putNodeData("web-rendering", "pg001", { sections: [] })
  } finally {
    created.close()
  }

  const { dbPath } = resolveBookPaths("book", root)
  // Use the develop list, not the current one: the test must still simulate an
  // older book if the list changes again.
  const developNodesSql = DEVELOP_IDENTITY_HISTORY_NODES.map((node) => `'${node}'`).join(",")
  const developSql = HISTORY_EVIDENCE_SQL.replaceAll(nodesSql, developNodesSql)
  const raw = new sqlite.Database(dbPath)
  try {
    for (const row of raw.all(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'history_%'",
    ) as { name: string }[]) {
      raw.exec(`DROP TRIGGER ${row.name}`)
    }
    raw.exec(developSql)
    raw.run(
      "UPDATE schema_version SET history_evidence_version=1, history_evidence_gap=0, history_legacy_capture=1 WHERE id=1",
    )
  } finally {
    raw.close()
  }

  const reopened = createBookStorage("book", root)
  try {
    expect(reopened.getLatestNodeData("web-rendering", "pg001")?.version).toBe(1)
    expect(() => reopened.readIdentityHistory!(["web-rendering"])).not.toThrow()
    // The operations that fail when the evidence gap is set must still work.
    expect(() => reopened.putNodeData("web-rendering", "pg002", { sections: [] })).not.toThrow()
  } finally {
    reopened.close()
  }

  const check = new sqlite.Database(dbPath)
  try {
    expect(
      check.get("SELECT history_evidence_gap AS gap FROM schema_version WHERE id=1"),
    ).toEqual({ gap: 0 })
  } finally {
    check.close()
  }
})
