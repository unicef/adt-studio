import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { defaultFolder, listConversions, readConversion, readCover, resolveConversionDir } from "./conversions"

const { Database } = sqlite

let root: string
let books: string

function makeBook(name: string) {
  const dir = path.join(books, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.pdf`), "%PDF-1.4 test")
  fs.writeFileSync(path.join(dir, "config.yaml"), "start_page: 1\nend_page: 40\n")
  const db = new Database(path.join(dir, `${name}.db`))
  db.exec("create table step_runs (step text primary key, status text, started_at text, completed_at text, error text, message text)")
  db.exec("create table llm_log (id integer primary key autoincrement, request_id text, timestamp text, step text, item_id text, success integer, error_count integer, data text)")
  db.run("insert into step_runs values ('metadata', 'done', ?, ?, null, null)", ["2026-10-16T19:51:46.000Z", "2026-10-16T19:51:51.000Z"])
  const entry = {
    params: { requestedModel: "openai:gpt-6-luna", providerOptions: { openai: { reasoningEffort: "low" } } },
    timestamp: "2026-10-16T19:51:51.000Z",
    taskType: "metadata",
    modelId: "openai:gpt-6-luna",
    success: true,
    errorCount: 0,
    attempt: 0,
    durationMs: 5000,
    usage: { inputTokens: 9102, outputTokens: 220 },
    messages: [{ role: "user", content: "large prompt that the reader must drop" }],
  }
  db.run("insert into llm_log (timestamp, step, data) values (?, 'metadata', ?)", [entry.timestamp, JSON.stringify(entry)])
  db.close()
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-dashboard-"))
  books = path.join(root, "books")
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n")
  fs.mkdirSync(path.join(books, ".fonts-cache"), { recursive: true })
  fs.mkdirSync(path.join(books, "not-a-book"), { recursive: true })
  makeBook("book-a")
  makeBook("book-b")
  addCover("book-a")
})

function addCover(name: string) {
  const dir = path.join(books, name)
  fs.mkdirSync(path.join(dir, "images"), { recursive: true })
  fs.writeFileSync(path.join(dir, "images", "pg001_page.png"), "page one")
  fs.writeFileSync(path.join(dir, "images", "pg002_page.png"), "page two")
  const db = new Database(path.join(dir, `${name}.db`))
  db.exec("create table pages (page_id text primary key, page_number integer)")
  db.exec("create table images (image_id text primary key, path text)")
  db.exec("create table node_data (node text, item_id text, version integer, data text)")
  db.run("insert into pages values ('pg001', 1), ('pg002', 2)")
  db.run("insert into images values ('pg001_page', 'images/pg001_page.png'), ('pg002_page', 'images/pg002_page.png')")
  db.run("insert into node_data values ('metadata', 'book', 1, ?)", [JSON.stringify({ cover_page_number: 2 })])
  db.close()
}

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("listConversions", () => {
  it("finds the books folder inside a project folder", async () => {
    const listing = await listConversions(root)
    expect(listing.booksDir).toBe(books)
    expect(listing.conversions.map((c) => c.name).sort()).toEqual(["book-a", "book-b"])
  })

  it("accepts the books folder itself", async () => {
    const listing = await listConversions(books)
    expect(listing.booksDir).toBe(books)
    expect(listing.conversions).toHaveLength(2)
  })

  it("accepts a single book folder", async () => {
    const listing = await listConversions(path.join(books, "book-a"))
    expect(listing.booksDir).toBe(books)
    expect(listing.conversions.map((c) => c.name)).toEqual(["book-a"])
  })

  it("rejects a folder that does not exist", async () => {
    await expect(listConversions(path.join(root, "missing"))).rejects.toThrow("Folder not found")
  })

  it("walks up to the project folder for the default", () => {
    expect(defaultFolder(path.join(books, "book-a"))).toBe(root)
  })
})

describe("readConversion", () => {
  it("reads the database read-only and returns its metrics", async () => {
    const summary = await readConversion(books, "book-a", "short")
    expect(summary.config).toContain("end_page: 40")
    expect(summary.pdfHash).toMatch(/^[0-9a-f]{64}$/)
    expect(summary.metrics).toMatchObject({
      callCount: 1,
      inputTokens: 9102,
      outputTokens: 220,
      models: ["gpt-6-luna"],
      efforts: ["low"],
      priceTier: "short",
      unpricedCalls: 0,
    })
    expect(summary.metrics.costUsd).toBeCloseTo((9102 * 0.1 + 220 * 0.5) / 1_000_000)
    expect(summary.metrics.steps.map((s) => s.step)).toEqual(["metadata"])
  })

  it("refuses names that leave the books folder", () => {
    expect(() => resolveConversionDir(books, "..")).toThrow("Invalid conversion name")
    expect(() => resolveConversionDir(books, "../book-a")).toThrow("Invalid conversion name")
    expect(() => resolveConversionDir(books, "book-a/sub")).toThrow("Invalid conversion name")
  })
})

describe("readCover", () => {
  it("serves the page chosen as cover in the book metadata", async () => {
    const cover = await readCover(books, "book-a")
    expect(cover?.type).toBe("image/png")
    expect(cover?.bytes.toString()).toBe("page two")
  })

  it("returns null when the book has no page images", async () => {
    expect(await readCover(books, "book-b")).toBeNull()
  })
})
