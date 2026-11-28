import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import type { MockInstance } from "vitest"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"
import { openBookDb } from "../db.js"
import { HISTORY_EVIDENCE_SQL, readIdentityHistoryIds } from "../history-evidence.js"
import { HistoryIntegrityError } from "../history-integrity.js"

it("bounds identity point-statement preparation per scan and finalizes on success and damage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-statements-"))
  const storage = createBookStorage("book", root)
  try {
    for (let n = 1; n <= 24; n++) storage.putNodeData("page-sectioning", "p1", { sectionId: `p1_sec${n}` })
  } finally { storage.close() }
  const { dbPath } = resolveBookPaths("book", root)
  const db = openBookDb(dbPath)
  const pointStatements: Array<{ sql: string; finalized: MockInstance }> = []
  const prepare = db.prepare.bind(db)
  const spy = vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = prepare(sql)
    if (sql.includes("WHERE node=? AND item_id=? AND version=?")) {
      pointStatements.push({ sql, finalized: vi.spyOn(statement, "finalize") })
    }
    return statement
  })
  const project = (row: { data: unknown }) => [(row.data as { sectionId: string }).sectionId]
  try {
    // Both cold and warm projections must keep preparation bounded as history grows.
    for (let run = 0; run < 2; run++) {
      pointStatements.length = 0
      spy.mockClear()
      expect(readIdentityHistoryIds(db, ["page-sectioning"], dbPath, project)).toEqual(
        Array.from({ length: 24 }, (_, n) => `p1_sec${n + 1}`),
      )
      expect(pointStatements).toHaveLength(2)
      expect(spy.mock.calls.length).toBeLessThan(24)
      expect(new Set(pointStatements.map(row => row.sql)).size).toBe(2)
      for (const row of pointStatements) expect(row.finalized).toHaveBeenCalledTimes(1)
    }
    // Simulate physical damage outside the normal SQL tracking protocol.
    db.exec("DROP TRIGGER history_track_update")
    db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=?", ["{broken", "page-sectioning", "p1", 12])
    db.exec(HISTORY_EVIDENCE_SQL)
    pointStatements.length = 0
    spy.mockClear()
    let error: unknown
    try { readIdentityHistoryIds(db, ["page-sectioning"], dbPath, project) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(HistoryIntegrityError)
    expect(error).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED", node: "page-sectioning", itemId: "p1", version: 12 })
    expect(spy.mock.calls.length).toBeLessThan(24)
    expect(pointStatements).toHaveLength(2)
    for (const row of pointStatements) expect(row.finalized).toHaveBeenCalledTimes(1)
  } finally {
    spy.mockRestore()
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
