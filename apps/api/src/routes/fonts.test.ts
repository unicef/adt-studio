import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { createFontRoutes } from "./fonts.js"

let tmpDir: string
let promptsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-fonts-route-"))
  promptsDir = path.join(tmpDir, "prompts")
  fs.mkdirSync(promptsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.close()
  fs.writeFileSync(path.join(bookDir, `${label}.pdf`), "fake pdf")
}

function buildMinimalTtf(family: string, license?: string): Buffer {
  const utf16 = (s: string) => {
    const b = Buffer.alloc(s.length * 2)
    for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2)
    return b
  }
  const entries: Array<[number, Buffer]> = [[1, utf16(family)]]
  if (license) entries.push([13, utf16(license)])

  const nameHeader = Buffer.alloc(6)
  nameHeader.writeUInt16BE(0, 0)
  nameHeader.writeUInt16BE(entries.length, 2)
  nameHeader.writeUInt16BE(6 + entries.length * 12, 4)
  const records: Buffer[] = []
  const strings: Buffer[] = []
  let offset = 0
  for (const [nameId, bytes] of entries) {
    const rec = Buffer.alloc(12)
    rec.writeUInt16BE(3, 0)
    rec.writeUInt16BE(1, 2)
    rec.writeUInt16BE(0x409, 4)
    rec.writeUInt16BE(nameId, 6)
    rec.writeUInt16BE(bytes.length, 8)
    rec.writeUInt16BE(offset, 10)
    records.push(rec)
    strings.push(bytes)
    offset += bytes.length
  }
  const nameTable = Buffer.concat([nameHeader, ...records, ...strings])

  const header = Buffer.alloc(12)
  header.writeUInt32BE(0x00010000, 0)
  header.writeUInt16BE(1, 4)
  const tableRec = Buffer.alloc(16)
  tableRec.write("name", 0, 4, "latin1")
  tableRec.writeUInt32BE(12 + 16, 8)
  tableRec.writeUInt32BE(nameTable.length, 12)
  return Buffer.concat([header, tableRec, nameTable])
}

function uploadRequest(label: string, fileName: string, bytes: Buffer): Request {
  const formData = new FormData()
  formData.append("fonts", new File([new Uint8Array(bytes)], fileName))
  return new Request(`http://localhost/books/${label}/fonts`, {
    method: "POST",
    body: formData,
  })
}

describe("GET /books/:label/fonts", () => {
  it("returns an empty registry with the current book font for a new book", async () => {
    createTestBook("fresh")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/fresh/fonts")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      version: number
      fonts: unknown[]
      assignment: unknown
      current: { detectedCategory: string | null; setting: string; font: { family: string } }
    }
    expect(body.version).toBe(0)
    expect(body.fonts).toEqual([])
    expect(body.assignment).toBeNull()
    expect(body.current.detectedCategory).toBeNull()
    expect(body.current.setting).toBe("auto")
    expect(body.current.font.family).toBe("Merriweather")
  })

  it("reflects the detected font profile in current", async () => {
    createTestBook("profiled")
    const db = openBookDb(path.join(tmpDir, "profiled", "profiled.db"))
    db.run("INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)", [
      "font-profile",
      "book",
      1,
      JSON.stringify({ category: "sans", serifChars: 10, sansChars: 90 }),
    ])
    db.close()
    const app = createFontRoutes(tmpDir, promptsDir)
    const body = (await (await app.request("/books/profiled/fonts")).json()) as {
      current: { detectedCategory: string | null; font: { family: string; category: string } }
    }
    expect(body.current.detectedCategory).toBe("sans")
    expect(body.current.font.category).toBe("sans")
  })
})

describe("POST /books/:label/fonts", () => {
  it("rejects non-font files by magic bytes", async () => {
    createTestBook("reject")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request(
      uploadRequest("reject", "evil.ttf", Buffer.from("#!/bin/sh rm -rf /")),
    )
    expect(res.status).toBe(400)
  })

  it("rejects requests without files", async () => {
    createTestBook("empty")
    const app = createFontRoutes(tmpDir, promptsDir)
    const formData = new FormData()
    const res = await app.request(`http://localhost/books/empty/fonts`, {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it("stores a valid font, parses its family, and versions the registry", async () => {
    createTestBook("ok")
    const app = createFontRoutes(tmpDir, promptsDir)

    const res = await app.request(uploadRequest("ok", "anything.ttf", buildMinimalTtf("Minha Fonte")))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      version: number
      fonts: Array<{ id: string; family: string; source: string; cached: boolean; faces: unknown[] }>
    }
    expect(body.version).toBe(1)
    expect(body.fonts).toHaveLength(1)
    expect(body.fonts[0]).toMatchObject({
      id: "minha-fonte",
      family: "Minha Fonte",
      source: "upload",
      cached: true,
    })
    expect(fs.existsSync(path.join(tmpDir, "ok", "fonts", "minha-fonte-400.ttf"))).toBe(true)

    const res2 = await app.request(uploadRequest("ok", "again.ttf", buildMinimalTtf("Minha Fonte")))
    const body2 = (await res2.json()) as { version: number; fonts: unknown[] }
    expect(body2.version).toBe(2)
    expect(body2.fonts).toHaveLength(1)
  })

  it("marks fonts without license info as unverified", async () => {
    createTestBook("nolicense")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request(uploadRequest("nolicense", "f.ttf", buildMinimalTtf("Fonte")))
    const body = (await res.json()) as {
      fonts: Array<{ license?: { openSource: boolean | null; embeddingRestricted: boolean } }>
    }
    expect(body.fonts[0].license).toMatchObject({ openSource: null, embeddingRestricted: false })
  })

  it("classifies a restricted license from the name table", async () => {
    createTestBook("restricted")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request(
      uploadRequest(
        "restricted",
        "f.ttf",
        buildMinimalTtf("Fonte Paga", "Copyright 2020. All rights reserved."),
      ),
    )
    const body = (await res.json()) as {
      fonts: Array<{ license?: { openSource: boolean | null } }>
    }
    expect(body.fonts[0].license?.openSource).toBe(false)
  })

  it("marks google fonts as open source", async () => {
    createTestBook("goog")
    const cacheDir = path.join(tmpDir, ".fonts-cache", "google", "lexend")
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, "lexend-normal-400-0.woff2"), "bytes")
    fs.writeFileSync(
      path.join(cacheDir, "manifest.json"),
      JSON.stringify({
        family: "Lexend",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        faces: [{ file: "lexend-normal-400-0.woff2", weight: 400, style: "normal", format: "woff2" }],
      }),
    )
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request(`http://localhost/books/goog/fonts/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family: "Lexend" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      fonts: Array<{ license?: { openSource: boolean | null } }>
    }
    expect(body.fonts[0].license?.openSource).toBe(true)
  })
})

describe("DELETE /books/:label/fonts/:id", () => {
  it("removes the font and its uploaded files", async () => {
    createTestBook("del")
    const app = createFontRoutes(tmpDir, promptsDir)
    await app.request(uploadRequest("del", "f.ttf", buildMinimalTtf("Apagar")))

    const res = await app.request("/books/del/fonts/apagar", { method: "DELETE" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fonts: unknown[] }
    expect(body.fonts).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, "del", "fonts", "apagar-400.ttf"))).toBe(false)
  })

  it("404s for unknown fonts", async () => {
    createTestBook("del404")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/del404/fonts/nope", { method: "DELETE" })
    expect(res.status).toBe(404)
  })
})

describe("PATCH /books/:label/fonts/:id", () => {
  it("pins a role and survives as a new registry version", async () => {
    createTestBook("patch")
    const app = createFontRoutes(tmpDir, promptsDir)
    await app.request(uploadRequest("patch", "f.ttf", buildMinimalTtf("Pinada")))

    const res = await app.request("/books/patch/fonts/pinada", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "heading" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      version: number
      fonts: Array<{ role: string; roleLockedByUser: boolean }>
    }
    expect(body.version).toBe(2)
    expect(body.fonts[0]).toMatchObject({ role: "heading", roleLockedByUser: true })
  })

  it("rejects invalid roles", async () => {
    createTestBook("badrole")
    const app = createFontRoutes(tmpDir, promptsDir)
    await app.request(uploadRequest("badrole", "f.ttf", buildMinimalTtf("Fonte")))
    const res = await app.request("/books/badrole/fonts/fonte", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "banner" }),
    })
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/fonts/:id/files/:file", () => {
  it("serves uploaded font files with the right content type", async () => {
    createTestBook("serve")
    const app = createFontRoutes(tmpDir, promptsDir)
    await app.request(uploadRequest("serve", "f.ttf", buildMinimalTtf("Servida")))

    const res = await app.request("/books/serve/fonts/servida/files/servida-400.ttf")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("font/ttf")
  })

  it("rejects path traversal in file names", async () => {
    createTestBook("trav")
    const app = createFontRoutes(tmpDir, promptsDir)
    await app.request(uploadRequest("trav", "f.ttf", buildMinimalTtf("Fonte")))
    const res = await app.request("/books/trav/fonts/fonte/files/..%2F..%2Ftrav.pdf")
    expect([400, 404]).toContain(res.status)
  })
})

describe("POST /books/:label/fonts/apply", () => {
  function seedRenderedPage(label: string, html: string): void {
    const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
    db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", ["pg001", 1, ""])
    db.close()
    const storage = createBookStorage(label, tmpDir)
    storage.putNodeData("web-rendering", "pg001", {
      sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "", html }],
    })
    storage.close()
  }

  function readRenderedHtml(label: string): string {
    const storage = createBookStorage(label, tmpDir)
    try {
      const row = storage.getLatestNodeData("web-rendering", "pg001")
      const data = row?.data as { sections: Array<{ html: string }> }
      return data.sections[0].html
    } finally {
      storage.close()
    }
  }

  it("removes every inline font-family for a whole-book reset", async () => {
    createTestBook("recolor")
    seedRenderedPage(
      "recolor",
      `<section><h1 style="font-family:'Nabla',serif">T</h1><p style="font-family:'Lora',serif">b</p></section>`,
    )
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/recolor/fonts/apply", {
      method: "POST",
      body: JSON.stringify({ scope: "whole", reset: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { pagesUpdated: number }
    expect(body.pagesUpdated).toBe(1)
    expect(readRenderedHtml("recolor")).not.toContain("font-family")
  })

  it("sets a built-in font on headings and leaves body untouched", async () => {
    createTestBook("headset")
    seedRenderedPage("headset", `<section><h2 data-id="t1">T</h2><p data-id="t2">b</p></section>`)
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/headset/fonts/apply", {
      method: "POST",
      body: JSON.stringify({ scope: "heading", font: { kind: "reflowable", id: "lexend" } }),
    })
    expect(res.status).toBe(200)
    const html = readRenderedHtml("headset")
    expect(html).toMatch(/<h2[^>]*font-family[^>]*Lexend/)
    expect(html).not.toMatch(/<p[^>]*font-family/)
  })

  it("sets a built-in font on paragraphs only", async () => {
    createTestBook("parascope")
    seedRenderedPage(
      "parascope",
      `<section><h2 data-id="t1">T</h2><p data-id="t2">b</p><ul><li>item</li></ul></section>`,
    )
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/parascope/fonts/apply", {
      method: "POST",
      body: JSON.stringify({ scope: "paragraph", font: { kind: "reflowable", id: "lexend" } }),
    })
    expect(res.status).toBe(200)
    const html = readRenderedHtml("parascope")
    expect(html).toMatch(/<p[^>]*font-family[^>]*Lexend/)
    expect(html).not.toMatch(/<h2[^>]*font-family/)
    expect(html).not.toMatch(/<li[^>]*font-family/)
  })

  it("rejects an unknown scope", async () => {
    createTestBook("badscope")
    const app = createFontRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/badscope/fonts/apply", {
      method: "POST",
      body: JSON.stringify({ scope: "nope", reset: true }),
    })
    expect(res.status).toBe(400)
  })
})
