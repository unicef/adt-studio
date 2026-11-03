import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { Hono } from "hono"
import { expect, it, vi } from "vitest"
import { openBookDb, withBookWriter } from "@adt/storage"
import { createPageRoutes } from "./pages.js"
import { errorHandler } from "../middleware/error-handler.js"

it("page-list database work grows linearly while every valid page remains available", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-list-scaling-"))
  const config = path.join(root, "global.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const sqlite = createRequire(import.meta.url)("node-sqlite3-wasm")
  const prepare = vi.spyOn(sqlite.Database.prototype, "prepare")
  const app = new Hono().onError(errorHandler).route("/", createPageRoutes(root, "prompts", "assets/adt", config))
  const counts: number[] = []
  return (async () => {
    try {
      for (const count of [30, 60]) {
        const label = `pages-${count}`, directory = path.join(root, label)
        fs.mkdirSync(directory)
        withBookWriter(directory, () => {
          const db = openBookDb(path.join(directory, `${label}.db`))
          try {
            db.exec("BEGIN")
            for (let number = 1; number <= count; number++) {
              const id = `pg${number}`
              db.run("INSERT INTO pages (page_id,page_number,text) VALUES (?,?,?)", [id, number, "Heading"])
              const sectionId = `${id}_sec001`, nodeId = `${id}_text`
              const source = { reasoning: "", sections: [{ sectionId, sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: number, isPruned: false, nodes: [{ nodeId, role: "heading", text: "Heading", isPruned: false }] }] }
              const rendering = { sections: [{ sectionId, sectionIndex: 0, sectionType: "text", reasoning: "", html: `<section data-section-id="${sectionId}"><h1 data-id="${nodeId}">Heading</h1></section>` }] }
              for (const [node, data] of [["page-sectioning", source], ["web-rendering", rendering]]) {
                db.run("INSERT INTO node_data (node,item_id,version,data) VALUES (?,?,1,?)", [node as string, id, JSON.stringify(data)])
              }
            }
            db.exec("COMMIT")
          } finally { db.close() }
        })
        prepare.mockClear()
        const response = await app.request(`/books/${label}/pages`)
        const pages = await response.json()
        expect(response.status).toBe(200)
        expect(pages).toHaveLength(count)
        expect(pages.every((page: { hasRendering: boolean }) => page.hasRendering)).toBe(true)
        counts.push(prepare.mock.calls.length)
      }
      // Count actual SQL prepares rather than helper calls or wall-clock timing.
      // Doubling the book must not square all-page ownership scans.
      expect(counts[1]).toBeLessThan(counts[0] * 2.5)
    } finally { prepare.mockRestore(); fs.rmSync(root, { recursive: true, force: true }) }
  })()
})
