import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { Hono } from "hono"

// Pass-through storage, except it can fail image-filtering writes on demand —
// the step after the image row is written in an `addToPage` upload.
const failures = vi.hoisted(() => ({ imageListWrite: false }))
vi.mock("@adt/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@adt/storage")>()
  return {
    ...original,
    createBookStorage: (...args: Parameters<typeof original.createBookStorage>) => {
      const storage = original.createBookStorage(...args)
      return new Proxy(storage, {
        get(target, prop, receiver) {
          if (prop === "putNodeData") {
            return (node: string, itemId: string, data: unknown) => {
              if (failures.imageListWrite && node === "image-filtering") throw new Error("image list write failed")
              return target.putNodeData(node, itemId, data)
            }
          }
          return Reflect.get(target, prop, receiver)
        },
      })
    },
  }
})

const { createBookStorage, openBookDb } = await import("@adt/storage")
const { errorHandler } = await import("../middleware/error-handler.js")
const { createPageRoutes } = await import("./pages.js")

const label = "add-book"
const p1 = `${label}_p1`
const p2 = `${label}_p2`
// Minimal PNG header: 2×2.
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02,
  0x00, 0x00, 0x00, 0x02,
  0x08, 0x02, 0x00, 0x00, 0x00,
  0xfd, 0xd4, 0x9a, 0x73,
])

describe("addToPage on the crop/upload routes", () => {
  let tmpDir: string
  let app: Hono

  beforeEach(() => {
    failures.imageListWrite = false
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-add-to-page-"))
    const globalConfigPath = path.join(tmpDir, "global-config.yaml")
    fs.writeFileSync(globalConfigPath, "structure_types: {}\nrole_types: {}\n")
    const storage = createBookStorage(label, tmpDir)
    try {
      for (const [pageId, pageNumber] of [[p1, 1], [p2, 2]] as const) {
        storage.putExtractedPage({
          pageId,
          pageNumber,
          text: "",
          pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png", hash: pageId, width: 800, height: 600 },
          images: [],
        })
      }
      // Only page 1 has been through image filtering.
      storage.putNodeData("image-filtering", p1, { images: [{ imageId: `${p1}_page`, isPruned: true, reason: "full-page render" }] })
    } finally {
      storage.close()
    }
    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createPageRoutes(tmpDir, tmpDir, tmpDir, globalConfigPath))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function post(route: "crop" | "upload", pageId: string, addToPage = true) {
    const form = new FormData()
    form.append("image", new Blob([png], { type: "image/png" }), "image.png")
    form.append("pageId", pageId)
    if (route === "crop") form.append("sourceImageId", pageId)
    if (addToPage) form.append("addToPage", "true")
    return app.request(`/api/books/${label}/images${route === "upload" ? "/upload" : ""}`, { method: "POST", body: form })
  }

  function imageList(pageId: string) {
    const storage = createBookStorage(label, tmpDir)
    try {
      return storage.getLatestNodeData("image-filtering", pageId)
    } finally {
      storage.close()
    }
  }

  function imageRows() {
    const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
    try {
      return (db.all("SELECT image_id FROM images WHERE source IN ('crop', 'upload') ORDER BY image_id") as Array<{ image_id: string }>)
        .map((row) => row.image_id)
    } finally {
      db.close()
    }
  }

  const imageFile = (name: string) => path.join(tmpDir, label, "images", `${name}.png`)

  it.each([
    ["crop", `${p1}_crop1`],
    ["upload", `${p1}_upload1`],
  ] as const)("%s: creates the image and adds it, unpruned, as a new image-filtering version", async (route, expectedId) => {
    const res = await post(route, p1)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imageId: expectedId, width: 2, height: 2, imageFilteringVersion: 2 })
    expect(imageList(p1)).toEqual({
      version: 2,
      data: { images: [{ imageId: `${p1}_page`, isPruned: true, reason: "full-page render" }, { imageId: expectedId, isPruned: false }] },
    })
    expect(imageRows()).toEqual([expectedId])
    expect(fs.existsSync(imageFile(expectedId))).toBe(true)
  })

  it.each(["crop", "upload"] as const)("%s: refuses a page with no image list before writing anything", async (route) => {
    const res = await post(route, p2)
    expect(res.status).toBe(409)
    expect(imageRows()).toEqual([])
    expect(fs.readdirSync(path.join(tmpDir, label, "images")).filter((f) => f.includes("_crop") || f.includes("_upload"))).toEqual([])
  })

  it.each([
    ["crop", `${p1}_crop1`],
    ["upload", `${p1}_upload1`],
  ] as const)("%s: removes the new image when adding it to the page fails, so a retry reuses the id", async (route, expectedId) => {
    failures.imageListWrite = true
    const failed = await post(route, p1)
    expect(failed.status).toBe(500)
    expect(imageRows()).toEqual([])
    expect(fs.existsSync(imageFile(expectedId))).toBe(false)
    expect(imageList(p1)?.version).toBe(1)

    failures.imageListWrite = false
    const retried = await post(route, p1)
    expect(retried.status).toBe(200)
    expect((await retried.json()).imageId).toBe(expectedId)
    expect(imageRows()).toEqual([expectedId])
    expect(imageList(p1)?.version).toBe(2)
  })

  it.each(["crop", "upload"] as const)("%s: without addToPage, leaves the page's image list alone", async (route) => {
    const res = await post(route, p1, false)
    expect(res.status).toBe(200)
    expect((await res.json()).imageFilteringVersion).toBeUndefined()
    expect(imageList(p1)?.version).toBe(1)
  })
})
