import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage, type Storage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createReadingOrderRoutes } from "./reading-order.js"
import { createPageRoutes } from "./pages.js"

/**
 * What a structural edit does to a *stored* reading order.
 *
 * #660 requires clone, split, merge, cross-page merge, prune/unprune and
 * delete to "reconcile reading order without renumbering surviving IDs". The
 * reconciler is unit-tested on its own, but nothing drove the real endpoints
 * and then asked the real resolver what the order became — so the wiring
 * between them was unverified, and cross-page merge (the operation this work
 * calls its own worst case) had no coverage against the order at any level.
 *
 * Every operation here is pure storage: no LLM, no credentials, no network.
 *
 * The book is three pages of two sections each, and every test first saves a
 * custom order, because reconciling against a *stored* order is the case that
 * matters. Against the default order almost any bug still looks correct.
 */

const label = "structural-book"
let tmpDir: string
let app: Hono

const PAGES = [
  ["pg001", 1],
  ["pg002", 2],
  ["pg003", 3],
] as const

function seed(storage: Storage) {
  for (const [pageId, pageNumber] of PAGES) {
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
        nodes: [
          {
            nodeId: `${pageId}_sec00${n}_n1`,
            isPruned: false,
            role: "paragraph",
            text: `${pageId} ${n} first`,
          },
          {
            nodeId: `${pageId}_sec00${n}_n2`,
            isPruned: false,
            role: "paragraph",
            text: `${pageId} ${n} second`,
          },
        ],
      })),
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [0, 1].map((i) => ({
        sectionIndex: i,
        sectionType: "content",
        reasoning: "",
        html: `<section data-section-id="${pageId}_sec00${i + 1}">${pageId}-${i}</section>`,
      })),
    })
  }
}

/** Source order, for reference: what the book looks like before any reorder. */
const DEFAULT_IDS = [
  "pg001_sec001",
  "pg001_sec002",
  "pg002_sec001",
  "pg002_sec002",
  "pg003_sec001",
  "pg003_sec002",
]

function items(ids: string[]) {
  return ids.map((id) => ({ kind: "section" as const, id }))
}

async function saveOrder(ids: string[], expectedVersion?: number | null) {
  const res = await app.request(`/api/books/${label}/reading-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items(ids), expectedVersion }),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as { version: number }
}

async function getOrder() {
  const res = await app.request(`/api/books/${label}/reading-order`)
  expect(res.status).toBe(200)
  return (await res.json()) as {
    version: number | null
    reconciled: boolean
    added: string[]
    dropped: string[]
    items: Array<{ id: string; position: number }>
    order: Array<{ kind: string; id: string }>
  }
}

/** The full slot list, pruned and unrendered included. */
async function orderIds() {
  return (await getOrder()).order.map((entry) => entry.id)
}

/** Only the slots that produce an output page. */
async function visibleIds() {
  return (await getOrder()).items.map((entry) => entry.id)
}

function post(pathname: string, body?: unknown) {
  return app.request(`/api/books/${label}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function sectionIdsOf(pageId: string): Promise<string[]> {
  const storage = createBookStorage(label, tmpDir)
  try {
    const row = storage.getLatestNodeData("page-sectioning", pageId)
    const data = row?.data as { sections: Array<{ sectionId: string }> } | undefined
    return (data?.sections ?? []).map((s) => s.sectionId)
  } finally {
    storage.close()
  }
}

/** Source provenance that a reorder or a structural edit must never rewrite. */
async function pageProvenance() {
  const storage = createBookStorage(label, tmpDir)
  try {
    return storage.getPages().map((p) => `${p.pageId}=${String(p.pageNumber)}`)
  } finally {
    storage.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reading-order-structural-"))
  const storage = createBookStorage(label, tmpDir)
  try {
    seed(storage)
  } finally {
    storage.close()
  }

  app = new Hono()
  app.onError(errorHandler)
  app.route("/api", createReadingOrderRoutes(tmpDir))
  app.route("/api", createPageRoutes(tmpDir, tmpDir, tmpDir))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("a stored reading order survives structural edits", () => {
  it("starts from the source order when nothing is stored", async () => {
    expect(await orderIds()).toEqual(DEFAULT_IDS)
    const got = await getOrder()
    expect(got.version).toBeNull()
    expect(got.reconciled).toBe(false)
  })

  it("puts a clone directly after its original, wherever that has been moved", async () => {
    // pg003_sec001 is moved to the very front, far from its default slot.
    const custom = [
      "pg003_sec001",
      "pg001_sec001",
      "pg001_sec002",
      "pg002_sec001",
      "pg002_sec002",
      "pg003_sec002",
    ]
    await saveOrder(custom, null)

    const res = await post("/pages/pg003/sections/0/clone")
    expect(res.status).toBe(200)

    const [, cloneId] = await sectionIdsOf("pg003")
    // A fresh id, not a reuse of a sibling's.
    expect(DEFAULT_IDS).not.toContain(cloneId)

    // The clone follows the original at its *moved* position, not the end and
    // not its default neighbourhood. This is the rule that lets clone carry no
    // reading-order code of its own.
    expect(await orderIds()).toEqual([custom[0], cloneId, ...custom.slice(1)])
    // Nothing else was renumbered.
    expect(await sectionIdsOf("pg001")).toEqual(["pg001_sec001", "pg001_sec002"])
    expect(await sectionIdsOf("pg002")).toEqual(["pg002_sec001", "pg002_sec002"])
  })

  it("puts a split's second half directly after the first", async () => {
    const custom = ["pg002_sec001", ...DEFAULT_IDS.filter((id) => id !== "pg002_sec001")]
    await saveOrder(custom, null)

    const res = await post("/pages/pg002/sections/0/split", { beforeNodeIndex: 1 })
    expect(res.status).toBe(200)

    const [first, second] = await sectionIdsOf("pg002")
    // The first half keeps the original id; only the second half is new.
    expect(first).toBe("pg002_sec001")
    expect(DEFAULT_IDS).not.toContain(second)

    expect(await orderIds()).toEqual([custom[0], second, ...custom.slice(1)])
  })

  it("drops a merged-away id and leaves the survivor in its slot", async () => {
    const custom = [
      "pg002_sec002",
      "pg001_sec001",
      "pg001_sec002",
      "pg002_sec001",
      "pg003_sec001",
      "pg003_sec002",
    ]
    await saveOrder(custom, null)

    // Merge pg001_sec001 with the section after it on the same page.
    const res = await post("/pages/pg001/sections/0/merge?direction=next")
    expect(res.status).toBe(200)

    expect(await sectionIdsOf("pg001")).toEqual(["pg001_sec001"])

    const got = await getOrder()
    expect(got.order.map((e) => e.id)).toEqual([
      "pg002_sec002",
      "pg001_sec001",
      "pg002_sec001",
      "pg003_sec001",
      "pg003_sec002",
    ])
    expect(got.dropped).toEqual(["pg001_sec002"])
    expect(got.added).toEqual([])
  })

  it("keeps the target's slot through a cross-page merge", async () => {
    // The case this work calls its own worst: two pages are involved, both
    // renderings are wiped, and one id is retired.
    const custom = [
      "pg003_sec002",
      "pg001_sec001",
      "pg002_sec001",
      "pg002_sec002",
      "pg001_sec002",
      "pg003_sec001",
    ]
    await saveOrder(custom, null)

    // Merge pg001's last section forward into pg002's first.
    const res = await post("/pages/pg001/sections/1/merge-cross-page?direction=next")
    expect(res.status).toBe(200)

    expect(await sectionIdsOf("pg001")).toEqual(["pg001_sec001"])
    // The target keeps its own id — the source's is retired, not adopted.
    expect(await sectionIdsOf("pg002")).toEqual(["pg002_sec001", "pg002_sec002"])

    const got = await getOrder()
    expect(got.dropped).toEqual(["pg001_sec002"])
    // Every surviving id keeps its position relative to the others.
    expect(got.order.map((e) => e.id)).toEqual([
      "pg003_sec002",
      "pg001_sec001",
      "pg002_sec001",
      "pg002_sec002",
      "pg003_sec001",
    ])
  })

  it("retires only the deleted id on a hard delete", async () => {
    const custom = ["pg003_sec001", ...DEFAULT_IDS.filter((id) => id !== "pg003_sec001")]
    await saveOrder(custom, null)

    const res = await app.request(`/api/books/${label}/pages/pg002/sections/0`, {
      method: "DELETE",
    })
    expect(res.status).toBe(200)

    // The surviving section on that page keeps its own id rather than sliding
    // down to sec001 — renumbering here is what would silently re-point the
    // stored order at different content.
    expect(await sectionIdsOf("pg002")).toEqual(["pg002_sec002"])

    const got = await getOrder()
    expect(got.dropped).toEqual(["pg002_sec001"])
    expect(got.order.map((e) => e.id)).toEqual(custom.filter((id) => id !== "pg002_sec001"))
  })

  it("leaves source page numbers untouched through every edit", async () => {
    const before = await pageProvenance()
    await saveOrder([...DEFAULT_IDS].reverse(), null)

    await post("/pages/pg001/sections/0/clone")
    await post("/pages/pg002/sections/0/split", { beforeNodeIndex: 1 })
    await app.request(`/api/books/${label}/pages/pg003/sections/0`, { method: "DELETE" })

    expect(await pageProvenance()).toEqual(before)
  })
})

describe("removal from the book is reversible", () => {
  /** Flip `isPruned` on one section, the way the sidebar's menu does. */
  async function setPruned(pageId: string, sectionIndex: number, isPruned: boolean) {
    const storage = createBookStorage(label, tmpDir)
    let sectioning: unknown
    try {
      const row = storage.getLatestNodeData("page-sectioning", pageId)
      const data = row?.data as { reasoning: string; sections: Array<Record<string, unknown>> }
      sectioning = {
        ...data,
        sections: data.sections.map((s, i) => (i === sectionIndex ? { ...s, isPruned } : s)),
      }
    } finally {
      storage.close()
    }
    const res = await app.request(`/api/books/${label}/pages/${pageId}/storyboard`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectioning, renderingInSync: true }),
    })
    expect(res.status).toBe(200)
  }

  it("keeps a pruned section's slot inside a stored custom order, and restores it there", async () => {
    const custom = [
      "pg003_sec001",
      "pg001_sec001",
      "pg002_sec001",
      "pg001_sec002",
      "pg002_sec002",
      "pg003_sec002",
    ]
    const { version } = await saveOrder(custom, null)

    await setPruned("pg002", 0, true)

    // The slot stays exactly where the user put it...
    expect(await orderIds()).toEqual(custom)
    // ...but the page is out of the book, so it takes no reading position and
    // the pages after it move up.
    expect(await visibleIds()).toEqual(custom.filter((id) => id !== "pg002_sec001"))

    const pruned = await getOrder()
    // Pruning is not a reading-order change: nothing was added or dropped, so
    // the stored version is untouched and needs no new version.
    expect(pruned.reconciled).toBe(false)
    expect(pruned.dropped).toEqual([])
    expect(pruned.version).toBe(version)

    await setPruned("pg002", 0, false)

    // Back in the book, in the slot it never gave up.
    expect(await orderIds()).toEqual(custom)
    expect(await visibleIds()).toEqual(custom)
  })

  it("rejects a PUT that omits a pruned id", async () => {
    await saveOrder(DEFAULT_IDS, null)
    await setPruned("pg002", 0, true)

    // A client that builds its payload from what it can *see* would send only
    // the visible rows. That must fail loudly rather than silently dropping
    // the pruned page out of the book for good.
    const res = await app.request(`/api/books/${label}/reading-order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items(DEFAULT_IDS.filter((id) => id !== "pg002_sec001")) }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("pg002_sec001")
    // The stored order is unchanged.
    expect(await orderIds()).toEqual(DEFAULT_IDS)
  })
})

describe("reading-order versions can be rolled back over HTTP", () => {
  it("restores an earlier order and clears only what a reorder invalidates", async () => {
    const first = [...DEFAULT_IDS].reverse()
    const { version: v1 } = await saveOrder(first, null)
    const second = [...DEFAULT_IDS]
    await saveOrder(second, v1)
    expect(await orderIds()).toEqual(second)

    // Downstream work that a reorder must NOT destroy, and the one node it must.
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("text-catalog", "book", { entries: [] })
      storage.putNodeData("accessibility-assessment", "book", { findings: [] })
      storage.markStepCompleted("package-web")
      storage.markStepCompleted("text-catalog")
    } finally {
      storage.close()
    }

    const res = await post(`/versions/reading-order/book/restore`, { version: v1 })
    expect(res.status).toBe(200)

    expect(await orderIds()).toEqual(first)

    const after = createBookStorage(label, tmpDir)
    try {
      // The bundle and the assessment that walks it are stale...
      expect(after.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      const steps = new Set(after.getStepRuns().map((r) => r.step))
      expect(steps.has("package-web")).toBe(false)
      // ...but the generated text, and everything keyed to it, survives. A
      // drag-and-drop must not cost the user their speech and translations.
      expect(after.getLatestNodeData("text-catalog", "book")).not.toBeNull()
      expect(steps.has("text-catalog")).toBe(true)
    } finally {
      after.close()
    }
  })
})
