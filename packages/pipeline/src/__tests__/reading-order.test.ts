import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, type Storage } from "@adt/storage"
import { resolveReadingOrder, toPageEntry } from "../reading-order.js"

describe("reading-order resolver", () => {
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
    tmpDirs.length = 0
  })

  function makeStorage() {
    const booksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reading-order-"))
    tmpDirs.push(booksRoot)
    return createBookStorage("test-book", booksRoot)
  }

  function section(
    pageId: string,
    seq: number,
    overrides: { isPruned?: boolean; pageNumber?: number | null } = {}
  ) {
    return {
      sectionId: `${pageId}_sec${String(seq).padStart(3, "0")}`,
      sectionType: "content",
      backgroundColor: "#fff",
      textColor: "#000",
      pageNumber: overrides.pageNumber ?? null,
      isPruned: overrides.isPruned ?? false,
      nodes: [],
    }
  }

  function rendering(count: number) {
    return {
      sections: Array.from({ length: count }, (_, i) => ({
        sectionIndex: i,
        sectionType: "content",
        reasoning: "",
        html: `<section>${i}</section>`,
      })),
    }
  }

  /** Two pages, two sections each. Page numbers are deliberately non-sequential. */
  function seedTwoPages(storage: Storage) {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "one",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("x"),
        format: "png" as const,
        hash: "h1",
        width: 10,
        height: 10,
      },
      images: [],
    })
    storage.putExtractedPage({
      pageId: "pg002",
      pageNumber: 2,
      text: "two",
      pageImage: {
        imageId: "pg002_page",
        buffer: Buffer.from("y"),
        format: "png" as const,
        hash: "h2",
        width: 10,
        height: 10,
      },
      images: [],
    })
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "",
      sections: [section("pg001", 1, { pageNumber: 10 }), section("pg001", 2)],
    })
    storage.putNodeData("page-sectioning", "pg002", {
      reasoning: "",
      sections: [section("pg002", 1), section("pg002", 2)],
    })
    storage.putNodeData("web-rendering", "pg001", rendering(2))
    storage.putNodeData("web-rendering", "pg002", rendering(2))
  }

  function quizGeneration(quizzes: Array<{ quizId?: string; afterPageId: string }>) {
    return {
      generatedAt: "2026-01-01T00:00:00.000Z",
      language: "en",
      pagesPerQuiz: 3,
      quizzes: quizzes.map((q, i) => ({
        ...(q.quizId ? { quizId: q.quizId } : {}),
        quizIndex: i,
        afterPageId: q.afterPageId,
        pageIds: [q.afterPageId],
        question: `Q${i}`,
        options: [
          { text: "a", explanation: "" },
          { text: "b", explanation: "" },
          { text: "c", explanation: "" },
        ],
        answerIndex: 0,
        reasoning: "",
      })),
    }
  }

  it("orders pages by page_number, then sections by sectionIndex", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      const { items } = resolveReadingOrder(storage)
      expect(items.map((i) => i.id)).toEqual([
        "pg001_sec001",
        "pg001_sec002",
        "pg002_sec001",
        "pg002_sec002",
      ])
    } finally {
      storage.close()
    }
  })

  it("interleaves quizzes after the page they are anchored to", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      storage.putNodeData(
        "quiz-generation",
        "book",
        quizGeneration([{ afterPageId: "pg001" }, { afterPageId: "pg002" }])
      )

      const { items } = resolveReadingOrder(storage)
      expect(items.map((i) => i.id)).toEqual([
        "pg001_sec001",
        "pg001_sec002",
        "qz001",
        "pg002_sec001",
        "pg002_sec002",
        "qz002",
      ])
    } finally {
      storage.close()
    }
  })

  it("uses each quiz's stored id rather than its array position", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      // Stored out of id order: the quiz holding qz002 comes first in the array.
      storage.putNodeData(
        "quiz-generation",
        "book",
        quizGeneration([
          { quizId: "qz002", afterPageId: "pg001" },
          { quizId: "qz001", afterPageId: "pg002" },
        ])
      )

      const { items } = resolveReadingOrder(storage)
      expect(items.filter((i) => i.kind === "quiz").map((i) => i.id)).toEqual([
        "qz002",
        "qz001",
      ])
    } finally {
      storage.close()
    }
  })

  it("drops quiz items when quizzes are disabled", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      storage.putNodeData("quiz-generation", "book", quizGeneration([{ afterPageId: "pg001" }]))

      const { items } = resolveReadingOrder(storage, { includeQuizzes: false })
      expect(items.some((i) => i.kind === "quiz")).toBe(false)
    } finally {
      storage.close()
    }
  })

  it("omits pruned sections without disturbing the positions around them", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      storage.putNodeData("page-sectioning", "pg001", {
        reasoning: "",
        sections: [section("pg001", 1, { isPruned: true }), section("pg001", 2)],
      })

      const { items, positionById } = resolveReadingOrder(storage)
      expect(items.map((i) => i.id)).toEqual([
        "pg001_sec002",
        "pg002_sec001",
        "pg002_sec002",
      ])
      expect(positionById.get("pg001_sec002")).toBe(1)
      expect(positionById.has("pg001_sec001")).toBe(false)
    } finally {
      storage.close()
    }
  })

  it("skips rendering entries with no matching sectioning row", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      // Three rendered entries but only two sections: the third is an orphan
      // whose real sectionId is unknowable.
      storage.putNodeData("web-rendering", "pg001", rendering(3))

      const { items } = resolveReadingOrder(storage)
      expect(items.map((i) => i.id)).toEqual([
        "pg001_sec001",
        "pg001_sec002",
        "pg002_sec001",
        "pg002_sec002",
      ])
    } finally {
      storage.close()
    }
  })

  it("resolves fixed-layout books through the positioned tree", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      storage.putNodeData("fixed-layout-sectioning", "pg001", {
        reasoning: "",
        sections: [{ ...section("pg001", 7), sectionType: "fixed-layout-page" }],
      })
      storage.putNodeData("web-rendering", "pg001", rendering(1))

      const { items } = resolveReadingOrder(storage)
      expect(items.map((i) => i.id)).toEqual([
        "pg001_sec007",
        "pg002_sec001",
        "pg002_sec002",
      ])
    } finally {
      storage.close()
    }
  })

  it("carries the printed page number onto pages.json entries, and never onto quizzes", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      storage.putNodeData("quiz-generation", "book", quizGeneration([{ afterPageId: "pg001" }]))

      const entries = resolveReadingOrder(storage).items.map(toPageEntry)
      expect(entries[0]).toEqual({
        section_id: "pg001_sec001",
        href: "pg001_sec001.html",
        page_number: 10,
      })
      // pageNumber null → key omitted entirely, as pages.json has always done.
      expect(entries[1]).toEqual({
        section_id: "pg001_sec002",
        href: "pg001_sec002.html",
      })
      expect(entries[2]).toEqual({ section_id: "qz001", href: "qz001.html" })
    } finally {
      storage.close()
    }
  })

  it("numbers positions 1-based over the emitted items only", () => {
    const storage = makeStorage()
    try {
      seedTwoPages(storage)
      const { items, positionById } = resolveReadingOrder(storage)
      expect(items.map((i) => positionById.get(i.id))).toEqual([1, 2, 3, 4])
    } finally {
      storage.close()
    }
  })
})
