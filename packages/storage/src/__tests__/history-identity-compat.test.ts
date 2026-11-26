import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { HISTORY_EVIDENCE_SQL, nodesSql } from "../history-schema.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
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
  // Simulate the previous build by rewriting only the trigger list. When the
  // current list differs, initHistoryEvidence must not silently accept it.
  const legacyNodesSql = nodesSql.replace(/,'element-audio'$/, "")
  const legacySql = HISTORY_EVIDENCE_SQL.replaceAll(nodesSql, legacyNodesSql)
  const raw = new sqlite.Database(dbPath)
  try {
    for (const row of raw.all(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'history_%'",
    ) as { name: string }[]) {
      raw.exec(`DROP TRIGGER ${row.name}`)
    }
    raw.exec(legacySql)
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
