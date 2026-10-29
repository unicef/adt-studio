import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readBookImage } from "./conversions"
import { listPages, renderPage } from "./pages"

const { Database } = sqlite

let books: string

const links = {
  css: "/page-css?x=1",
  assets: null,
  image: (id: string) => `/page-image?image=${id}&v=1`,
}

const rendering = (sections: { sectionType: string; html: string }[]) => JSON.stringify({ sections: sections.map((s, i) => ({ sectionIndex: i, reasoning: "", ...s })) })

beforeAll(() => {
  books = fs.mkdtempSync(path.join(os.tmpdir(), "adt-dashboard-pages-"))
  const dir = path.join(books, "book")
  fs.mkdirSync(path.join(dir, "images"), { recursive: true })
  fs.writeFileSync(path.join(dir, "images", "pg001_page.png"), "page one")
  fs.writeFileSync(path.join(books, "outside.png"), "outside the conversion")
  const db = new Database(path.join(dir, "book.db"))
  db.exec("create table llm_log (id integer primary key, step text, data text)")
  db.exec("create table pages (page_id text primary key, page_number integer, text text)")
  db.exec("create table images (image_id text primary key, page_id text, path text)")
  db.exec("create table node_data (node text, item_id text, version integer, data text)")
  db.exec("create table node_current (node text, item_id text, version integer)")
  db.run("insert into pages values ('pg001', 1, ''), ('pg002', 2, ''), ('pg003', 3, '')")
  db.run("insert into images values ('pg001_page', 'pg001', 'images/pg001_page.png'), ('escape', 'pg001', '../outside.png'), ('pg001_im001', 'pg001', 'images/missing.png')")
  db.run("insert into node_data values ('web-rendering', 'pg001', 1, ?)", [rendering([{ sectionType: "old", html: "<p>old</p>" }])])
  db.run("insert into node_data values ('web-rendering', 'pg001', 2, ?)", [
    rendering([
      { sectionType: "text_only", html: '<div data-background-color="#fafafa"><img src="/api/books/book/images/pg001_im001" alt=""></div>' },
      { sectionType: "activity_quiz", html: "<p>quiz</p>" },
    ]),
  ])
  db.run("insert into node_data values ('web-rendering', 'pg001', 3, ?)", [rendering([{ sectionType: "newer-but-not-current", html: "<p>x</p>" }])])
  db.run("insert into node_current values ('web-rendering', 'pg001', 2)")
  db.run("insert into node_data values ('web-rendering', 'pg002', 1, ?)", [rendering([])])
  db.close()
})

afterAll(() => {
  fs.rmSync(books, { recursive: true, force: true })
})

describe("listPages", () => {
  it("reports the current rendering of every page", async () => {
    expect(await listPages(books, "book")).toEqual([
      { pageId: "pg001", pageNumber: 1, hasImage: true, sectionTypes: ["text_only", "activity_quiz"] },
      { pageId: "pg002", pageNumber: 2, hasImage: false, sectionTypes: [] },
      { pageId: "pg003", pageNumber: 3, hasImage: false, sectionTypes: null },
    ])
  })
})

describe("renderPage", () => {
  it("stacks the sections and points images at the dashboard", async () => {
    const html = await renderPage(books, "book", "pg001", links)
    expect(html).toContain('<link href="/page-css?x=1" rel="stylesheet">')
    expect(html).toContain('src="/page-image?image=pg001_im001&amp;v=1"')
    expect(html).toContain('style="background-color: #fafafa;"')
    expect(html).toContain("<p>quiz</p>")
    expect(html).not.toContain("<p>old</p>")
    expect(html).not.toContain("/api/books/")
  })

  it("returns null for a page without a rendering", async () => {
    expect(await renderPage(books, "book", "pg003", links)).toBeNull()
  })

  it("rejects conversion names outside the books folder", async () => {
    await expect(renderPage(books, "..", "pg001", links)).rejects.toThrow("Invalid conversion name")
  })
})

describe("readBookImage", () => {
  it("reads images inside the conversion and refuses others", async () => {
    expect((await readBookImage(books, "book", "pg001_page"))?.type).toBe("image/png")
    expect(await readBookImage(books, "book", "escape")).toBeNull()
    expect(await readBookImage(books, "book", "pg001_im001")).toBeNull()
    expect(await readBookImage(books, "book", "unknown")).toBeNull()
  })
})
