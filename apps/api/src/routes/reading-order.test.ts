import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage, type Storage } from "@adt/storage"
import { READING_ORDER_NODE, READING_ORDER_ITEM_ID } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createReadingOrderRoutes } from "./reading-order.js"

const label = "order-book"
let tmpDir: string
let app: Hono

function seed(storage: Storage) {
  for (const [pageId, pageNumber] of [
    ["pg001", 1],
    ["pg002", 2],
  ] as const) {
    storage.putExtractedPage({
      pageId,
      pageNumber,
      text: pageId,
      pageImage: {
        imageId: `${pageId}_page`,
        buffer: Buffer.from("x"),
        format: "png" as const,
        hash: pageId,
        width: 10,
        height: 10,
      },
      images: [],
    })
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "",
      sections: [1, 2].map((n) => ({
        sectionId: `${pageId}_sec00${n}`,
        sectionType: "content",
        backgroundColor: "#fff",
        textColor: "#000",
        pageNumber,
        isPruned: false,
        nodes: [],
      })),
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [0, 1].map((i) => ({
        sectionIndex: i,
        sectionType: "content",
        reasoning: "",
        html: `<section>${pageId}-${i}</section>`,
      })),
    })
  }
}

const ALL_IDS = [
  "pg001_sec001",
  "pg001_sec002",
  "pg002_sec001",
  "pg002_sec002",
]

function items(ids: string[]) {
  return ids.map((id) => ({ kind: "section" as const, id }))
}

function put(body: unknown) {
  return app.request(`/api/books/${label}/reading-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function getOrder() {
  const res = await app.request(`/api/books/${label}/reading-order`)
  return (await res.json()) as {
    version: number | null
    fromStoredOrder: boolean
    reconciled: boolean
    added: string[]
    dropped: string[]
    items: Array<{ id: string; position: number; href: string }>
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reading-order-route-"))
  const storage = createBookStorage(label, tmpDir)
  try {
    seed(storage)
  } finally {
    storage.close()
  }

  app = new Hono()
  app.onError(errorHandler)
  app.route("/api", createReadingOrderRoutes(tmpDir))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("GET /api/books/:label/reading-order", () => {
  it("returns the source-derived order when nothing has been saved", async () => {
    const body = await getOrder()
    expect(body.items.map((i) => i.id)).toEqual(ALL_IDS)
    expect(body.items.map((i) => i.position)).toEqual([1, 2, 3, 4])
    expect(body.items[0].href).toBe("pg001_sec001.html")
    expect(body.fromStoredOrder).toBe(false)
    expect(body.version).toBeNull()
    expect(body.reconciled).toBe(false)
  })

  it("returns a saved order, and reports when the book has changed under it", async () => {
    const reordered = [ALL_IDS[3], ALL_IDS[0], ALL_IDS[1], ALL_IDS[2]]
    expect((await put({ items: items(reordered) })).status).toBe(200)

    let body = await getOrder()
    expect(body.items.map((i) => i.id)).toEqual(reordered)
    expect(body.fromStoredOrder).toBe(true)
    expect(body.reconciled).toBe(false)

    // Prune a section out of the book: it leaves the output but keeps its slot.
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("page-sectioning", "pg001", {
        reasoning: "",
        sections: [1, 2].map((n) => ({
          sectionId: `pg001_sec00${n}`,
          sectionType: "content",
          backgroundColor: "#fff",
          textColor: "#000",
          pageNumber: 1,
          isPruned: n === 1,
          nodes: [],
        })),
      })
    } finally {
      storage.close()
    }

    body = await getOrder()
    expect(body.items.map((i) => i.id)).toEqual([ALL_IDS[3], ALL_IDS[1], ALL_IDS[2]])
    // Pruning is not a reading-order change — the id keeps its slot.
    expect(body.reconciled).toBe(false)
    expect(body.dropped).toEqual([])
  })
})

describe("PUT /api/books/:label/reading-order", () => {
  it("rejects an order that omits an item", async () => {
    const res = await put({ items: items(ALL_IDS.slice(0, 3)) })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("missing")
  })

  it("rejects an order containing an unknown id", async () => {
    const res = await put({ items: items([...ALL_IDS, "pg009_sec001"]) })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("not in this book")
  })

  it("rejects a duplicated id", async () => {
    const res = await put({ items: items([...ALL_IDS.slice(0, 3), ALL_IDS[0]]) })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("more than once")
  })

  it("rejects a stale write when expectedVersion does not match", async () => {
    await put({ items: items([...ALL_IDS].reverse()) })

    const stale = await put({ items: items(ALL_IDS), expectedVersion: null })
    expect(stale.status).toBe(409)

    const fresh = await put({ items: items(ALL_IDS), expectedVersion: 1 })
    expect(fresh.status).toBe(200)
  })

  it("refuses to save while a pipeline step is running", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.markStepStarted("web-rendering")
    } finally {
      storage.close()
    }

    const res = await put({ items: items([...ALL_IDS].reverse()) })
    expect(res.status).toBe(409)
  })

  it("versions each save so it can be rolled back", async () => {
    const first = [...ALL_IDS].reverse()
    expect((await put({ items: items(first) })).status).toBe(200)
    const second = [ALL_IDS[1], ALL_IDS[0], ALL_IDS[2], ALL_IDS[3]]
    expect((await put({ items: items(second) })).status).toBe(200)

    const storage = createBookStorage(label, tmpDir)
    try {
      const versions = storage.getAllNodeVersions(READING_ORDER_NODE, READING_ORDER_ITEM_ID)
      expect(versions).toHaveLength(2)

      expect(storage.setCurrentNodeVersion(READING_ORDER_NODE, READING_ORDER_ITEM_ID, 1)).toBe(true)
    } finally {
      storage.close()
    }

    expect((await getOrder()).items.map((i) => i.id)).toEqual(first)
  })

  it("invalidates the packaged bundle but not the storyboard chain", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      for (const step of ["web-rendering", "tts", "text-catalog", "package-web"]) {
        storage.markStepStarted(step)
        storage.markStepCompleted(step)
      }
    } finally {
      storage.close()
    }

    expect((await put({ items: items([...ALL_IDS].reverse()) })).status).toBe(200)

    const verify = createBookStorage(label, tmpDir)
    try {
      const steps = new Set(verify.getStepRuns().map((run) => run.step))
      // Re-package: the sequence changed.
      expect(steps.has("package-web")).toBe(false)
      // A reorder changes no text, no catalog id and no audio, so the user's
      // generated speech and catalogs must survive it.
      expect(steps.has("tts")).toBe(true)
      expect(steps.has("text-catalog")).toBe(true)
      expect(steps.has("web-rendering")).toBe(true)
    } finally {
      verify.close()
    }
  })
})
