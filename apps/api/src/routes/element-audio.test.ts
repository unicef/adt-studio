import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import { createElementAudioRoutes } from "./element-audio.js"
import { createPageRoutes } from "./pages.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
let app: Hono
const label = "audio"
const prompts = path.resolve("prompts")

function storage(): Storage {
  return createBookStorage(label, root)
}

function setRendering(
  db: Storage,
  pageId: string,
  imageIds: string[],
  pruned = false,
  textIds: string[] = [],
): void {
  const sectionId = `${pageId}_sec001`
  db.putNodeData("page-sectioning", pageId, {
    reasoning: "",
    sections: [
      {
        sectionId,
        sectionType: "images_only",
        backgroundColor: "white",
        textColor: "black",
        pageNumber: Number(pageId.replace("pg", "")),
        isPruned: pruned,
        nodes: [
          ...imageIds.map((nodeId) => ({ nodeId, role: "image", text: "", isPruned: false })),
          ...textIds.map((nodeId) => ({ nodeId, role: "body_text", text: "Text", isPruned: false })),
        ],
      },
    ],
  })
  db.putNodeData("web-rendering", pageId, {
    sections: [
      {
        sectionIndex: 0,
        sectionId,
        sectionType: "images_only",
        reasoning: "",
        html: `<section data-section-id="${sectionId}">${imageIds
          .map((imageId) => `<img data-id="${imageId}" alt="" />`)
          .join("")}${textIds
          .map((textId) => `<p data-id="${textId}">Text</p>`)
          .join("")}</section>`,
      },
    ],
  })
}

function addPage(db: Storage, pageId: string, pageNumber: number, imageIds: string[]): void {
  db.putExtractedPage({
    pageId,
    pageNumber,
    text: "",
    pageImage: {
      imageId: `${pageId}_page`,
      buffer: Buffer.from("page"),
      format: "png",
      hash: `page-${pageId}`,
      width: 100,
      height: 100,
    },
    images: imageIds.map((imageId) => ({
      imageId,
      buffer: Buffer.from(imageId),
      format: "png" as const,
      hash: imageId,
      width: 20,
      height: 20,
    })),
  })
  setRendering(db, pageId, imageIds)
}

async function get(pageId: string): Promise<{ status: number; body: any }> {
  const response = await app.request(`/books/${label}/pages/${pageId}/element-audio`)
  return { status: response.status, body: await response.json() }
}

async function put(pageId: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await app.request(`/books/${label}/pages/${pageId}/element-audio`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

/** Restore page `pg001`'s element-audio to an earlier version. */
async function restore(version: number, baseVersion: number): Promise<{ status: number; body: any }> {
  const response = await app.request(`/books/${label}/versions/element-audio/pg001/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, baseVersion }),
  })
  return { status: response.status, body: await response.json() }
}

function entry(nodeId: string, text: string, sourcePageId = "pg001") {
  return { nodeId, text, sourcePageId }
}

function texts(body: { entries: Array<{ nodeId: string; text: string }> }): Record<string, string> {
  return Object.fromEntries(body.entries.map((item) => [item.nodeId, item.text]))
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-element-audio-"))
  const db = storage()
  try {
    addPage(db, "pg001", 1, ["pg001_im001", "pg001_im002"])
    addPage(db, "pg002", 2, ["pg002_im001"])
  } finally {
    db.close()
  }

  app = new Hono()
    .use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createElementAudioRoutes(root))
    .route("/", createPageRoutes(root, prompts, path.resolve("assets")))
  app.onError(errorHandler)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("element-audio route (SPEC-0014)", () => {
  it("AC-1: GET returns an empty view for a page with no artifact", async () => {
    expect(await get("pg001")).toEqual({
      status: 200,
      body: { pageId: "pg001", versions: {}, entries: [] },
    })
  })

  it("AC-1: PUT creates a new version and GET resolves it", async () => {
    const saved = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im001", "Mago")],
    })

    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({
      pageId: "pg001",
      versions: { pg001: 1 },
      entries: [{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }],
    })

    const db = storage()
    try {
      const row = db.getLatestNodeData("element-audio", "pg001")
      expect(row?.version).toBe(1)
      expect(row?.data).toMatchObject({ entries: [{ nodeId: "pg001_im001", text: "Mago" }] })
    } finally {
      db.close()
    }
  })

  it("AC-1: a save appends a new version instead of overwriting", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    const second = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Maga")],
    })

    expect(second.status).toBe(200)
    expect(second.body.versions).toEqual({ pg001: 2 })

    const db = storage()
    try {
      expect(db.getAllNodeVersions("element-audio", "pg001").map((row) => row.version)).toEqual([1, 2])
    } finally {
      db.close()
    }
  })

  it("AC-1: a stale save merges when the other writer touched a different nodeId", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    // Another editor opened at version 1 and added im002.
    const added = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Mago"), entry("pg001_im002", "Dragón")],
    })
    expect(added.body.versions).toEqual({ pg001: 2 })

    // A stale editor at version 1 changes im001 only.
    const merged = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Maga")],
    })

    expect(merged.status).toBe(200)
    expect(merged.body.versions).toEqual({ pg001: 3 })
    expect(texts(merged.body)).toEqual({ pg001_im001: "Maga", pg001_im002: "Dragón" })
  })

  it("AC-1: a client that loaded before the row existed still merges a different image", async () => {
    // Both editors loaded when GET returned versions {}. A saves first.
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })

    // B still holds versions {} and saves a different image.
    const merged = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im002", "Dragón")],
    })

    expect(merged.status).toBe(200)
    expect(merged.body.versions).toEqual({ pg001: 2 })
    expect(texts(merged.body)).toEqual({ pg001_im001: "Mago", pg001_im002: "Dragón" })
  })

  it("AC-1: an empty baseline conflicts when the same nodeId appeared meanwhile", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })

    const conflicted = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im001", "Maga")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body).toMatchObject({
      code: "element-audio-conflict",
      versions: { pg001: 1 },
    })
  })

  it("AC-1: a stale client sending the whole array does not conflict on unchanged entries", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    await put("pg001", { versions: { pg001: 1 }, entries: [entry("pg001_im001", "Maga")] })

    // B loaded v1 and submits both entries, including the unchanged im001.
    const merged = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Mago"), entry("pg001_im002", "Dragón")],
    })

    expect(merged.status).toBe(200)
    expect(texts(merged.body)).toEqual({ pg001_im001: "Maga", pg001_im002: "Dragón" })
  })

  it("AC-1: both sides adding the same nodeId with different texts conflicts", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    await put("pg001", { versions: { pg001: 1 }, entries: [entry("pg001_im002", "Dragón")] })

    const conflicted = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im002", "Otro")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body.versions).toEqual({ pg001: 2 })
  })

  it("AC-1: the same nodeId changed on both sides returns 409 with the current versions", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    await put("pg001", { versions: { pg001: 1 }, entries: [entry("pg001_im001", "Maga")] })

    const conflicted = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Otro")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body).toMatchObject({
      code: "element-audio-conflict",
      versions: { pg001: 2 },
    })

    // The failed save wrote nothing.
    const current = await get("pg001")
    expect(current.body.entries).toEqual([
      { nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" },
    ])
    const db = storage()
    try {
      expect(db.getAllNodeVersions("element-audio", "pg001")).toHaveLength(2)
    } finally {
      db.close()
    }
  })

  it("AC-22: GET resolves a moved element by nodeId and the save merges into its authored row", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })

    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im002"])
      setRendering(db, "pg002", ["pg002_im001", "pg001_im001"])
    } finally {
      db.close()
    }

    const moved = await get("pg002")
    expect(moved.status).toBe(200)
    expect(moved.body.versions).toEqual({ pg001: 1 })
    expect(moved.body.entries).toEqual([
      { nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" },
    ])

    // The source page no longer lists the entry, but still exposes its row
    // version as the baseline for a new script on that page.
    expect(await get("pg001")).toEqual({
      status: 200,
      body: { pageId: "pg001", versions: { pg001: 1 }, entries: [] },
    })

    // Authoring under the new page must merge into the authored row, not fork.
    const saved = await put("pg002", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Maga", "pg002")],
    })
    expect(saved.status).toBe(200)
    expect(saved.body.versions).toEqual({ pg001: 2 })
    expect(saved.body.entries).toEqual([
      { nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" },
    ])

    const after = storage()
    try {
      expect(after.getNodeItemIds("element-audio")).toEqual(["pg001"])
    } finally {
      after.close()
    }
  })

  it("AC-1/R-20: a page view can carry a version for every source row", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Uno", "pg001")] })
    await put("pg002", { versions: {}, entries: [entry("pg002_im001", "Dos", "pg002")] })

    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im001", "pg002_im001"])
      setRendering(db, "pg002", [])
    } finally {
      db.close()
    }

    const view = await get("pg001")
    expect(view.status).toBe(200)
    expect(view.body.versions).toEqual({ pg001: 1, pg002: 1 })
    expect(view.body.entries).toEqual([
      { nodeId: "pg001_im001", text: "Uno", sourcePageId: "pg001" },
      { nodeId: "pg002_im001", text: "Dos", sourcePageId: "pg002" },
    ])

    const saved = await put("pg001", {
      versions: { pg001: 1, pg002: 1 },
      entries: [
        { nodeId: "pg001_im001", text: "Uno!", sourcePageId: "pg001" },
        { nodeId: "pg002_im001", text: "Dos!", sourcePageId: "pg002" },
      ],
    })

    expect(saved.status).toBe(200)
    expect(saved.body.versions).toEqual({ pg001: 2, pg002: 2 })
    expect(texts(saved.body)).toEqual({ pg001_im001: "Uno!", pg002_im001: "Dos!" })

    const after = storage()
    try {
      expect(after.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject({
        entries: [{ nodeId: "pg001_im001", text: "Uno!" }],
      })
      expect(after.getLatestNodeData("element-audio", "pg002")?.data).toMatchObject({
        entries: [{ nodeId: "pg002_im001", text: "Dos!" }],
      })
    } finally {
      after.close()
    }
  })

  it("AC-1: a conflict in one source row rolls back every row in the save", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Uno", "pg001")] })
    await put("pg002", { versions: {}, entries: [entry("pg002_im001", "Dos", "pg002")] })

    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im001", "pg002_im001"])
      setRendering(db, "pg002", [])
    } finally {
      db.close()
    }

    // Another writer moves the pg002 row to v2 before the stale save.
    await put("pg002", {
      versions: { pg002: 1 },
      entries: [entry("pg002_im001", "Dos!", "pg002")],
    })

    const conflicted = await put("pg001", {
      versions: { pg001: 1, pg002: 1 },
      entries: [
        { nodeId: "pg001_im001", text: "Uno!", sourcePageId: "pg001" },
        { nodeId: "pg002_im001", text: "Otro", sourcePageId: "pg002" },
      ],
    })

    expect(conflicted.status).toBe(409)
    const after = storage()
    try {
      expect(after.getAllNodeVersions("element-audio", "pg001")).toHaveLength(1)
      expect(after.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject({
        entries: [{ nodeId: "pg001_im001", text: "Uno" }],
      })
    } finally {
      after.close()
    }
  })

  it("AC-1: lists the page's entries in rendering order", async () => {
    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im002", "pg001_im001"])
    } finally {
      db.close()
    }

    await put("pg001", {
      versions: {},
      entries: [entry("pg001_im001", "Uno"), entry("pg001_im002", "Dos")],
    })

    expect((await get("pg001")).body.entries.map((item: { nodeId: string }) => item.nodeId)).toEqual([
      "pg001_im002",
      "pg001_im001",
    ])
  })

  it("AC-23: a pruned element keeps its row but is not shown or catalogued", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })

    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im001", "pg001_im002"], true)
    } finally {
      db.close()
    }

    expect(await get("pg001")).toEqual({
      status: 200,
      body: { pageId: "pg001", versions: { pg001: 1 }, entries: [] },
    })
  })

  it("AC-1: the page's own orphaned row is still the baseline for a new script", async () => {
    const db = storage()
    try {
      db.putNodeData("element-audio", "pg001", {
        entries: [{ nodeId: "pg999_im999", text: "Orphan" }],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    expect(await get("pg001")).toEqual({
      status: 200,
      body: { pageId: "pg001", versions: { pg001: 1 }, entries: [] },
    })

    const saved = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Mago")],
    })
    expect(saved.status).toBe(200)

    const after = storage()
    try {
      expect(after.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject({
        entries: [
          { nodeId: "pg999_im999", text: "Orphan" },
          { nodeId: "pg001_im001", text: "Mago" },
        ],
      })
    } finally {
      after.close()
    }
  })

  it("AC-23: a page without a rendering keeps its artifact row and exposes its version", async () => {
    const db = storage()
    try {
      db.putExtractedPage({
        pageId: "pg003",
        pageNumber: 3,
        text: "",
        pageImage: {
          imageId: "pg003_page",
          buffer: Buffer.from("page"),
          format: "png",
          hash: "page-pg003",
          width: 100,
          height: 100,
        },
        images: [],
      })
      db.putNodeData("element-audio", "pg003", {
        entries: [{ nodeId: "pg003_im001", text: "Mago" }],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    expect(await get("pg003")).toEqual({
      status: 200,
      body: { pageId: "pg003", versions: { pg003: 1 }, entries: [] },
    })
  })

  it("AC-1: an empty text is stored so the element can be edited again", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    const cleared = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "")],
    })

    expect(cleared.status).toBe(200)
    expect(cleared.body.entries).toEqual([
      { nodeId: "pg001_im001", text: "", sourcePageId: "pg001" },
    ])
  })

  it("AC-1: an unchanged save does not append a version", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    const unchanged = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im001", "Mago")],
    })

    expect(unchanged.status).toBe(200)
    expect(unchanged.body.versions).toEqual({ pg001: 1 })

    const db = storage()
    try {
      expect(db.getAllNodeVersions("element-audio", "pg001")).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it("AC-1: 404s an unknown page on GET and PUT", async () => {
    expect((await get("pg999")).status).toBe(404)
    expect(
      (await put("pg999", { versions: {}, entries: [entry("pg999_im001", "Mago", "pg999")] }))
        .status,
    ).toBe(404)
  })

  it("AC-1: an unknown book returns 404 without creating a book directory", async () => {
    const bare = new Hono().route("/", createElementAudioRoutes(root))
    bare.onError(errorHandler)

    const getResponse = await bare.request(`/books/unknown/pages/pg001/element-audio`)
    expect(getResponse.status).toBe(404)

    const putResponse = await bare.request(`/books/unknown/pages/pg001/element-audio`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versions: {}, entries: [] }),
    })
    expect(putResponse.status).toBe(404)
    expect(fs.existsSync(path.join(root, "unknown"))).toBe(false)
  })

  it("AC-1/A6: rejects a non-image nodeId even when it renders on the page", async () => {
    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im001", "pg001_im002"], false, ["pg001_t001"])
    } finally {
      db.close()
    }

    const textNode = await put("pg001", {
      versions: {},
      entries: [entry("pg001_t001", "Hola")],
    })
    expect(textNode.status).toBe(400)

    const absent = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im999", "Hola")],
    })
    expect(absent.status).toBe(400)
  })

  it("AC-1: an existing legacy text entry remains editable", async () => {
    const db = storage()
    try {
      setRendering(db, "pg001", ["pg001_im001", "pg001_im002"], false, ["pg001_t001"])
      db.putNodeData("element-audio", "pg001", {
        entries: [{ nodeId: "pg001_t001", text: "Old" }],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    const saved = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_t001", "New")],
    })

    expect(saved.status).toBe(200)
    expect(saved.body.entries).toEqual([
      { nodeId: "pg001_t001", text: "New", sourcePageId: "pg001" },
    ])
  })

  it("AC-1: rejects duplicate entries and a mismatched new source page", async () => {
    const duplicate = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im001", "Uno"), entry("pg001_im001", "Dos")],
    })
    expect(duplicate.status).toBe(400)

    const staleSource = await put("pg001", {
      versions: {},
      entries: [entry("pg001_im001", "Mago", "pg002")],
    })
    expect(staleSource.status).toBe(400)
  })

  it("AC-1: rejects an invalid body", async () => {
    const response = await app.request(`/books/${label}/pages/pg001/element-audio`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [] }),
    })
    expect(response.status).toBe(400)
  })

  it("AC-1: rejects invalid JSON", async () => {
    const response = await app.request(`/books/${label}/pages/pg001/element-audio`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
    expect(response.status).toBe(400)
  })

  it("AC-26: GET keeps the first duplicate and ignores a malformed entry", async () => {
    const db = storage()
    try {
      db.putNodeData("element-audio", "pg001", {
        entries: [
          { nodeId: "pg001_im001", text: "Mago" },
          { nodeId: "pg001_im001", text: "Maga" },
          { text: "missing nodeId" },
          { nodeId: "pg001_im002", text: "Dragón" },
        ],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    expect((await get("pg001")).body.entries).toEqual([
      { nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" },
      { nodeId: "pg001_im002", text: "Dragón", sourcePageId: "pg001" },
    ])
  })

  it("AC-26: a save heals a duplicate entry instead of writing an invalid artifact", async () => {
    const db = storage()
    try {
      db.putNodeData("element-audio", "pg001", {
        entries: [
          { nodeId: "pg001_im001", text: "Mago" },
          { nodeId: "pg001_im001", text: "Maga" },
        ],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    const saved = await put("pg001", {
      versions: { pg001: 1 },
      entries: [entry("pg001_im002", "Dragón")],
    })

    expect(saved.status).toBe(200)
    const after = storage()
    try {
      expect(after.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject({
        entries: [
          { nodeId: "pg001_im001", text: "Mago" },
          { nodeId: "pg001_im002", text: "Dragón" },
        ],
      })
    } finally {
      after.close()
    }
  })

  it("AC-19/AC-26: refuses to save a nodeId authored under two rows", async () => {
    const db = storage()
    try {
      db.putNodeData("element-audio", "pg001", {
        entries: [{ nodeId: "pg001_im001", text: "Mago" }],
        generatedAt: "before",
      })
      db.putNodeData("element-audio", "pg002", {
        entries: [{ nodeId: "pg001_im001", text: "Maga" }],
        generatedAt: "before",
      })
    } finally {
      db.close()
    }

    const conflicted = await put("pg001", {
      versions: { pg001: 1, pg002: 1 },
      entries: [entry("pg001_im001", "Otro")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body.code).toBe("element-audio-duplicate")
  })

  it("AC-1: restores an earlier script version without touching the tts row", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    await put("pg001", { versions: { pg001: 1 }, entries: [entry("pg001_im001", "Maga")] })

    const db = storage()
    try {
      db.putNodeData("tts", "en", {
        entries: [{ textId: "pg001_im001_audio", text: "Maga" }],
        generatedAt: "before",
      })
      db.putNodeData("accessibility-assessment", "book", { reduced: false })
    } finally {
      db.close()
    }

    const response = await restore(1, 2)
    expect(response.status).toBe(200)

    expect(await get("pg001")).toEqual({
      status: 200,
      body: {
        pageId: "pg001",
        versions: { pg001: 1 },
        entries: [{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }],
      },
    })

    const after = storage()
    try {
      expect(after.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [{ textId: "pg001_im001_audio", text: "Maga" }],
      })
      // Restore is uniform: it always invalidates accessibility-assessment.
      // That shared side effect is not the artifact's; the test records it.
      expect(after.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
    } finally {
      after.close()
    }
  })

  it("AC-1: a version the user already restored away is a conflict", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })
    await put("pg001", { versions: { pg001: 1 }, entries: [entry("pg001_im002", "Dragón")] })
    expect((await restore(1, 2)).status).toBe(200)

    // The client still holds v2, where im002 exists. Without the version guard
    // this submission would look unchanged against the abandoned v2 baseline.
    const conflicted = await put("pg001", {
      versions: { pg001: 2 },
      entries: [entry("pg001_im002", "Dragón")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body.versions).toEqual({ pg001: 1 })
  })

  it("AC-1: an unknown base version is a conflict, not a 400", async () => {
    await put("pg001", { versions: {}, entries: [entry("pg001_im001", "Mago")] })

    const conflicted = await put("pg001", {
      versions: { pg001: 5 },
      entries: [entry("pg001_im001", "Otro")],
    })

    expect(conflicted.status).toBe(409)
    expect(conflicted.body.code).toBe("element-audio-conflict")
  })
})
