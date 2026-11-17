import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { Hono } from "hono"
import { expect, it, vi } from "vitest"
import { createBookStorage, openBookDb, withBookWriter } from "@adt/storage"
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
        const coldPrepares = prepare.mock.calls.length
        prepare.mockClear()
        const repeated = await app.request(`/books/${label}/pages`)
        expect(await repeated.json()).toEqual(pages)
        // Unchanged reads reuse coverage; they still read live page/version data.
        expect(prepare.mock.calls.length).toBeLessThan(coldPrepares * 0.85)
      }
      // Count actual SQL prepares rather than helper calls or wall-clock timing.
      // Doubling the book must not square all-page ownership scans.
      expect(counts[1]).toBeLessThan(counts[0] * 2.5)
    } finally { prepare.mockRestore(); fs.rmSync(root, { recursive: true, force: true }) }
  })()
})

it("keeps warm page flags current across reset, rollback, raw rewrites and damaged independent metadata", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-list-memo-"))
  const storage = createBookStorage("book", root)
  const config = path.join(root, "global.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const app = new Hono().onError(errorHandler).route("/", createPageRoutes(root, "prompts", "assets/adt", config))
  const output = (id: string) => ({ sections: [{ sectionId: id + "_sec001", sectionIndex: 0, sectionType: "text", reasoning: "", html: `<section data-section-id="${id}_sec001"><p data-id="${id}_text">Text</p></section>` }] })
  const read = async () => {
    const response = await app.request("/books/book/pages")
    expect(response.status, await response.clone().text()).toBe(200)
    return await response.json() as Array<{ pageId: string; hasRendering: boolean; renderingVersion: number }>
  }
  try {
    for (const [index, id] of ["pg001", "pg002"].entries()) {
      storage.putExtractedPage({ pageId: id, pageNumber: index + 1, text: "Text", images: [], pageImage: { imageId: id + "_page", buffer: Buffer.from("image"), hash: id, format: "png", width: 10, height: 10 } })
      storage.putNodeData("page-sectioning", id, { reasoning: "", sections: [{ sectionId: id + "_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: index + 1, isPruned: false, nodes: [{ nodeId: id + "_text", role: "text", text: "Text", isPruned: false }] }] })
      storage.putNodeData("web-rendering", id, output(id))
    }
    expect((await read()).map(page => page.hasRendering)).toEqual([true, true])
    expect((await read()).map(page => page.hasRendering)).toEqual([true, true])
    storage.putNodeData("web-rendering", "pg001", null)
    expect((await read()).map(page => page.hasRendering)).toEqual([false, true])
    storage.setCurrentNodeVersion("web-rendering", "pg001", 1)
    expect((await read())[0]).toMatchObject({ hasRendering: true, renderingVersion: 1 })
    const db = openBookDb(path.join(root, "book/book.db"))
    try {
      db.run("UPDATE node_data SET data=? WHERE node='web-rendering' AND item_id='pg001' AND version=1", ["{"])
      expect((await read()).map(page => page.hasRendering)).toEqual([false, true])
      db.run("UPDATE node_data SET data=? WHERE node='web-rendering' AND item_id='pg001' AND version=1", [JSON.stringify(output("pg001"))])
    } finally { db.close() }
    storage.putNodeData("quiz-generation", "book", { quizzes: [{ quizId: "duplicate", options: [] }, { quizId: "duplicate", options: [] }] })
    expect((await read()).map(page => page.hasRendering)).toEqual([true, true])
    fs.writeFileSync(path.join(root, "book/part.json"), "{")
    expect((await read()).map(page => page.hasRendering)).toEqual([true, true])
    fs.unlinkSync(path.join(root, "book/part.json"))
    storage.putNodeData("quiz-generation", "book", { quizzes: null })
    expect((await read()).map(page => page.hasRendering)).toEqual([true, true])
  } finally { storage.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

it("does not attribute retained images through semantic fallback when positioned source JSON is unreadable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-list-positioned-"))
  const storage = createBookStorage("book", root)
  const config = path.join(root, "global.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const app = new Hono().onError(errorHandler).route("/", createPageRoutes(root, "prompts", "assets/adt", config))
  const image = (imageId: string) => ({ imageId, buffer: Buffer.from("image"), hash: imageId, format: "png" as const, width: 10, height: 10 })
  try {
    storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Text", images: [image("pg001_extra")], pageImage: image("pg001_page") })
    const source = { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "pg001_text", role: "text", text: "Text", isPruned: false }] }] }
    storage.putNodeData("page-sectioning", "pg001", source)
    storage.putNodeData("fixed-layout-sectioning", "pg001", source)
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "text", reasoning: "", html: '<section data-section-id="pg001_sec001"><img data-id="pg001_extra" src="images/pg001_extra.png"></section>' }] })
    const read = async () => {
      const response = await app.request("/books/book/pages")
      expect(response.status).toBe(200)
      return await response.json()
    }
    expect(await read()).toMatchObject([{ imageCount: 1, hasRendering: true }])
    const db = openBookDb(path.join(root, "book/book.db"))
    try {
      db.run("UPDATE node_data SET data=? WHERE node='fixed-layout-sectioning' AND item_id='pg001'", ["{"])
      expect(await read()).toMatchObject([{ imageCount: 0, hasRendering: false }])
      expect(db.get("SELECT data FROM node_data WHERE node='fixed-layout-sectioning' AND item_id='pg001'")).toEqual({ data: "{" })
      expect(storage.getLatestNodeData("page-sectioning", "pg001")?.data).toEqual(source)
    } finally { db.close() }
  } finally { storage.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
