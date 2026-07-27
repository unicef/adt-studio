import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { createGlossaryRoutes } from "./glossary.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-glossary-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: "Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      }),
    ]
  )
  db.close()
}

function addGlossaryData(label: string): void {
  const db = openBookDb(
    path.join(tmpDir, label, `${label}.db`)
  )
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "glossary",
      "book",
      1,
      JSON.stringify({
        items: [
          {
            word: "Forest",
            definition: "A large area with trees",
            variations: ["forests"],
            emojis: ["🌲"],
          },
        ],
        pageCount: 5,
        generatedAt: "2025-01-01T00:00:00.000Z",
      }),
    ]
  )
  db.close()
}

function addRawGlossaryData(label: string, rawData: string): void {
  const db = openBookDb(
    path.join(tmpDir, label, `${label}.db`)
  )
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    ["glossary", "book", 1, rawData]
  )
  db.close()
}

/**
 * Register page `pg001` plus the given images on it, and a completed
 * image-captioning run whose captions cover `captionedImageIds`.
 */
function addCaptionDerivedData(
  label: string,
  imageIds: string[] = [],
  captionedImageIds: string[] = [],
): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", [
    "pg001",
    1,
    "",
  ])
  for (const imageId of imageIds) {
    db.run(
      "INSERT INTO images (image_id, page_id, path, width, height, source) VALUES (?, ?, ?, ?, ?, ?)",
      [imageId, "pg001", `images/${imageId}.png`, 10, 10, "extract"],
    )
  }
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "image-captioning",
      "pg001",
      1,
      JSON.stringify({
        captions: captionedImageIds.map((imageId) => ({
          imageId,
          caption: `caption for ${imageId}`,
          decorative: false,
          source: "ai",
        })),
      }),
    ],
  )
  db.run(
    "INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'done', ?)",
    ["image-captioning", "2026-01-01T00:00:00.000Z"],
  )
  db.close()
}

/** Body for a one-term glossary carrying (or not carrying) a picture. */
function glossaryBody(imageId: string | undefined, definition = "Trees"): string {
  return JSON.stringify({
    items: [
      {
        word: "Forest",
        definition,
        variations: [],
        emojis: [],
        ...(imageId ? { imageId } : {}),
      },
    ],
    pageCount: 1,
    generatedAt: "2026-01-02T00:00:00.000Z",
  })
}

function captionRows(label: string): { nodes: unknown[]; runs: unknown[] } {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    return {
      nodes: db.all("SELECT 1 FROM node_data WHERE node = 'image-captioning'"),
      runs: db.all("SELECT 1 FROM step_runs WHERE step = 'image-captioning'"),
    }
  } finally {
    db.close()
  }
}

describe("GET /books/:label/glossary", () => {
  it("returns null when no glossary exists", async () => {
    createTestBook("no-glossary")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/no-glossary/glossary")
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("returns glossary when it exists", async () => {
    createTestBook("has-glossary")
    addGlossaryData("has-glossary")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/has-glossary/glossary")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].word).toBe("Forest")
    expect(body.pageCount).toBe(5)
  })

  it("returns 404 for missing book", async () => {
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/ghost/glossary")
    expect(res.status).toBe(404)
  })

  it("returns controlled 500 when glossary JSON is corrupted", async () => {
    createTestBook("bad-glossary-json")
    addRawGlossaryData("bad-glossary-json", "{bad json")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/bad-glossary-json/glossary")
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain("Stored glossary data is corrupted")
  })

  it("returns controlled 500 when glossary shape is invalid", async () => {
    createTestBook("bad-glossary-shape")
    addRawGlossaryData(
      "bad-glossary-shape",
      JSON.stringify({ items: [{ word: "Forest" }] })
    )
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/bad-glossary-shape/glossary")
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain("Stored glossary data is invalid")
  })

  it("returns 400 for invalid label", async () => {
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/-bad/glossary")
    expect(res.status).toBe(400)
  })
})

describe("PUT /books/:label/glossary", () => {
  it("stores manual glossary items and rebuilds text catalog", async () => {
    createTestBook("save-glossary")
    const app = createGlossaryRoutes(tmpDir)

    const res = await app.request("/books/save-glossary/glossary", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            id: "gl_manual_soil",
            source: "manual",
            word: "Soil",
            definition: "The top layer of earth",
            variations: ["soils"],
            emojis: ["🪨"],
          },
        ],
        pageCount: 0,
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    })

    expect(res.status).toBe(200)

    const glossaryRes = await app.request("/books/save-glossary/glossary")
    expect(glossaryRes.status).toBe(200)
    expect(await glossaryRes.json()).toMatchObject({
      items: [
        {
          id: "gl_manual_soil",
          source: "manual",
          word: "Soil",
        },
      ],
    })

    const db = openBookDb(path.join(tmpDir, "save-glossary", "save-glossary.db"))
    try {
      const rows = db.all(
        "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["text-catalog", "book"],
      ) as Array<{ data: string }>
      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0].data)).toMatchObject({
        entries: [
          { id: "gl_manual_soil", text: "Soil" },
          { id: "gl_manual_soil_def", text: "The top layer of earth" },
        ],
      })
    } finally {
      db.close()
    }
  })

  it("clears captions when a term gains a picture that has never been captioned", async () => {
    createTestBook("new-glossary-image")
    addRawGlossaryData("new-glossary-image", glossaryBody(undefined))
    // `uncaptioned-image` exists on pg001 but the captions run didn't cover it.
    addCaptionDerivedData("new-glossary-image", ["uncaptioned-image"], [])
    const app = createGlossaryRoutes(tmpDir)

    const res = await app.request("/books/new-glossary-image/glossary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: glossaryBody("uncaptioned-image"),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imageRequirementsChanged: true })
    expect(captionRows("new-glossary-image")).toEqual({ nodes: [], runs: [] })
  })

  it("keeps captions when the assigned picture is already captioned", async () => {
    createTestBook("captioned-glossary-image")
    addRawGlossaryData("captioned-glossary-image", glossaryBody(undefined))
    // Picking an image that already appears (and is captioned) elsewhere in the
    // book changes nothing about the captions output, so nothing is discarded.
    addCaptionDerivedData(
      "captioned-glossary-image",
      ["captioned-image"],
      ["captioned-image"],
    )
    const app = createGlossaryRoutes(tmpDir)

    const res = await app.request("/books/captioned-glossary-image/glossary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: glossaryBody("captioned-image"),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imageRequirementsChanged: false })
    const rows = captionRows("captioned-glossary-image")
    expect(rows.nodes).toHaveLength(1)
    expect(rows.runs).toHaveLength(1)
  })

  it("keeps captions when a picture is removed from a term", async () => {
    createTestBook("remove-glossary-image")
    addRawGlossaryData("remove-glossary-image", glossaryBody("captioned-image"))
    addCaptionDerivedData(
      "remove-glossary-image",
      ["captioned-image"],
      ["captioned-image"],
    )
    const app = createGlossaryRoutes(tmpDir)

    const res = await app.request("/books/remove-glossary-image/glossary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: glossaryBody(undefined),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imageRequirementsChanged: false })
    const rows = captionRows("remove-glossary-image")
    expect(rows.nodes).toHaveLength(1)
    expect(rows.runs).toHaveLength(1)
  })

  it("keeps captions when glossary edits do not touch the pictures", async () => {
    createTestBook("keep-glossary-image")
    addRawGlossaryData("keep-glossary-image", glossaryBody("captioned-image"))
    addCaptionDerivedData(
      "keep-glossary-image",
      ["captioned-image"],
      ["captioned-image"],
    )
    const app = createGlossaryRoutes(tmpDir)

    const res = await app.request("/books/keep-glossary-image/glossary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: glossaryBody("captioned-image", "A large group of trees"),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imageRequirementsChanged: false })
    const rows = captionRows("keep-glossary-image")
    expect(rows.nodes).toHaveLength(1)
    expect(rows.runs).toHaveLength(1)
  })
})
