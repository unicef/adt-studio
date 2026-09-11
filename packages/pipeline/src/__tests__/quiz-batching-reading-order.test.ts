import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, type Storage } from "@adt/storage"
import type { WebRenderingOutput } from "@adt/types"
import { resolveReadingOrder, readingOrderPageIds } from "../reading-order.js"
import { getSemanticSectioning } from "../render-sectioning.js"
import { batchPages, type QuizPageInput } from "../quiz-generation.js"

/**
 * Which pages end up in a quiz together, once the book has been reordered.
 *
 * Both quiz runners — `stage-runner`'s executor and `pipeline-dag`'s — used to
 * build their input from `storage.getPages()`, which is source-PDF order, and
 * slice it into groups of N. With six pages at three per quiz reordered to
 * `F E D C B A`, the batches stayed `(A,B,C)` / `(D,E,F)` and anchored to
 * pages now sitting at reading positions 4 and 1: quizzes covering unrelated
 * content, spaced unevenly through the book.
 *
 * Generating a quiz needs an LLM, so what is pinned here is the part that
 * decides the grouping: the exact expression both executors use to turn a
 * book into batches. It is deliberately written out rather than imported,
 * because there is no shared helper — if either runner stops matching this,
 * that divergence is the bug.
 */

const label = "quiz-batching-book"
let tmpDir: string

/** Six pages, one section each, in source order pg001..pg006. */
const PAGE_IDS = ["pg001", "pg002", "pg003", "pg004", "pg005", "pg006"]

function seed(storage: Storage) {
  PAGE_IDS.forEach((pageId, i) => {
    const pageNumber = i + 1
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
      sections: [
        {
          sectionId: `${pageId}_sec001`,
          sectionType: "content",
          backgroundColor: "#fff",
          textColor: "#000",
          pageNumber,
          isPruned: false,
          nodes: [],
        },
      ],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [
        { sectionIndex: 0, sectionType: "content", reasoning: "", html: `<p>${pageId}</p>` },
      ],
    })
  })
}

/**
 * The quiz executors' page-gathering loop, verbatim in structure.
 * See `stage-runner.ts` and `pipeline-dag.ts`, executor `quiz-generation`.
 */
function gatherQuizPages(storage: Storage): QuizPageInput[] {
  const pages = readingOrderPageIds(resolveReadingOrder(storage, { includeQuizzes: false }))
  const quizPages: QuizPageInput[] = []
  for (const pageId of pages) {
    const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
    const sectioning = getSemanticSectioning(storage, pageId)
    if (!renderingRow || !sectioning) continue
    quizPages.push({
      pageId,
      rendering: renderingRow.data as WebRenderingOutput,
      sectioning,
    })
  }
  return quizPages
}

function batchIds(storage: Storage, pagesPerQuiz: number): string[][] {
  return batchPages(gatherQuizPages(storage), pagesPerQuiz).map((batch) =>
    batch.map((p) => p.pageId),
  )
}

function storeOrder(storage: Storage, pageIds: string[]) {
  storage.putNodeData("reading-order", "book", {
    schemaVersion: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: pageIds.map((pageId) => ({ kind: "section", id: `${pageId}_sec001` })),
  })
}

function withStorage<T>(fn: (storage: Storage) => T): T {
  const storage = createBookStorage(label, tmpDir)
  try {
    return fn(storage)
  } finally {
    storage.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-batching-"))
  withStorage(seed)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("quiz batching follows the reading order", () => {
  it("groups pages in source order when the book has no stored order", () => {
    expect(withStorage((s) => batchIds(s, 3))).toEqual([
      ["pg001", "pg002", "pg003"],
      ["pg004", "pg005", "pg006"],
    ])
  })

  it("groups reading-adjacent pages after a reorder, not source-adjacent ones", () => {
    // The exact case from the report: the book is reversed.
    withStorage((s) => {
      storeOrder(s, [...PAGE_IDS].reverse())
    })

    expect(withStorage((s) => batchIds(s, 3))).toEqual([
      ["pg006", "pg005", "pg004"],
      ["pg003", "pg002", "pg001"],
    ])
  })

  it("keeps a moved page with its new neighbours", () => {
    // One page moves from the end to the middle. Source order would keep it
    // batched with pg005/pg006; reading order puts it with pg002/pg003.
    withStorage((s) => {
      storeOrder(s, ["pg001", "pg002", "pg006", "pg003", "pg004", "pg005"])
    })

    expect(withStorage((s) => batchIds(s, 3))).toEqual([
      ["pg001", "pg002", "pg006"],
      ["pg003", "pg004", "pg005"],
    ])
  })

  it("leaves a page removed from the book out of every batch", () => {
    withStorage((s) => {
      storeOrder(s, [...PAGE_IDS].reverse())
      const row = s.getLatestNodeData("page-sectioning", "pg004")
      const data = row?.data as { reasoning: string; sections: Array<Record<string, unknown>> }
      s.putNodeData("page-sectioning", "pg004", {
        ...data,
        sections: data.sections.map((sec) => ({ ...sec, isPruned: true })),
      })
    })

    // pg004 is out, so the remaining five regroup — the second batch is short
    // rather than the pruned page silently occupying a slot.
    expect(withStorage((s) => batchIds(s, 3))).toEqual([
      ["pg006", "pg005", "pg003"],
      ["pg002", "pg001"],
    ])
  })
})
