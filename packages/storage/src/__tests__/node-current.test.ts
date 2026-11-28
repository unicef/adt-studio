import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "../db.js"
import { CURRENT_VERSION_ORDER, readCurrentNodeRow, readCurrentNodeRows } from "../node-current.js"

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("bulk current node rows", () => {
  it.each(["web-rendering", "page-sectioning", "image-captioning", "image-filtering"])(
    "matches first-row selection without transferring unselected %s payloads", node => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-current-rows-"))
      dirs.push(dir)
      const db = openBookDb(path.join(dir, "book.db"))
      try {
        expect(readCurrentNodeRows(db, node)).toEqual([])
        const cases = [
          { id: "latest", pointer: 9, data: "{\"latest\":true}" },
          { id: "restored", pointer: 1, data: "{\"unselected\":true}" },
          { id: "legacy", pointer: undefined, data: "[]" },
          { id: "dangling", pointer: 42, data: "{}" },
          { id: "sql-null", pointer: 9, data: null },
          { id: "json-null", pointer: 9, data: "null" },
          { id: "spaced-null", pointer: 9, data: " \nnull " },
          { id: "malformed", pointer: 9, data: "{broken" },
          { id: "Case", pointer: 9, data: "{}" },
          { id: "case", pointer: 1, data: "{}" },
          { id: "%_", pointer: 9, data: JSON.stringify("x".repeat(200_000)) },
        ]
        db.run("BEGIN")
        for (const entry of cases) {
          for (const [version, data] of [[1, "{\"old\":true}"], [4, JSON.stringify("history".repeat(20_000))], [9, entry.data]] as const) {
            db.run("INSERT INTO node_data (node,item_id,version,data) VALUES (?,?,?,?)", [node, entry.id, version, data])
          }
          if (entry.pointer !== undefined) db.run("INSERT INTO node_current (node,item_id,version) VALUES (?,?,?)", [node, entry.id, entry.pointer])
        }
        db.run("INSERT INTO node_data (node,item_id,version,data) VALUES (?,?,1,?)", [node, "single", "{}"])
        db.run("INSERT INTO node_current (node,item_id,version) VALUES (?,?,1)", [node, "orphan-pointer"])
        db.run("INSERT INTO node_data (node,item_id,version,data) VALUES (?,?,99,?)", ["other-node", "latest", "{\"unrelated\":true}"])
        db.run("COMMIT")
        const all = vi.spyOn(db, "all")
        const actual = readCurrentNodeRows(db, node)
        const sql = all.mock.calls[0][0]
        const oldRows = db.all(`SELECT nd.item_id,nd.version,nd.data FROM node_data nd
          LEFT JOIN node_current nc ON nc.node=nd.node AND nc.item_id=nd.item_id
          WHERE nd.node=? ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`, [node]) as typeof actual
        const expected = oldRows.filter((row, i) => i === 0 || oldRows[i - 1].item_id !== row.item_id)
        expect(actual).toEqual(expected)
        expect(actual).toHaveLength(cases.length + 1)
        expect(oldRows).toHaveLength(cases.length * 3 + 1)
        for (const row of actual) expect(readCurrentNodeRow(db, node, row.item_id, { includeInvalidated: true }))
          .toEqual({ version: row.version, data: row.data ?? "null" })
        const plan = db.all(`EXPLAIN QUERY PLAN ${sql}`, [node]) as Array<{ detail: string }>
        expect(plan.some(row => /SEARCH chosen .*INDEX.*node=\?.*item_id=\?.*version=\?/.test(row.detail))).toBe(true)
        // No persistent payload cache: direct writes and pointer changes are
        // observed on the very next read, including a selected invalidation.
        db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=9", ["{\"edited\":true}", node, "latest"])
        expect(readCurrentNodeRows(db, node).find(row => row.item_id === "latest")?.data).toBe("{\"edited\":true}")
        db.run("UPDATE node_current SET version=1 WHERE node=? AND item_id=?", [node, "sql-null"])
        expect(readCurrentNodeRows(db, node).find(row => row.item_id === "sql-null")).toMatchObject({ version: 1, data: "{\"old\":true}" })
      } finally { db.close() }
    },
  )
})
